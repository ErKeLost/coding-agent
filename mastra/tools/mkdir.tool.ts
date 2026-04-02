import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const mkdirTool = createTool({
  id: 'mkdir',
  description: 'Create a directory in the sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    path: z.string().min(1),
    mode: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const dirPath = normalizeSandboxPath(inputData.path);
    await sandbox.fs.createFolder(dirPath, inputData.mode ?? '755');
    return {
      title: dirPath,
      output: 'Directory created',
      metadata: { path: dirPath, mode: inputData.mode ?? '755' },
    };
  },
});
