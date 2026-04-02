import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const chmodTool = createTool({
  id: 'chmod',
  description: 'Set permissions and ownership for a file or directory.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    path: z.string().min(1),
    permissions: z.object({
      owner: z.string().optional(),
      group: z.string().optional(),
      mode: z.string().optional(),
    }),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const targetPath = normalizeSandboxPath(inputData.path);
    await sandbox.fs.setFilePermissions(targetPath, inputData.permissions);
    return {
      title: targetPath,
      output: 'Permissions updated',
      metadata: { path: targetPath, permissions: inputData.permissions },
    };
  },
});
