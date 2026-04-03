import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import {
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  resolveWorkspaceFsPath,
} from './local-tool-runtime';

const WRITE_DESCRIPTION = loadText('write.txt');

export const writeTool = createTool({
  id: 'write',
  description: WRITE_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    content: z.string(),
    filePath: z.string().min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspace } = getWorkspaceFromToolContext(context, 'write');
    if (!workspace.filesystem) {
      throw new Error('Workspace filesystem is not available.');
    }

    const filePath = resolveWorkspaceFsPath(inputData.filePath);
    const { relativePath } = normalizeWorkspacePath(inputData.filePath);
    const exists = await workspace.filesystem.exists(filePath);

    await workspace.filesystem.writeFile(filePath, inputData.content, {
      recursive: true,
      overwrite: true,
    });

    return {
      title: relativePath,
      output: 'Write complete',
      metadata: {
        filepath: relativePath,
        filePath: relativePath,
        relativePath,
        exists,
        diagnostics: {},
      },
    };
  },
});
