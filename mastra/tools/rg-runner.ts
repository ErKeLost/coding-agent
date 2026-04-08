import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_TIMEOUT_MS } from './local-tool-runtime';

export type RgResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
  truncated?: boolean;
};

type RunRgOptions = {
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  maxOutputLines?: number;
};

export type RgFilesResult = {
  code: number;
  files: string[];
  stderr: string;
  timedOut?: boolean;
  truncated?: boolean;
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

async function runPortableFilesMode(
  args: string[],
  cwd: string,
  abortSignal?: AbortSignal,
  maxOutputLines?: number,
): Promise<RgResult> {
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
  const truncated = typeof maxOutputLines === 'number' && matches.length > maxOutputLines;
  const shownMatches = truncated ? matches.slice(0, maxOutputLines) : matches;

  return {
    code: matches.length > 0 ? 0 : 1,
    stdout: shownMatches.join('\n'),
    stderr: '',
    truncated,
  };
}

async function runPortableFilesStreamMode(
  args: string[],
  cwd: string,
  abortSignal?: AbortSignal,
  maxResults?: number,
): Promise<RgFilesResult> {
  const globPatterns: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--glob' && typeof args[i + 1] === 'string') {
      globPatterns.push(args[i + 1]);
      i += 1;
      continue;
    }
    if (typeof args[i] === 'string' && args[i].startsWith('--glob=')) {
      globPatterns.push(args[i].slice('--glob='.length));
    }
  }

  if (globPatterns.length === 0) {
    return {
      code: 2,
      files: [],
      stderr: 'Portable fallback expected at least one --glob pattern.',
    };
  }

  const includeMatchers = globPatterns
    .filter((pattern) => !pattern.startsWith('!'))
    .map(createGlobMatcher);
  const excludeMatchers = globPatterns
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => createGlobMatcher(pattern.slice(1)));

  const queue: string[] = [cwd];
  const files: string[] = [];
  let truncated = false;

  while (queue.length > 0) {
    if (abortSignal?.aborted) break;
    const current = queue.shift();
    if (!current) break;

    let entries: Array<import('node:fs').Dirent>;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (abortSignal?.aborted) break;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const relative = toPosixRelative(cwd, absolute);
      if (excludeMatchers.some((matcher) => matcher(relative))) {
        continue;
      }
      if (includeMatchers.length > 0 && !includeMatchers.some((matcher) => matcher(relative))) {
        continue;
      }

      files.push(relative);
      if (typeof maxResults === 'number' && maxResults > 0 && files.length >= maxResults) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;
  }

  return {
    code: files.length > 0 ? 0 : 1,
    files,
    stderr: '',
    truncated,
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

async function runPortableSearchMode(
  args: string[],
  cwd: string,
  abortSignal?: AbortSignal,
  maxOutputLines?: number,
): Promise<RgResult> {
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
  let truncated = false;

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
      if (typeof maxOutputLines === 'number' && outputLines.length >= maxOutputLines) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }

  return {
    code: outputLines.length > 0 ? 0 : 1,
    stdout: outputLines.join('\n'),
    stderr: '',
    truncated,
  };
}

function isFilesMode(args: string[]) {
  return args.includes('--files');
}

async function runRgNative(
  args: string[],
  cwd: string,
  options: RunRgOptions = {},
): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    const { abortSignal, timeoutMs = DEFAULT_TIMEOUT_MS, maxOutputLines } = options;
    const child = spawn('rg', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';
    let timedOut = false;
    let truncated = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (outcome: SpawnOutcome) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve(outcome);
    };

    const terminate = (reason?: 'timeout' | 'truncated') => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (reason === 'timeout') timedOut = true;
      if (reason === 'truncated') truncated = true;
      child.kill('SIGTERM');
      if (!killTimer) {
        killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
          }
        }, 5_000);
      }
    };

    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (typeof maxOutputLines !== 'number' || maxOutputLines <= 0) {
        return;
      }

      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      const trailing = lines.pop() ?? '';
      if (lines.length >= maxOutputLines) {
        stdout = lines.slice(0, maxOutputLines).join('\n');
        terminate('truncated');
        stdoutBuffer = '';
        return;
      }
      stdoutBuffer = trailing;
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      finish({ kind: 'error', error });
    });

    child.on('close', (code) => {
      if (timedOut) {
        stderr = stderr ? `${stderr}\nrg timed out after ${timeoutMs}ms.` : `rg timed out after ${timeoutMs}ms.`;
      } else if (truncated) {
        stderr = stderr ? `${stderr}\nrg output truncated.` : 'rg output truncated.';
      }
      finish({
        kind: 'result',
        result: {
          code: timedOut ? 124 : typeof code === 'number' ? code : 1,
          stdout,
          stderr,
          timedOut,
          truncated,
        },
      });
    });

    if (abortSignal) {
      const abortHandler = () => {
        terminate();
      };
      abortSignal.addEventListener(
        'abort',
        abortHandler,
        { once: true },
      );
      if (abortSignal.aborted) {
        abortHandler();
      }
    }

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        terminate('timeout');
      }, timeoutMs);
    }
  });
}

