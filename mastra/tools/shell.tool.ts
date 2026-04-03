import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { checkCommand } from './command-guard';
import { HowOneResultSchema } from './sandbox-helpers';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';
import { executeLocalCommand } from './local-command-exec';

export const shellTool = createTool({
  id: 'shell',
  description: 'Run a shell command in the current workspace, similar to the Codex shell handler.',
  inputSchema: z.object({
    command: z.string().min(1),
    workdir: z.string().optional(),
    timeout: z.number().int().positive().optional(),
    description: z.string().optional(),
    run_in_background: z.boolean().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'shell');
    const workdir = inputData.workdir
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.workdir)
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
      cwd: workdir,
      timeout: inputData.timeout,
      background: inputData.run_in_background ?? false,
      kind: 'shell',
    });

    return {
      title: inputData.description?.trim() || inputData.command,
      output: [result.stdout, result.stderr].filter(Boolean).join('') || result.state,
      metadata: {
        command: result.command,
        cwd: workdir,
        exit: result.exitCode,
        state: result.state,
        pid: result.pid,
        processId: result.processId,
        logPath: result.logPath,
      },
    };
  },
});