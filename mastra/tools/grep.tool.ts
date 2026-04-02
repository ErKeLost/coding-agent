import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import {
  MAX_LINE_LENGTH,
  HowOneResultSchema,
  SANDBOX_ROOT,
  escapeRegExp,
  getSandboxIdOrThrow,
  loadText,
  normalizeSandboxPath,
} from './sandbox-helpers';

const GREP_DESCRIPTION = loadText('grep.txt');

export const grepTool = createTool({
  id: 'grep',
  description: GREP_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    pattern: z.string().min(1),
    path: z.string().optional(),
    include: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const searchPath = normalizeSandboxPath(inputData.path ?? SANDBOX_ROOT);
    const rawMatches = await sandbox.fs.findFiles(searchPath, inputData.pattern);
    const includePattern = inputData.include
      ? (() => {
        try {
          return new RegExp(inputData.include);
        } catch {
          return new RegExp(escapeRegExp(inputData.include));
        }
      })()
      : null;
    const matches = rawMatches
      .filter(match => (includePattern ? includePattern.test(match.file) : true))
      .map(match => ({
        path: match.file,
        lineNum: match.line,
        lineText: match.content,
      }));

    const limit = 100;
    const truncated = matches.length > limit;
    const finalMatches = truncated ? matches.slice(0, limit) : matches;

    if (finalMatches.length === 0) {
      return { title: inputData.pattern, output: 'No files found', metadata: { matches: 0, truncated: false } };
    }

    const outputLines: string[] = [`Found ${finalMatches.length} matches`];
    let currentFile = '';
    for (const match of finalMatches) {
      if (currentFile !== match.path) {
        if (currentFile !== '') outputLines.push('');
        currentFile = match.path;
        outputLines.push(`${match.path}:`);
      }
      const truncatedLineText =
        match.lineText.length > MAX_LINE_LENGTH
          ? `${match.lineText.slice(0, MAX_LINE_LENGTH)}...`
          : match.lineText;
      outputLines.push(`  Line ${match.lineNum}: ${truncatedLineText}`);
    }

    if (truncated) {
      outputLines.push('');
      outputLines.push('(Results are truncated. Consider using a more specific path or pattern.)');
    }

    return {
      title: inputData.pattern,
      output: outputLines.join('\n'),
      metadata: { matches: finalMatches.length, truncated },
    };
  },
});
