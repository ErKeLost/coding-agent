import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createFileUploadFormat, getSandboxById } from './daytona-client';
import { HowOneResultSchema, ensureSandboxDir, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const writeFilesTool = createTool({
  id: 'writeFiles',
  description: 'Write multiple files to the sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    files: z.array(
      z.object({
        path: z.string().min(1),
        content: z.string(),
      }),
    ),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const uploads = [];
    for (const file of inputData.files) {
      const filePath = normalizeSandboxPath(file.path);
      await ensureSandboxDir(sandboxId, filePath);
      uploads.push(createFileUploadFormat(file.content, filePath));
    }
    await sandbox.fs.uploadFiles(uploads);
    const written = uploads.map(upload => upload.destination);
    return {
      title: 'Files written',
      output: written.join('\n'),
      metadata: { files: written },
    };
  },
});
