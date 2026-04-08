import { createTool } from '@mastra/core/tools';
import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { modelSupportsImageInput } from '@/lib/model-capabilities';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import {
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  readPreviewAttachment,
  resolveWorkspaceFsPath,
  resolveWorkspaceDiskPath,
} from './local-tool-runtime';

const READ_DESCRIPTION = loadText('read.txt');

export const readTool = createTool({
  id: 'read',
  description: READ_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    filePath: z.string().min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { requestContext, workspaceRoot } = getWorkspaceFromToolContext(context, 'read');
    resolveWorkspaceFsPath(inputData.filePath);
    const { relativePath } = normalizeWorkspacePath(inputData.filePath);

    const attachment = await readPreviewAttachment(workspaceRoot, inputData.filePath);
    if (attachment) {
      const activeModel = requestContext.get('model');
      const supportsImage = modelSupportsImageInput(
        typeof activeModel === 'string' ? activeModel : undefined,
      );
      const message = attachment.mime.startsWith('image/')
        ? 'Image read successfully'
        : 'PDF read successfully';

      if (attachment.mime.startsWith('image/') && !supportsImage) {
        return {
          title: relativePath,
          output: 'Image file detected, but the current model does not support image input. Preview attachment was skipped.',
          metadata: {
            preview: message,
            filePath: relativePath,
            relativePath,
            mime: attachment.mime,
            skippedAttachment: true,
          },
        };
      }

      return {
        title: relativePath,
        output: message,
        metadata: {
          preview: message,
          filePath: relativePath,
          relativePath,
          mime: attachment.mime,
        },
        attachments: [attachment],
      };
    }

    const diskPath = resolveWorkspaceDiskPath(workspaceRoot, inputData.filePath);
    const raw = await fs.readFile(diskPath, 'utf8');
    const totalLines = raw === '' ? 0 : raw.split(/\r?\n/).length;

    return {
      title: relativePath,
      output: raw || '[file is empty]',
      metadata: {
        preview: raw || '[file is empty]',
        filePath: relativePath,
        relativePath,
        totalLines,
      },
    };
  },
});
