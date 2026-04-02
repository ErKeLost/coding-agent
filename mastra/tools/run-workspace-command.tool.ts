import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { getWorkspaceForRequest } from '../workspace/local-workspace';

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
    const requestContext =
      context?.requestContext ??
      context?.runtimeContext ??
      context?.context?.requestContext ??
      context?.agent?.requestContext;

    if (!requestContext || typeof requestContext.get !== 'function') {
      throw new Error('Missing request context for runCommand.');
    }

    const workspace = getWorkspaceForRequest(requestContext);
    const sandbox = workspace.sandbox;
    if (!sandbox) {
      throw new Error('Workspace sandbox is not available.');
    }

    const normalizedTimeout = input.timeout ?? undefined;
    const normalizedCwd = input.cwd ?? undefined;

    if (input.background) {
      if (!sandbox.processes) {
        throw new Error('Background processes are not available in this workspace.');
      }

      const startedAt = Date.now();
      const handle = await sandbox.processes.spawn(input.command, {
        cwd: normalizedCwd,
        timeout: normalizedTimeout,
      });

      return {
        success: true,
        state: 'running' as const,
        command: input.command,
        executionTime: Date.now() - startedAt,
        pid: handle.pid,
        stdout: handle.stdout,
        stderr: handle.stderr,
      };
    }

    const startedAt = Date.now();
    const result = await sandbox.executeCommand?.(input.command, [], {
      cwd: normalizedCwd,
      timeout: normalizedTimeout,
    });

    if (!result) {
      throw new Error('Sandbox executeCommand is not available.');
    }

    return {
      success: result.success,
      state: result.timedOut
        ? ('timed_out' as const)
        : result.success
          ? ('completed' as const)
          : ('failed' as const),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      command: result.command ?? input.command,
      executionTime: result.executionTimeMs ?? Date.now() - startedAt,
    };
  },
});
