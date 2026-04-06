import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
} from './sandbox-helpers';
import {
  DEFAULT_TIMEOUT_MS,
  getWorkspaceFromToolContext,
  resolveWorkspaceDiskPath,
  truncateOutput,
} from './local-tool-runtime';
import { executeLocalCommand } from './local-command-exec';

const DESCRIPTION = [
  'Run a command using a Codex-style execution session.',
  'Use this as the default command tool for long-running or interactive commands.',
  'The command waits briefly for initial output, then returns either final output or a reusable session handle.',
  'If the command stays alive, the result includes a `session_id` / `sessionId` that you can reuse with `write_stdin`.',
].join('\n');

const ExecCommandInputSchema = z.object({
  cmd: z.string().min(1).optional(),
  command: z.string().min(1).optional(),
  workdir: z.string().optional(),
  timeout_ms: z.number().int().positive().optional(),
  yield_time_ms: z.number().int().min(0).max(15000).optional(),
  max_output_tokens: z.number().int().positive().optional(),
  tty: z.boolean().optional(),
  shell: z.string().optional(),
  login: z.boolean().optional(),
  run_in_background: z.boolean().optional(),
}).refine((value) => Boolean(value.cmd || value.command), {
  message: 'cmd or command is required',
});

export const execCommandTool = createTool({
  id: 'exec_command',
  description: DESCRIPTION,
  inputSchema: ExecCommandInputSchema,
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const startedAt = Date.now();
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'exec_command');
    const command = inputData.cmd?.trim() || inputData.command?.trim() || '';
    const timeout = inputData.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    const yieldTimeMs = inputData.yield_time_ms ?? 1200;
    const workdir = inputData.workdir
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.workdir)
      : workspaceRoot;

    const result = await executeLocalCommand({
      command,
      cwd: workdir,
      timeout,
      kind: 'unified-exec',
      yieldTimeMs,
    });

    const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const maxChars =
      typeof inputData.max_output_tokens === 'number'
        ? Math.max(1000, inputData.max_output_tokens * 4)
        : undefined;
    const { text: output, truncated } = truncateOutput(
      combined,
      maxChars,
    );
    const sessionId = result.sessionId;
    const wallTimeSeconds = Number((result.executionTime / 1000).toFixed(3));

    return {
      title: command,
      output,
      metadata: {
        command: result.command,
        cmd: result.command,
        cwd: workdir,
        truncated,
        success: result.success,
        state: result.state,
        runState: result.state,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        exit_code: result.exitCode,
        timedOut: result.timedOut,
        sessionId,
        session_id: sessionId,
        processId: result.processId,
        pid: result.pid,
        logPath: result.logPath,
        wallTimeSeconds,
        wall_time_seconds: wallTimeSeconds,
        executionTime: result.executionTime,
        startupDurationMs: Date.now() - startedAt,
        yield_time_ms: yieldTimeMs,
        tty: inputData.tty ?? false,
        shell: inputData.shell,
        login: inputData.login,
        metadata: result.metadata,
      },
    };
  },
});
