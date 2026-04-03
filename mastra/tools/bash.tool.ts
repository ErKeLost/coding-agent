import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import { checkCommand } from './command-guard';
import {
  DEFAULT_TIMEOUT_MS,
  getWorkspaceFromToolContext,
  resolveWorkspaceDiskPath,
  truncateOutput,
} from './local-tool-runtime';

const BASH_DESCRIPTION = loadText('bash.txt');

export const bashTool = createTool({
  id: 'bash',
  description: BASH_DESCRIPTION.replaceAll('${directory}', '/workspace'),
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    command: z.string().min(1),
    timeout: z.number().int().positive().optional(),
    workdir: z.string().optional(),
    description: z.string().min(1).optional(),
    run_in_background: z.boolean().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspace, workspaceRoot } = getWorkspaceFromToolContext(context, 'bash');
    const sandbox = workspace.sandbox;
    if (!sandbox) {
      throw new Error('Workspace sandbox is not available.');
    }

    const abortSignal = context?.abortSignal;
    if (abortSignal?.aborted) throw new Error('Command aborted');
    const timeout = inputData.timeout ?? DEFAULT_TIMEOUT_MS;
    const workdir = inputData.workdir
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.workdir)
      : undefined;
    const runInBackground = inputData.run_in_background ?? false;

    const guard = checkCommand(inputData.command);
    if (guard.decision === 'forbidden') {
      throw new Error(
        `[COMMAND BLOCKED] ${guard.reason} (matched rule: "${guard.matchedRule}")\n` +
          `Command was: ${inputData.command}\n` +
          `This command is forbidden by the Rovix execution policy. Do not retry it.`,
      );
    }

    const warnPrefix =
      guard.decision === 'warn'
        ? `[ROVIX WARNING] ${guard.reason}\n`
        : '';
    const description = inputData.description?.trim() || inputData.command;

    if (runInBackground) {
      if (!sandbox.processes) {
        throw new Error('Background processes are not available in this workspace.');
      }

      const handle = await sandbox.processes.spawn(inputData.command, {
        cwd: workdir,
        timeout,
      });

      return {
        title: description,
        output: warnPrefix + (handle.stdout ?? ''),
        metadata: {
          command: inputData.command,
          description,
          pid: handle.pid,
          cwd: workdir ?? workspaceRoot,
          run_in_background: true,
          stdout: handle.stdout ?? '',
          stderr: handle.stderr ?? '',
        },
      };
    }

    const result = await sandbox.executeCommand?.(inputData.command, [], {
      cwd: workdir,
      timeout,
    });

    if (!result) {
      throw new Error('Sandbox executeCommand is not available.');
    }

    const combined = `${warnPrefix}${result.stdout ?? ''}${result.stderr ?? ''}`;
    const { text: output, truncated } = truncateOutput(combined);

    return {
      title: description,
      output,
      metadata: {
        command: result.command ?? inputData.command,
        cwd: workdir ?? workspaceRoot,
        exit: result.exitCode,
        description,
        truncated,
        timedOut: result.timedOut ?? false,
        run_in_background: false,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      },
    };
  },
});
