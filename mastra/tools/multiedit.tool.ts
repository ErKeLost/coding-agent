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

const MULTIEDIT_DESCRIPTION = loadText('multiedit.txt');

export const multiEditTool = createTool({
  id: 'multiedit',
  description: MULTIEDIT_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    filePath: z.string().min(1),
    edits: z.array(
      z.object({
        filePath: z.string().min(1),
        oldString: z.string().min(1),
        newString: z.string(),
        replaceAll: z.boolean().optional(),
      }),
    ),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const basePath = normalizeSandboxPath(inputData.filePath);
    const results: Array<{ diff: string; diagnostics: Record<string, unknown> }> = [];
    for (const edit of inputData.edits) {
      const filePath = normalizeSandboxPath(edit.filePath || basePath);
      const raw = await readSandboxTextFile(sandboxId, filePath);
      const next = replace(raw, edit.oldString, edit.newString, edit.replaceAll ?? false);
      await writeSandboxTextFile(sandboxId, filePath, next);
      const diff = createTwoFilesPatch(
        filePath,
        filePath,
        normalizeLineEndings(raw),
        normalizeLineEndings(next),
      );
      results.push({ diff, diagnostics: {} });
    }

    return {
      title: path.posix.relative(SANDBOX_ROOT, basePath),
      output: '',
      metadata: { results },
    };
  },
});
