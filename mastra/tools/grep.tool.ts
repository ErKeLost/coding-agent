import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';
import { runRg } from './rg-runner';

const GREP_DESCRIPTION = loadText('grep.txt');
const DEFAULT_LIMIT = 200;

export const grepTool = createTool({
  id: 'grep',
  description: GREP_DESCRIPTION,
  inputSchema: z.object({
    pattern: z.string().min(1),
    path: z.string().optional(),
    include: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(2000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'grep');
    const basePath = inputData.path?.trim()
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.path)
      : workspaceRoot;

    const args = ['--line-number', '--with-filename', '--color', 'never'];
    if (inputData.include?.trim()) {
      args.push('--glob', inputData.include.trim());
    }
    const limit = inputData.limit ?? DEFAULT_LIMIT;
    args.push('--max-count', String(limit));
    args.push(inputData.pattern);
    args.push('.');

    const result = await runRg(args, basePath, {
      abortSignal: context.abortSignal,
      maxOutputLines: limit,
    });
    if (result.code === 0 || result.code === 1) {
      const lines = result.stdout
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(Boolean);
      const truncated = result.truncated ?? false;
      const shown = lines;
      return {
        title: 'grep',
        output: shown.length > 0 ? shown.join('\n') : 'No matches found',
        metadata: {
          pattern: inputData.pattern,
          include: inputData.include,
          path: inputData.path ?? '.',
          count: lines.length,
          shown: shown.length,
          truncated,
        },
      };
    }

    return {
      title: 'grep',
      output: `Grep failed: ${result.stderr || `rg exited with code ${result.code}`}`,
      metadata: {
        pattern: inputData.pattern,
        include: inputData.include,
        path: inputData.path ?? '.',
        exitCode: result.code,
      },
    };
  },
});
