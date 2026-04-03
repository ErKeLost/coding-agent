import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { checkCommand } from './command-guard';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';
import { executeLocalCommand } from './local-command-exec';

export const unifiedExecTool = createTool({
  id: 'unified_exec',
  description: 'Run a command with structured Codex-style execution output.',
  inputSchema: z.object({
    command: z.string().min(1),
    cwd: z.string().optional().nullable(),
    timeout: z.number().int().positive().optional().nullable(),
    background: z.boolean().optional().default(false),
    tail: z.number().int().positive().optional().nullable(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    state: z.enum(['completed', 'failed', 'running', 'timed_out']),
    exitCode: z.number().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    command: z.string(),
    executionTime: z.number().optional(),
    pid: z.number().optional(),
    processId: z.string().optional(),
    logPath: z.string().optional(),
  }),
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'unified_exec');
    const cwd = inputData.cwd
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.cwd)
      : workspaceRoot;

    const guard = checkCommand(inputData.command);
    if (guard.decision === 'forbidden') {
      throw new Error(
        `[COMMAND BLOCKED] ${guard.reason} (matched rule: "${guard.matchedRule}")\n` +
          `Command was: ${inputData.command}`,
      );
    }

    const result = await executeLocalCommand({
      command: inputData.command,
      cwd,
      timeout: inputData.timeout ?? undefined,
      background: inputData.background ?? false,
      kind: 'unified-exec',
    });

    return result;
  },
});