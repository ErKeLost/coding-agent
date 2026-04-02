import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const rmTool = createTool({
  id: 'rm',
  description: 'Delete a file or directory from the sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    path: z.string().min(1),
    recursive: z.boolean().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const targetPath = normalizeSandboxPath(inputData.path);
    let recursive = inputData.recursive;
    if (recursive === undefined) {
      const info = await sandbox.fs.getFileDetails(targetPath);
      recursive = info.isDir;
    }
    await sandbox.fs.deleteFile(targetPath, recursive ?? false);
    return {
      title: targetPath,
      output: 'Deleted',
      metadata: { path: targetPath, recursive: recursive ?? false },
    };
  },
});
