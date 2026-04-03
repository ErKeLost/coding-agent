import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { checkCommand } from './command-guard';
import {
  getRequestContextFromToolContext,
  resolveWorkspaceDiskPath,
} from './local-tool-runtime';
import { executeLocalCommand } from './local-command-exec';
import { resolveWorkspaceRootFromRequest } from '../workspace/local-workspace';

const timeoutSchema = z.preprocess(value => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }
  }
  return value;
}, z.number().int().positive().optional().nullable());

export const runWorkspaceCommandTool = createTool({
  id: 'runCommand',
  description:
    'Run a shell command in the current local workspace. If timeout is provided as a numeric string, it is accepted and coerced to a number automatically.',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: timeoutSchema.describe('Timeout in milliseconds'),
    cwd: z.string().optional().nullable().describe('Optional working directory override'),
    tail: z.number().int().positive().optional().nullable().describe('Reserved for compatibility'),
    background: z.boolean().optional().default(false).describe('Run in background and return a PID'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    state: z.enum(['completed', 'failed', 'running', 'timed_out']),
    exitCode: z.number().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    command: z.string(),
    executionTime: z.number().optional(),
    pid: z.string().optional(),
  }),
  execute: async (input, context) => {
    const requestContext = getRequestContextFromToolContext(context, 'runCommand');
    const workspaceRoot = resolveWorkspaceRootFromRequest(requestContext);

    const normalizedTimeout = input.timeout ?? undefined;
    const normalizedCwd = input.cwd
      ? resolveWorkspaceDiskPath(workspaceRoot, input.cwd)
      : workspaceRoot;

    // ── Command guard (Codex-style execpolicy) ───────────────────────────
    const guard = checkCommand(input.command);
    if (guard.decision === 'forbidden') {
      throw new Error(
        `[COMMAND BLOCKED] ${guard.reason} (matched rule: "${guard.matchedRule}")\n` +
        `Command was: ${input.command}\n` +
        `This command is forbidden by the Rovix execution policy. Do not retry it.`
      );
    }
    // "warn" — allow execution but prepend a warning to stdout so the agent
    // can surface it to the user without the user needing to check logs.
    const warnPrefix =
      guard.decision === 'warn'
        ? `[ROVIX WARNING] ${guard.reason}\n`
        : '';
    // ─────────────────────────────────────────────────────────────────────

    const result = await executeLocalCommand({
      command: input.command,
      cwd: normalizedCwd,
      timeout: normalizedTimeout,
      background: input.background,
      kind: 'command',
    });

    return {
      success: result.success,
      state: result.state,
      exitCode: result.exitCode,
      stdout: warnPrefix + result.stdout,
      stderr: result.stderr,
      command: result.command,
      executionTime: result.executionTime,
      pid: result.processId ?? (result.pid !== undefined ? String(result.pid) : undefined),
    };
  },
});
