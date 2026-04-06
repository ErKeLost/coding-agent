import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';
import { runRg } from './rg-runner';

const GLOB_DESCRIPTION = loadText('glob.txt');

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

    const args = ['--files', '--glob', inputData.pattern];
    const result = await runRg(args, basePath, context.abortSignal);

    if (result.code === 0 || result.code === 1) {
      const rows = result.stdout
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
      return {
        title: 'glob',
        output: rows.length > 0 ? rows.join('\n') : 'No files found',
        metadata: {
          pattern: inputData.pattern,
          path: inputData.path ?? '.',
          count: rows.length,
          truncated: false,
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

