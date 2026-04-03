import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import {
  DEFAULT_READ_LIMIT,
  formatLineNumberedOutput,
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  readPreviewAttachment,
  resolveWorkspaceFsPath,
} from './local-tool-runtime';

const READ_DESCRIPTION = loadText('read.txt');

export const readTool = createTool({
  id: 'read',
  description: READ_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    filePath: z.string().min(1),
    offset: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspace, workspaceRoot } = getWorkspaceFromToolContext(context, 'read');
    const filePath = resolveWorkspaceFsPath(inputData.filePath);
    const { relativePath } = normalizeWorkspacePath(inputData.filePath);

    const attachment = await readPreviewAttachment(workspaceRoot, inputData.filePath);
    if (attachment) {
      const message = attachment.mime.startsWith('image/')
        ? 'Image read successfully'
        : 'PDF read successfully';
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

    if (!workspace.filesystem) {
      throw new Error('Workspace filesystem is not available.');
    }

    const raw = await workspace.filesystem.readFile(filePath, { encoding: 'utf8' });
    if (typeof raw !== 'string') {
      throw new Error(`Cannot read binary file: ${relativePath}`);
    }

    const offset = typeof inputData.offset === 'number' ? inputData.offset : 0;
    const limit = typeof inputData.limit === 'number' ? inputData.limit : DEFAULT_READ_LIMIT;
    const { output, preview, totalLines, startLine, endLine } = formatLineNumberedOutput(
      raw,
      offset,
      limit,
    );

    return {
      title: relativePath,
      output: output || '[file is empty]',
      metadata: {
        preview: preview || '[file is empty]',
        filePath: relativePath,
        relativePath,
        totalLines,
        startLine,
        endLine,
      },
    };
  },
});
