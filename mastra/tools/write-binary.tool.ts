import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, ensureSandboxDir, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

function extractBase64(input: { base64?: string; dataUrl?: string }) {
  if (input.base64) return { base64: input.base64, mimeType: null };
  if (!input.dataUrl) return null;
  const match = /^data:([^;]+);base64,(.+)$/.exec(input.dataUrl);
  if (!match) return null;
  return { base64: match[2], mimeType: match[1] };
}

export const writeBinaryTool = createTool({
  id: 'writeBinary',
  description: 'Write a base64-encoded file into the sandbox.',
  inputSchema: z
    .object({
      sandboxId: z.string().min(1),
      path: z.string().min(1),
      base64: z.string().optional(),
      dataUrl: z.string().optional(),
    })
    .refine(input => Boolean(input.base64 || input.dataUrl), {
      message: 'Either base64 or dataUrl must be provided.',
      path: ['base64'],
    }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const filePath = normalizeSandboxPath(inputData.path);
    const extracted = extractBase64(inputData);

    if (!extracted) {
      throw new Error('Invalid base64 or dataUrl payload.');
    }

    await ensureSandboxDir(sandboxId, filePath);
    const sandbox = await getSandboxById(sandboxId);
    const buffer = Buffer.from(extracted.base64, 'base64');

    await sandbox.fs.uploadFiles([
      {
        source: buffer,
        destination: filePath,
      },
    ]);

    return {
      title: 'Binary file written',
      output: filePath,
      metadata: {
        filepath: filePath,
        bytes: buffer.length,
        mimeType: extracted.mimeType ?? null,
      },
    };
  },
});
