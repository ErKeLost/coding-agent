import { createTool } from '@mastra/core/tools';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';
import { runRgFiles } from './rg-runner';

const GLOB_DESCRIPTION = loadText('glob.txt');
const DEFAULT_LIMIT = 100;

export const globTool = createTool({
  id: 'glob',
  description: GLOB_DESCRIPTION,
  inputSchema: z.object({
    pattern: z.string().min(1),
    path: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'glob');
    const basePath = inputData.path?.trim()
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.path)
      : workspaceRoot;

    const args = ['--files', '--hidden', '--glob', '!.git/*', '--glob', inputData.pattern];
    const result = await runRgFiles(args, basePath, {
      abortSignal: context.abortSignal,
      maxResults: DEFAULT_LIMIT,
    });

    if (result.code === 0 || result.code === 1) {
      const rows = await Promise.all(
        result.files.map(async (relativePath) => {
          const absolutePath = path.resolve(basePath, relativePath);
          let mtimeMs = 0;
          try {
            const stat = await fs.stat(absolutePath);
            mtimeMs = stat.mtimeMs;
          } catch {
            mtimeMs = 0;
          }
          return {
            relativePath,
            mtimeMs,
          };
        }),
      );

      rows.sort((left, right) => right.mtimeMs - left.mtimeMs);
      const outputRows = rows.map((row) => row.relativePath);
      const truncated = result.truncated ?? false;
      const output =
        outputRows.length > 0
          ? outputRows.join('\n') +
            (truncated
              ? `\n\n(Results are truncated: showing first ${DEFAULT_LIMIT} results. Consider using a more specific path or pattern.)`
              : '')
          : 'No files found';

      return {
        title: 'glob',
        output,
        metadata: {
          pattern: inputData.pattern,
          path: inputData.path ?? '.',
          count: outputRows.length,
          truncated,
        },
      };
    }

    return {
      title: 'glob',
      output: `Glob failed: ${result.stderr || `rg exited with code ${result.code}`}`,
      metadata: {
        pattern: inputData.pattern,
        path: inputData.path ?? '.',
        count: 0,
        exitCode: result.code,
      },
    };
  },
});
