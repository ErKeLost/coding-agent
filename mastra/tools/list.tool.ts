import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';
import {
  getWorkspaceFromToolContext,
  normalizeWorkspacePath,
  resolveWorkspaceDiskPath,
} from './local-tool-runtime';

const LIST_DESCRIPTION = loadText('ls.txt');

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const listTool = createTool({
  id: 'list',
  description: LIST_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    path: z.string().optional(),
    ignore: z.array(z.string()).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'list');
    const requestedPath = inputData.path?.trim();
    const isWorkspaceRoot =
      !requestedPath || requestedPath === '.' || requestedPath === '/';
    const basePath = isWorkspaceRoot
      ? '/'
      : normalizeWorkspacePath(requestedPath).absolutePath;
    const diskPath = isWorkspaceRoot
      ? workspaceRoot
      : resolveWorkspaceDiskPath(workspaceRoot, requestedPath);
    const ignorePatterns = (inputData.ignore ?? []).map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch {
        return new RegExp(escapeRegExp(pattern));
      }
    });

    const entries = await fs.readdir(diskPath, { withFileTypes: true });
    const filtered = ignorePatterns.length
      ? entries.filter(entry => {
        const fullPath = path.posix.join(basePath, entry.name);
        return !ignorePatterns.some(pattern => pattern.test(fullPath));
      })
      : entries;

    const outputLines = filtered.map(entry => {
      const fullPath = path.posix.join(basePath, entry.name);
      return entry.isDirectory() ? `${fullPath}/` : fullPath;
    });
    const output = outputLines.length > 0 ? outputLines.join('\n') : 'No files found';
    return {
      title: basePath,
      output,
      metadata: { count: outputLines.length, truncated: false },
    };
  },
});
