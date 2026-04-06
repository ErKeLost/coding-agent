import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';
import { runRg } from './rg-runner';

const CODESEARCH_DESCRIPTION = loadText('codesearch.txt');
const DEFAULT_LIMIT = 200;

export const codeSearchTool = createTool({
  id: 'codesearch',
  description: CODESEARCH_DESCRIPTION,
  inputSchema: z.object({
    query: z.string().min(1),
    path: z.string().optional(),
    include: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(2000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'codesearch');
    const basePath = inputData.path?.trim()
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.path)
      : workspaceRoot;

    const args = [
      '--line-number',
      '--with-filename',
      '--color',
      'never',
      '--hidden',
      '--glob',
      '!.git',
      '--glob',
      '!node_modules',
      '--glob',
      '!dist',
      '--glob',
      '!.next',
    ];
    if (inputData.include?.trim()) {
      args.push('--glob', inputData.include.trim());
    }
    args.push(inputData.query);
    args.push('.');

    const result = await runRg(args, basePath, context.abortSignal);
    if (result.code === 0 || result.code === 1) {
      const limit = inputData.limit ?? DEFAULT_LIMIT;
      const lines = result.stdout
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean);
      const truncated = lines.length > limit;
      const shown = truncated ? lines.slice(0, limit) : lines;
      return {
        title: 'codesearch',
        output: shown.length > 0 ? shown.join('\n') : 'No matches found',
        metadata: {
          query: inputData.query,
          include: inputData.include,
          path: inputData.path ?? '.',
          count: lines.length,
          shown: shown.length,
          truncated,
        },
      };
    }

    return {
      title: 'codesearch',
      output: `Code search failed: ${result.stderr || `rg exited with code ${result.code}`}`,
      metadata: {
        query: inputData.query,
        include: inputData.include,
        path: inputData.path ?? '.',
        exitCode: result.code,
      },
    };
  },
});