export async function runRg(args: string[], cwd: string, options: RunRgOptions = {}): Promise<RgResult> {
  const native = await runRgNative(args, cwd, options);
  if (native.kind === 'result') {
    return native.result;
  }

  const error = native.error as NodeJS.ErrnoException;
  const missingBinary = error?.code === 'ENOENT';
  if (!missingBinary) {
    throw error;
  }

  const fallback = isFilesMode(args)
    ? await runPortableFilesMode(args, cwd, options.abortSignal, options.maxOutputLines)
    : await runPortableSearchMode(args, cwd, options.abortSignal, options.maxOutputLines);

  const fallbackPrefix = '[fallback: portable-search because rg is unavailable]';
  return {
    ...fallback,
    stderr: fallback.stderr ? `${fallbackPrefix}\n${fallback.stderr}` : fallbackPrefix,
  };
}

export async function runRgFiles(
  args: string[],
  cwd: string,
  options: Omit<RunRgOptions, 'maxOutputLines'> & { maxResults?: number } = {},
): Promise<RgFilesResult> {
  const { abortSignal, timeoutMs = DEFAULT_TIMEOUT_MS, maxResults } = options;

  try {
    await fs.access(cwd);
  } catch {
    return {
      code: 2,
      files: [],
      stderr: `No such file or directory: ${cwd}`,
    };
  }

  const native = await new Promise<SpawnOutcome | { kind: 'files'; result: RgFilesResult }>((resolve) => {
    const child = spawn('rg', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stderr = '';
    let buffer = '';
    let timedOut = false;
    let truncated = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    const files: string[] = [];

    const finish = (outcome: SpawnOutcome | { kind: 'files'; result: RgFilesResult }) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve(outcome);
    };

    const terminate = (reason?: 'timeout' | 'truncated') => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (reason === 'timeout') timedOut = true;
      if (reason === 'truncated') truncated = true;
      child.kill('SIGTERM');
      if (!killTimer) {
        killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
          }
        }, 5_000);
      }
    };

    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (typeof maxResults === 'number' && maxResults > 0 && files.length >= maxResults) {
          terminate('truncated');
          break;
        }
        files.push(trimmed);
        if (typeof maxResults === 'number' && maxResults > 0 && files.length >= maxResults) {
          terminate('truncated');
          break;
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      finish({ kind: 'error', error });
    });

    child.on('close', (code) => {
      if (
        buffer.trim() &&
        !(typeof maxResults === 'number' && maxResults > 0 && files.length >= maxResults)
      ) {
        files.push(buffer.trim());
      }
      if (timedOut) {
        stderr = stderr ? `${stderr}\nrg timed out after ${timeoutMs}ms.` : `rg timed out after ${timeoutMs}ms.`;
      } else if (truncated) {
        stderr = stderr ? `${stderr}\nrg output truncated.` : 'rg output truncated.';
      }

      finish({
        kind: 'files',
        result: {
          code: timedOut ? 124 : files.length > 0 ? 0 : typeof code === 'number' ? code : 1,
          files,
          stderr,
          timedOut,
          truncated,
        },
      });
    });

    if (abortSignal) {
      const abortHandler = () => {
        terminate();
      };
      abortSignal.addEventListener('abort', abortHandler, { once: true });
      if (abortSignal.aborted) {
        abortHandler();
      }
    }

    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        terminate('timeout');
      }, timeoutMs);
    }
  });

  if ('kind' in native && native.kind === 'files') {
    return native.result;
  }
  if (native.kind === 'result') {
    return {
      code: native.result.code,
      files: native.result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      stderr: native.result.stderr,
      timedOut: native.result.timedOut,
      truncated: native.result.truncated,
    };
  }

  const error = native.error as NodeJS.ErrnoException;
  const missingBinary = error?.code === 'ENOENT';
  if (!missingBinary) {
    throw error;
  }

  const fallback = await runPortableFilesStreamMode(args, cwd, abortSignal, maxResults);
  const fallbackPrefix = '[fallback: portable-search because rg is unavailable]';
  return {
    ...fallback,
    stderr: fallback.stderr ? `${fallbackPrefix}\n${fallback.stderr}` : fallbackPrefix,
  };
}
