import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const replaceTool = createTool({
  id: 'replace',
  description: 'Replace text content in multiple files.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    files: z.array(z.string().min(1)),
    pattern: z.string().min(1),
    newValue: z.string(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const files = inputData.files.map(file => normalizeSandboxPath(file));
    const results = await sandbox.fs.replaceInFiles(files, inputData.pattern, inputData.newValue);
    const succeeded = results.filter(result => result.success).length;
    const output = `Replaced in ${succeeded}/${results.length} files.`;
    return {
      title: 'Replace complete',
      output,
      metadata: { results },
    };
  },
});
