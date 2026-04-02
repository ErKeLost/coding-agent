import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  DEFAULT_READ_LIMIT,
  HowOneResultSchema,
  SANDBOX_ROOT,
  downloadSandboxBytes,
  formatFileOutput,
  getSandboxIdOrThrow,
  isBinaryExtension,
  isBlockedEnv,
  loadText,
  looksBinary,
  mimeFromPath,
  normalizeSandboxPath,
  readSandboxTextFile,
} from './sandbox-helpers';

const READ_DESCRIPTION = loadText('read.txt');

export const readTool = createTool({
  id: 'read',
  description: READ_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    filePath: z.string().min(1),
    offset: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const filePath = normalizeSandboxPath(inputData.filePath);

    if (isBlockedEnv(filePath)) {
      throw new Error(`The user has blocked you from reading ${filePath}, DO NOT make further attempts to read it`);
    }

    const mime = mimeFromPath(filePath);
    if (mime) {
      const bytes = await downloadSandboxBytes(sandboxId, filePath);
      const msg = mime.startsWith('image/') ? 'Image read successfully' : 'PDF read successfully';
      return {
        title: path.posix.relative(SANDBOX_ROOT, filePath),
        output: msg,
        metadata: { preview: msg },
        attachments: [
          {
            mime,
            data: `data:${mime};base64,${bytes.toString('base64')}`,
          },
        ],
      };
    }

    const raw = await readSandboxTextFile(sandboxId, filePath);
    if (isBinaryExtension(filePath) || looksBinary(raw)) {
      throw new Error(`Cannot read binary file: ${filePath}`);
    }

    const offset = inputData.offset ?? 0;
    const limit = inputData.limit ?? DEFAULT_READ_LIMIT;
    const { output, preview } = formatFileOutput(raw, offset, limit);

    return {
      title: path.posix.relative(SANDBOX_ROOT, filePath),
      output,
      metadata: { preview },
    };
  },
});
