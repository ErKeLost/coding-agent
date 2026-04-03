import { createTool } from '@mastra/core/tools';
import { createTwoFilesPatch } from 'diff';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { normalizeLineEndings, replace } from './edit-utils';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import {
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  resolveWorkspaceDiskPath,
} from './local-tool-runtime';

const EDIT_DESCRIPTION = loadText('edit.txt');

export const editTool = createTool({
  id: 'edit',
  description: EDIT_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    filePath: z.string().min(1),
    oldString: z.string().min(1),
    newString: z.string(),
    replaceAll: z.boolean().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'edit');

    const filePath = resolveWorkspaceDiskPath(workspaceRoot, inputData.filePath);
    const { relativePath } = normalizeWorkspacePath(inputData.filePath);

    if (inputData.oldString === inputData.newString) {
      throw new Error('oldString and newString must be different');
    }

    const raw = await fs.readFile(filePath, 'utf8');
    const newContent = replace(raw, inputData.oldString, inputData.newString, inputData.replaceAll ?? false);

    await fs.writeFile(filePath, newContent, 'utf8');
    const diff = createTwoFilesPatch(
      relativePath,
      relativePath,
      normalizeLineEndings(raw),
      normalizeLineEndings(newContent),
    );

    return {
      title: relativePath,
      output: '',
      metadata: {
        diff,
        before: raw,
        after: newContent,
        filepath: relativePath,
        filePath: relativePath,
        relativePath,
        diagnostics: {},
      },
    };
  },
});
