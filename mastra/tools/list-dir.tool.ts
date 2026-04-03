import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema } from './sandbox-helpers';
import {
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  resolveWorkspaceDiskPath,
} from './local-tool-runtime';

export const listDirTool = createTool({
  id: 'list_dir',
  description: 'List directory contents, similar to the Codex list_dir handler.',
  inputSchema: z.object({
    path: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'list_dir');
    const requestedPath = inputData.path?.trim();
    const rootRelativePath = !requestedPath || requestedPath === '.' || requestedPath === '/'
      ? '/'
      : normalizeWorkspacePath(requestedPath).absolutePath;
    const diskPath = rootRelativePath === '/'
      ? workspaceRoot
      : resolveWorkspaceDiskPath(workspaceRoot, rootRelativePath);

    const entries = await fs.readdir(diskPath, { withFileTypes: true });
    const output = entries
      .map(entry => {
        const fullPath = path.posix.join(rootRelativePath, entry.name);
        return entry.isDirectory() ? `${fullPath}/` : fullPath;
      })
      .join('\n');

    return {
      title: rootRelativePath,
      output: output || 'No files found.',
      metadata: {
        path: rootRelativePath,
        count: entries.length,
      },
    };
  },
});