import { createTool } from '@mastra/core/tools';
import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';
import { normalizeLineEndings, replace } from './edit-utils';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import {
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  resolveWorkspaceFsPath,
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
    const { workspace } = getWorkspaceFromToolContext(context, 'edit');
    if (!workspace.filesystem) {
      throw new Error('Workspace filesystem is not available.');
    }

    const filePath = resolveWorkspaceFsPath(inputData.filePath);
    const { relativePath } = normalizeWorkspacePath(inputData.filePath);

    if (inputData.oldString === inputData.newString) {
      throw new Error('oldString and newString must be different');
    }

    const raw = await workspace.filesystem.readFile(filePath, { encoding: 'utf8' });
    if (typeof raw !== 'string') {
      throw new Error(`Cannot edit binary file: ${relativePath}`);
    }
    const newContent = replace(raw, inputData.oldString, inputData.newString, inputData.replaceAll ?? false);

    await workspace.filesystem.writeFile(filePath, newContent, {
      recursive: true,
      overwrite: true,
    });
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
        filepath: relativePath,
        filePath: relativePath,
        relativePath,
        diagnostics: {},
      },
    };
  },
});
