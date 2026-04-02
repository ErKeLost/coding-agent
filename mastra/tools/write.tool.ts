import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
  SANDBOX_ROOT,
  getSandboxIdOrThrow,
  loadText,
  normalizeSandboxPath,
  readSandboxTextFile,
  writeSandboxTextFile,
} from './sandbox-helpers';

const WRITE_DESCRIPTION = loadText('write.txt');

export const writeTool = createTool({
  id: 'write',
  description: WRITE_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    content: z.string(),
    filePath: z.string().min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const filePath = normalizeSandboxPath(inputData.filePath);
    let exists = true;
    try {
      await readSandboxTextFile(sandboxId, filePath);
    } catch {
      exists = false;
    }

    await writeSandboxTextFile(sandboxId, filePath, inputData.content);

    return {
      title: path.posix.relative(SANDBOX_ROOT, filePath),
      output: 'Write complete',
      metadata: { filepath: filePath, exists, diagnostics: {} },
    };
  },
});
