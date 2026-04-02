import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const mvTool = createTool({
  id: 'mv',
  description: 'Move or rename a file or directory in the sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    source: z.string().min(1),
    destination: z.string().min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const source = normalizeSandboxPath(inputData.source);
    const destination = normalizeSandboxPath(inputData.destination);
    await sandbox.fs.moveFiles(source, destination);
    return {
      title: source,
      output: destination,
      metadata: { source, destination },
    };
  },
});
