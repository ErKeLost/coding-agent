import { createTool } from '@mastra/core/tools';
import { createTwoFilesPatch } from 'diff';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { normalizeLineEndings } from './edit-utils';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import {
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  resolveWorkspaceDiskPath,
} from './local-tool-runtime';

const WRITE_DESCRIPTION = loadText('write.txt');

export const writeTool = createTool({
  id: 'write',
  description: WRITE_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional().describe('Optional legacy sandbox identifier.'),
    content: z.string().describe('Full file contents to write.'),
    filePath: z
      .string()
      .min(1)
      .describe('Workspace-relative file path to write. Required.'),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'write');

    const filePath = resolveWorkspaceDiskPath(workspaceRoot, inputData.filePath);
    const { relativePath } = normalizeWorkspacePath(inputData.filePath);
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    const previousContent = exists
      ? await fs.readFile(filePath, 'utf8')
      : '';

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, inputData.content, 'utf8');

    const diff = createTwoFilesPatch(
      relativePath,
      relativePath,
      normalizeLineEndings(previousContent),
      normalizeLineEndings(inputData.content),
    );

    return {
      title: relativePath,
      output: 'Write complete',
      metadata: {
        diff,
        before: previousContent,
        after: inputData.content,
        filepath: relativePath,
        filePath: relativePath,
        relativePath,
        exists,
        diagnostics: {},
      },
    };
  },
});
