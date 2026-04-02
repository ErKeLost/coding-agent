import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { getSandboxById } from './daytona-client';
import { buildShellCommand, compilePatterns, extractCommandResult } from './daytona-helpers';
import { normalizePackageCommand } from './sandbox-helpers';

function normalizeDevCommand(command: string) {
  const trimmed = command.trim();
  if (/^bun\s+dev\b/.test(trimmed)) {
    return trimmed.replace(/^bun\s+dev\b/, 'bun run dev');
  }
  return normalizePackageCommand(trimmed);
}

function ensureDevServerCommand(command: string, port: number) {
  const hasHost = /--host(\s|=)/.test(command);
  const hasPort = /--port(\s|=)/.test(command);
  const hasSeparator = /\s--\s/.test(command) || /\s--$/.test(command);
  let next = command;
  if (!hasHost) {
    next = hasSeparator ? `${next} --host 0.0.0.0` : `${next} -- --host 0.0.0.0`;
  }
  if (!hasPort) {
    next = hasSeparator ? `${next} --port ${port}` : `${next} -- --port ${port}`;
  }
  return next;
}

const ERROR_PATTERNS = [
  '\\berror\\b',
  '\\bfailed\\b',
  'exception',
  'unhandled',
  'internal server error',
  'transform failed',
];
const MAX_BUFFER_LINES = 200;
const ERROR_SUMMARY_LINES = 12;

function pushLine(buffer: string[], line: string) {
  buffer.push(line);
  if (buffer.length > MAX_BUFFER_LINES) {
    buffer.splice(0, buffer.length - MAX_BUFFER_LINES);
  }
}

function extractErrorSummary(lines: string[]) {
  const summary: string[] = [];
  const relevant = lines.filter((line) => {
    return (
      /:\d+:\d+:\s+ERROR:/i.test(line) ||
      /\binternal server error\b/i.test(line) ||
      /\btransform failed\b/i.test(line) ||
      /\bunexpected end of file\b/i.test(line) ||
      /\bunexpected token\b/i.test(line)
    );
  });
  for (const line of relevant.slice(-ERROR_SUMMARY_LINES)) {
    summary.push(line);
  }
  return summary;
}

