import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import {
  HowOneResultSchema,
  SANDBOX_ROOT,
  getSandboxIdOrThrow,
  loadText,
  normalizeSandboxPath,
} from './sandbox-helpers';

const GLOB_DESCRIPTION = loadText('glob.txt');

function expandBracePatterns(pattern: string): string[] {
  const match = /\{([^{}]+)\}/.exec(pattern);
  if (!match) return [pattern];

  const whole = match[0];
  const inner = match[1] ?? '';
  const variants = inner
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (variants.length === 0) return [pattern];

  return variants.flatMap((variant) =>
    expandBracePatterns(pattern.replace(whole, variant))
  );
}

export const globTool = createTool({
  id: 'glob',
  description: GLOB_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    pattern: z.string().min(1),
    path: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const searchPath = normalizeSandboxPath(inputData.path ?? SANDBOX_ROOT);
    const expandedPatterns = expandBracePatterns(inputData.pattern);
    const fileSet = new Set<string>();

    for (const pattern of expandedPatterns) {
      const result = await sandbox.fs.searchFiles(searchPath, pattern);
      for (const file of result?.files ?? []) {
        fileSet.add(file);
      }
    }

    const files = Array.from(fileSet).sort();

    const limit = 100;
    const truncated = files.length > limit;
    const finalFiles = truncated ? files.slice(0, limit) : files;

    const output = finalFiles.length > 0 ? finalFiles.join('\n') : 'No files found';
    return {
      title: searchPath,
      output,
      metadata: { count: finalFiles.length, truncated },
    };
  },
});
