import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type RgResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type SpawnOutcome =
  | { kind: 'result'; result: RgResult }
  | { kind: 'error'; error: unknown };

function toPosixRelative(root: string, absolutePath: string) {
  const relative = path.relative(root, absolutePath);
  return relative.split(path.sep).join('/');
}

function escapeRegExp(value: string) {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob: string) {
  let source = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      const next = glob[i + 1];
      if (next === '*') {
        source += '.*';
        i += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    if (char === '{') {
      const close = glob.indexOf('}', i + 1);
      if (close > i + 1) {
        const body = glob.slice(i + 1, close);
        const parts = body.split(',').map((part) => escapeRegExp(part.trim()));
        source += `(?:${parts.join('|')})`;
        i = close;
        continue;
      }
    }
    source += escapeRegExp(char);
  }
  source += '$';
  return new RegExp(source);
}

function createGlobMatcher(pattern: string) {
  const normalized = pattern.replaceAll('\\', '/').trim();
  const regex = globToRegExp(normalized);
  const matchBaseNameOnly =
    !normalized.includes('/') && !normalized.includes('**');
  return (relativePosixPath: string) => {
    if (regex.test(relativePosixPath)) return true;
    if (matchBaseNameOnly) {
      const base = path.posix.basename(relativePosixPath);
      return regex.test(base);
    }
    return false;
  };
}

async function walkFiles(root: string, abortSignal?: AbortSignal) {
  const files: string[] = [];
  const queue: string[] = [root];
  while (queue.length > 0) {
    if (abortSignal?.aborted) {
      return files;
    }
    const current = queue.shift();
    if (!current) break;
    let entries: Array<import('node:fs').Dirent>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  return files;
}

async function runPortableFilesMode(args: string[], cwd: string, abortSignal?: AbortSignal): Promise<RgResult> {
  const globPatterns: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--glob' && typeof args[i + 1] === 'string') {
      globPatterns.push(args[i + 1]);
      i += 1;
    }
  }

  if (globPatterns.length === 0) {
    return {
      code: 2,
      stdout: '',
      stderr: 'Portable fallback expected at least one --glob pattern.',
    };
  }

  const matcher = createGlobMatcher(globPatterns[0]);
  const files = await walkFiles(cwd, abortSignal);

  const matches = files
    .map((absolute) => toPosixRelative(cwd, absolute))
    .filter((relative) => matcher(relative))
    .sort((a, b) => a.localeCompare(b));

  return {
    code: matches.length > 0 ? 0 : 1,
    stdout: matches.join('\n'),
    stderr: '',
  };
}

function parseSearchArgs(args: string[]) {
  const includeGlobs: string[] = [];
  const excludeGlobs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--glob' && typeof args[i + 1] === 'string') {
      const globValue = args[i + 1];
      if (globValue.startsWith('!')) {
        excludeGlobs.push(globValue.slice(1));
      } else {
        includeGlobs.push(globValue);
      }
      i += 1;
    }
  }

  // Current callers always append: <pattern> .
  const patternIndex = args.lastIndexOf('.');
  const query = patternIndex > 0 ? args[patternIndex - 1] : '';

  return { includeGlobs, excludeGlobs, query };
}

async function runPortableSearchMode(args: string[], cwd: string, abortSignal?: AbortSignal): Promise<RgResult> {
  const { includeGlobs, excludeGlobs, query } = parseSearchArgs(args);
  if (!query) {
    return {
      code: 2,
      stdout: '',
      stderr: 'Portable fallback could not parse search pattern.',
    };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(query);
  } catch (error) {
    return {
      code: 2,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }

  const includeMatchers = includeGlobs.map(createGlobMatcher);
  const excludeMatchers = excludeGlobs.map(createGlobMatcher);
  const shouldInclude = (relativePosixPath: string) => {
    if (excludeMatchers.some((matcher) => matcher(relativePosixPath))) return false;
    if (includeMatchers.length === 0) return true;
    return includeMatchers.some((matcher) => matcher(relativePosixPath));
  };

  const files = await walkFiles(cwd, abortSignal);
  const outputLines: string[] = [];

  for (const absolute of files) {
    if (abortSignal?.aborted) break;
    const relative = toPosixRelative(cwd, absolute);
    if (!shouldInclude(relative)) continue;

    let raw: string;
    try {
      raw = await fs.readFile(absolute, 'utf8');
    } catch {
      continue;
    }

    const lines = raw.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      regex.lastIndex = 0;
      if (!regex.test(line)) continue;
      outputLines.push(`${relative}:${index + 1}:${line}`);
    }
  }

  return {
    code: outputLines.length > 0 ? 0 : 1,
    stdout: outputLines.join('\n'),
    stderr: '',
  };
}

function isFilesMode(args: string[]) {
  return args.includes('--files');
}

async function runRgNative(args: string[], cwd: string, abortSignal?: AbortSignal): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    const child = spawn('rg', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      resolve({ kind: 'error', error });
    });

    child.on('close', (code) => {
      resolve({
        kind: 'result',
        result: {
          code: typeof code === 'number' ? code : 1,
          stdout,
          stderr,
        },
      });
    });

    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          child.kill('SIGTERM');
        },
        { once: true },
      );
    }
  });
}

export async function runRg(args: string[], cwd: string, abortSignal?: AbortSignal): Promise<RgResult> {
  const native = await runRgNative(args, cwd, abortSignal);
  if (native.kind === 'result') {
    return native.result;
  }

  const error = native.error as NodeJS.ErrnoException;
  const missingBinary = error?.code === 'ENOENT';
  if (!missingBinary) {
    throw error;
  }

  const fallback = isFilesMode(args)
    ? await runPortableFilesMode(args, cwd, abortSignal)
    : await runPortableSearchMode(args, cwd, abortSignal);

  const fallbackPrefix = '[fallback: portable-search because rg is unavailable]';
  return {
    ...fallback,
    stderr: fallback.stderr ? `${fallbackPrefix}\n${fallback.stderr}` : fallbackPrefix,
  };
}

