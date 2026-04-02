import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
  applyPatchInSandbox,
  getSandboxIdOrThrow,
  loadText,
} from './sandbox-helpers';

const PATCH_DESCRIPTION = loadText('patch.txt');

export const patchTool = createTool({
  id: 'patch',
  description: PATCH_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    patchText: z.string().min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const result = await applyPatchInSandbox(sandboxId, inputData.patchText, true);
    return {
      title: 'Patch applied',
      output: result.output,
      metadata: { diff: result.diff, files: result.files },
    };
  },
});
