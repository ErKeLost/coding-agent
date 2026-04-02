import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, getSandboxIdOrThrow, loadText, normalizeSandboxPath, quoteForBash, runSandboxCommand } from './sandbox-helpers';

const AST_GREP_SEARCH_DESCRIPTION = loadText('ast-grep-search.txt');

const CLI_LANGUAGES = [
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'elixir',
  'go',
  'haskell',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'nix',
  'php',
  'python',
  'ruby',
  'rust',
  'scala',
  'solidity',
  'swift',
  'typescript',
  'tsx',
  'yaml',
] as const;

type SgMatch = {
  file?: string;
  text?: string;
  lines?: string;
  range?: { start?: { line?: number; column?: number } };
};

function formatSearchResult(matches: SgMatch[], truncated: boolean) {
  if (matches.length === 0) return 'No matches found';
  const lines: string[] = [];
  if (truncated) {
    lines.push('Results truncated.');
    lines.push('');
  }
  lines.push(`Found ${matches.length} match(es):`);
  for (const match of matches) {
    const line = (match.range?.start?.line ?? 0) + 1;
    const column = (match.range?.start?.column ?? 0) + 1;
    const location = match.file ? `${match.file}:${line}:${column}` : `L${line}:${column}`;
    lines.push(location);
    const snippet = (match.lines ?? match.text ?? '').trim();
    if (snippet) {
      lines.push(`  ${snippet}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function buildSgCommand({
  pattern,
  lang,
  paths,
  globs,
  context,
}: {
  pattern: string;
  lang: string;
  paths?: string[];
  globs?: string[];
  context?: number;
}) {
  const args: string[] = ['sg', 'run', '-p', quoteForBash(pattern), '--lang', quoteForBash(lang), '--json=compact'];
  if (context && context > 0) {
    args.push('-C', String(context));
  }
  if (globs) {
    for (const glob of globs) {
      args.push('--globs', quoteForBash(glob));
    }
  }
  const searchPaths = paths && paths.length > 0 ? paths : ['.'];
  for (const rawPath of searchPaths) {
    args.push(quoteForBash(normalizeSandboxPath(rawPath)));
  }
  return args.join(' ');
}

export const astGrepSearchTool = createTool({
  id: 'ast_grep_search',
  description: AST_GREP_SEARCH_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    pattern: z.string().min(1),
    lang: z.enum(CLI_LANGUAGES),
    paths: z.array(z.string()).optional(),
    globs: z.array(z.string()).optional(),
    context: z.number().int().min(0).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const command = buildSgCommand({
      pattern: inputData.pattern,
      lang: inputData.lang,
      paths: inputData.paths,
      globs: inputData.globs,
      context: inputData.context,
    });
    const { stdout, stderr, exitCode } = await runSandboxCommand(sandboxId, command, '/workspace', 30000);

    if (exitCode !== 0 && !stdout.trim()) {
      const message = stderr.trim() || 'ast-grep search failed';
      if (message.includes('not found') || message.includes('No such file') || exitCode === 127) {
        throw new Error('ast-grep CLI (sg) not found in sandbox. Install it to use ast-grep search.');
      }
      throw new Error(message);
    }

    let matches: SgMatch[] = [];
    let truncated = false;
    if (stdout.trim()) {
      try {
        matches = JSON.parse(stdout.trim()) as SgMatch[];
      } catch {
        return {
          title: `ast-grep search: ${inputData.pattern}`,
          output: stdout.trim(),
          metadata: { matches: 0, truncated: false },
        };
      }
    }

    if (matches.length > 200) {
      matches = matches.slice(0, 200);
      truncated = true;
    }

    const output = formatSearchResult(matches, truncated);
    return {
      title: `ast-grep search: ${inputData.pattern}`,
      output,
      metadata: { matches: matches.length, truncated },
    };
  },
});