export const startDevServerAndGetUrl = createTool({
  id: 'startDevServerAndGetUrl',
  description: 'Start a dev server in the sandbox and return the Daytona preview URL.',
  inputSchema: z.object({
    sandboxId: z.string().describe('Sandbox ID'),
    command: z.string().default('bun run dev').describe('Dev server command (bun run dev)'),
    port: z.number().default(5173).describe('Port for the dev server'),
    workingDirectory: z.string().optional().nullable().describe('Working directory'),
    timeoutMs: z.number().optional().describe('Timeout for the command execution in milliseconds'),
    usePty: z.boolean().optional().default(false).describe('Start the dev server in a PTY session'),
    ptyCols: z.number().optional().describe('PTY columns'),
    ptyRows: z.number().optional().describe('PTY rows'),
  }),
  outputSchema: z.object({
    url: z.string(),
    token: z.string().optional(),
    rawUrl: z.string().optional(),
    port: z.number(),
    command: z.string(),
    sessionId: z.string().optional(),
    ptySessionId: z.string().optional(),
    sessionType: z.enum(['session', 'pty']),
  }),
  execute: async (inputData, context) => {
    try {
      const writer =
        (context as { writer?: { write?: Function; custom?: Function } })?.writer ??
        (context as { context?: { writer?: { write?: Function; custom?: Function } } })
          ?.context?.writer;
      const emitStep = async (payload: {
        step: string;
        status: "start" | "done" | "error";
        message?: string;
        stdout?: string;
        stderr?: string;
        previewUrl?: string;
        durationMs?: number;
      }) => {
        if (!writer) return;
        const base = {
          type: "data-tool-progress",
          toolName: "startDevServerAndGetUrl",
          ...payload,
          data: {
            toolName: "startDevServerAndGetUrl",
            ...payload,
          },
        };
        if (typeof writer.custom === "function") {
          await writer.custom(base);
          return;
        }
        if (typeof writer.write === "function") {
          await writer.write({
            type: "custom-event",
            ...base,
          });
        }
      };
      const sandbox = await getSandboxById(inputData.sandboxId);
      const workingDirectory = inputData.workingDirectory ?? '/workspace';
      const normalized = normalizeDevCommand(inputData.command);
      const command = ensureDevServerCommand(normalized, inputData.port);
      let sessionId: string | undefined;
      let ptySessionId: string | undefined;

      await emitStep({
        step: 'prepare',
        status: 'start',
        message: `Starting dev server on port ${inputData.port}`,
      });

      if (inputData.usePty) {
        ptySessionId = `mastra-dev-pty-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const errorMatchers = compilePatterns(undefined, ERROR_PATTERNS);
        const lineBuffer: string[] = [];
        const logBuffer: string[] = [];
        let logFlushTimer: NodeJS.Timeout | undefined;
        const flushLogs = async () => {
          if (!logBuffer.length) return;
          const lines = logBuffer.splice(0, logBuffer.length);
          for (const line of lines) {
            await emitStep({
              step: 'log',
              status: 'start',
              message: line,
            });
          }
        };
        const pty = await sandbox.process.createPty({
          id: ptySessionId,
          cwd: workingDirectory,
          cols: inputData.ptyCols,
          rows: inputData.ptyRows,
          onData: (data) => {
            const text = new TextDecoder().decode(data);
            const lines = text.split(/\r?\n/);
            for (const line of lines) {
              if (!line.trim()) continue;
              pushLine(lineBuffer, line);
              logBuffer.push(line);
              if (!logFlushTimer) {
                logFlushTimer = setTimeout(() => {
                  logFlushTimer = undefined;
                  void flushLogs();
                }, 200);
              }
              if (errorMatchers.some((pattern) => pattern.test(line))) {
                const summary = extractErrorSummary(lineBuffer);
                if (summary.length > 0) {
                  console.error('[devserver error detected]');
                  console.error(summary.join('\n'));
                } else {
                  console.error('[devserver error detected]');
                  console.error(line);
                }
              }
            }
          },
        });
        await pty.waitForConnection();
        await emitStep({
          step: 'pty-ready',
          status: 'done',
          message: 'PTY connected',
        });
        await pty.sendInput(`${command}\n`);
        await emitStep({
          step: 'command',
          status: 'done',
          message: command,
        });
        await emitStep({
          step: 'prepare',
          status: 'done',
          message: 'Dev server command issued',
        });
      } else {
        const shell = buildShellCommand(command, workingDirectory, undefined);
        sessionId = `mastra-dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await sandbox.process.createSession(sessionId);
        const result = await sandbox.process.executeSessionCommand(sessionId, {
          command: shell,
          runAsync: true,
        });

        const { stderr, exitCode } = extractCommandResult(result);
        if (exitCode !== 0 && stderr) {
          await emitStep({
            step: 'spawn',
            status: 'error',
            message: stderr,
            stderr,
          });
          throw new Error(stderr);
        }
        await emitStep({
          step: 'spawn',
          status: 'done',
          message: 'Dev server process started',
        });
        await emitStep({
          step: 'prepare',
          status: 'done',
          message: 'Dev server process running',
        });
      }

      const preview = await sandbox.getPreviewLink(inputData.port);
      const token = preview.token;
      const url = token
        ? `${preview.url}${preview.url.includes('?') ? '&' : '?'}token=${token}`
        : preview.url;
      await emitStep({
        step: 'preview',
        status: 'done',
        message: 'Preview URL ready',
        previewUrl: url,
      });
      return {
        url,
        rawUrl: preview.url,
        token,
        port: inputData.port,
        command,
        sessionId,
        ptySessionId,
        sessionType: inputData.usePty ? 'pty' : 'session',
      };
    } catch (e) {
      const error = e as Error;
      const writer =
        (context as { writer?: { write?: Function; custom?: Function } })?.writer ??
        (context as { context?: { writer?: { write?: Function; custom?: Function } } })
          ?.context?.writer;
      if (writer) {
        const payload = {
          type: "data-tool-progress",
          toolName: "startDevServerAndGetUrl",
          step: "error",
          status: "error",
          message: error?.message ?? 'Failed to start dev server.',
        };
        if (typeof writer.custom === "function") {
          await writer.custom({ ...payload, data: payload });
        } else if (typeof writer.write === "function") {
          await writer.write({ type: "custom-event", ...payload, data: payload });
        }
      }
      throw new Error(error?.message ?? 'Failed to start dev server.');
    }
  },
});
