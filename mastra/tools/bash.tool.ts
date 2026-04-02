import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  DEFAULT_TIMEOUT_MS,
  HowOneResultSchema,
  SANDBOX_ROOT,
  getSandboxIdOrThrow,
  loadText,
  normalizePackageCommand,
  normalizeSandboxPath,
  runSandboxSessionCommand,
  truncateOutput,
} from './sandbox-helpers';

const BASH_DESCRIPTION = loadText('bash.txt');

export const bashTool = createTool({
  id: 'bash',
  description: BASH_DESCRIPTION.replaceAll('${directory}', SANDBOX_ROOT),
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    command: z.string().min(1),
    timeout: z.number().int().positive().optional(),
    workdir: z.string().optional(),
    description: z.string().min(1),
    run_in_background: z.boolean().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, { abortSignal }) => {
    if (abortSignal?.aborted) throw new Error('Command aborted');
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const timeout = inputData.timeout ?? DEFAULT_TIMEOUT_MS;
    const workdir = inputData.workdir ? normalizeSandboxPath(inputData.workdir) : undefined;
    const runInBackground = inputData.run_in_background ?? false;
    const normalizedCommand = normalizePackageCommand(inputData.command);
    const devServerPattern = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?dev\b/;
    if (devServerPattern.test(normalizedCommand) && !runInBackground) {
      throw new Error('Use startDevServerAndGetUrl for dev servers.');
    }
    const { stdout, stderr, exitCode } = await runSandboxSessionCommand(
      sandboxId,
      normalizedCommand,
      workdir,
      runInBackground ? undefined : timeout,
      runInBackground,
    );
    const combined = `${stdout}${stderr}`;
    const { text: output, truncated } = truncateOutput(combined);
    const timedOut = exitCode === 124;

    return {
      title: inputData.description,
      output,
      metadata: {
        output,
        exit: exitCode,
        description: inputData.description,
        truncated,
        timedOut,
        run_in_background: runInBackground,
      },
    };
  },
});
