import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';
import { normalizeLineEndings, replace } from './edit-utils';
import {
  HowOneResultSchema,
  SANDBOX_ROOT,
  getSandboxIdOrThrow,
  loadText,
  normalizeSandboxPath,
  readSandboxTextFile,
  writeSandboxTextFile,
} from './sandbox-helpers';

const EDIT_DESCRIPTION = loadText('edit.txt');

export const editTool = createTool({
  id: 'edit',
  description: EDIT_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    filePath: z.string().min(1),
    oldString: z.string().min(1),
    newString: z.string(),
    replaceAll: z.boolean().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const filePath = normalizeSandboxPath(inputData.filePath);

    if (inputData.oldString === inputData.newString) {
      throw new Error('oldString and newString must be different');
    }

    const raw = await readSandboxTextFile(sandboxId, filePath);
    const newContent = replace(raw, inputData.oldString, inputData.newString, inputData.replaceAll ?? false);

    await writeSandboxTextFile(sandboxId, filePath, newContent);
    const diff = createTwoFilesPatch(
      filePath,
      filePath,
      normalizeLineEndings(raw),
      normalizeLineEndings(newContent),
    );

    return {
      title: path.posix.relative(SANDBOX_ROOT, filePath),
      output: '',
      metadata: { diff, diagnostics: {} },
    };
  },
});
