import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import {
  HowOneResultSchema,
  SANDBOX_ROOT,
  escapeRegExp,
  getSandboxIdOrThrow,
  loadText,
  normalizeSandboxPath,
} from './sandbox-helpers';

const LIST_DESCRIPTION = loadText('ls.txt');

export const listTool = createTool({
  id: 'list',
  description: LIST_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    path: z.string().optional(),
    ignore: z.array(z.string()).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const basePath = normalizeSandboxPath(inputData.path ?? SANDBOX_ROOT);
    const ignorePatterns = (inputData.ignore ?? []).map((pattern) => {
      try {
        return new RegExp(pattern);
      } catch {
        return new RegExp(escapeRegExp(pattern));
      }
    });

    const entries = await sandbox.fs.listFiles(basePath);
    const filtered = ignorePatterns.length
      ? entries.filter(entry => {
        const fullPath = path.posix.join(basePath, entry.name);
        return !ignorePatterns.some(pattern => pattern.test(fullPath));
      })
      : entries;

    const outputLines = filtered.map(entry => {
      const fullPath = path.posix.join(basePath, entry.name);
      return entry.isDir ? `${fullPath}/` : fullPath;
    });
    const output = outputLines.length > 0 ? outputLines.join('\n') : 'No files found';
    return {
      title: basePath,
      output,
      metadata: { count: outputLines.length, truncated: false },
    };
  },
});
