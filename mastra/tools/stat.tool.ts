import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const statTool = createTool({
  id: 'stat',
  description: 'Get file or directory details in the sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    path: z.string().min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const targetPath = normalizeSandboxPath(inputData.path);
    const info = await sandbox.fs.getFileDetails(targetPath);
    return {
      title: targetPath,
      output: JSON.stringify(info, null, 2),
      metadata: { info },
    };
  },
});
