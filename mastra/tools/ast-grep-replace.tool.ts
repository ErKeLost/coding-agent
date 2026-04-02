import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, getSandboxIdOrThrow, loadText, normalizeSandboxPath, quoteForBash, runSandboxCommand } from './sandbox-helpers';

const AST_GREP_REPLACE_DESCRIPTION = loadText('ast-grep-replace.txt');

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

function formatReplaceResult(matches: SgMatch[], isDryRun: boolean, truncated: boolean) {
  if (matches.length === 0) return isDryRun ? 'No matches found to replace' : 'No replacements applied';
  const lines: string[] = [];
  if (truncated) {
    lines.push('Results truncated.');
    lines.push('');
  }
  lines.push(`${isDryRun ? '[DRY RUN] ' : ''}${matches.length} replacement(s):`);
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
  if (isDryRun) {
    lines.push('Use dryRun=false to apply changes.');
  }
  return lines.join('\n').trim();
}

function buildSgCommand({
  pattern,
  rewrite,
  lang,
  paths,
  globs,
  updateAll,
}: {
  pattern: string;
  rewrite: string;
  lang: string;
  paths?: string[];
  globs?: string[];
  updateAll: boolean;
}) {
  const args: string[] = [
    'sg',
    'run',
    '-p',
    quoteForBash(pattern),
    '--lang',
    quoteForBash(lang),
    '--json=compact',
    '-r',
    quoteForBash(rewrite),
  ];
  if (updateAll) {
    args.push('--update-all');
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

export const astGrepReplaceTool = createTool({
  id: 'ast_grep_replace',
  description: AST_GREP_REPLACE_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    pattern: z.string().min(1),
    rewrite: z.string().min(1),
    lang: z.enum(CLI_LANGUAGES),
    paths: z.array(z.string()).optional(),
    globs: z.array(z.string()).optional(),
    dryRun: z.boolean().default(true),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const command = buildSgCommand({
      pattern: inputData.pattern,
      rewrite: inputData.rewrite,
      lang: inputData.lang,
      paths: inputData.paths,
      globs: inputData.globs,
      updateAll: inputData.dryRun === false,
    });
    const { stdout, stderr, exitCode } = await runSandboxCommand(sandboxId, command, '/workspace', 30000);

    if (exitCode !== 0 && !stdout.trim()) {
      const message = stderr.trim() || 'ast-grep replace failed';
      if (message.includes('not found') || message.includes('No such file') || exitCode === 127) {
        throw new Error('ast-grep CLI (sg) not found in sandbox. Install it to use ast-grep replace.');
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
          title: `ast-grep replace: ${inputData.pattern}`,
          output: stdout.trim(),
          metadata: { matches: 0, truncated: false },
        };
      }
    }

    if (matches.length > 200) {
      matches = matches.slice(0, 200);
      truncated = true;
    }

    const output = formatReplaceResult(matches, inputData.dryRun !== false, truncated);
    return {
      title: `ast-grep replace: ${inputData.pattern}`,
      output,
      metadata: { matches: matches.length, truncated, dryRun: inputData.dryRun !== false },
    };
  },
});
