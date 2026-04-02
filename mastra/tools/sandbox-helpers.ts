import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTwoFilesPatch } from 'diff';
import { z } from 'zod';
import { createFileUploadFormat, getSandboxById, normalizeSandboxPath } from './daytona-client';
import { normalizeLineEndings } from './edit-utils';

export const MAX_OUTPUT_LENGTH = 30000;
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
export const DEFAULT_READ_LIMIT = 2000;
export const MAX_LINE_LENGTH = 2000;
export const SANDBOX_ROOT = '/workspace';
export const DEFAULT_SKILLS_DIR = '/workspace/.howone';
export const MAX_WEBFETCH_SIZE = 5 * 1024 * 1024;
export const SKILL_CACHE_TTL_MS = 60 * 1000;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

const TEXT_BY_NAME: Record<string, string> = {
  'ast-grep-replace.txt': readFileSync(new URL('./text/ast-grep-replace.txt', import.meta.url), 'utf8'),
  'ast-grep-search.txt': readFileSync(new URL('./text/ast-grep-search.txt', import.meta.url), 'utf8'),
  'bash.txt': readFileSync(new URL('./text/bash.txt', import.meta.url), 'utf8'),
  'batch.txt': readFileSync(new URL('./text/batch.txt', import.meta.url), 'utf8'),
  'codesearch.txt': readFileSync(new URL('./text/codesearch.txt', import.meta.url), 'utf8'),
  'edit.txt': readFileSync(new URL('./text/edit.txt', import.meta.url), 'utf8'),
  'glob.txt': readFileSync(new URL('./text/glob.txt', import.meta.url), 'utf8'),
  'grep.txt': readFileSync(new URL('./text/grep.txt', import.meta.url), 'utf8'),
  'ls.txt': readFileSync(new URL('./text/ls.txt', import.meta.url), 'utf8'),
  'lsp.txt': readFileSync(new URL('./text/lsp.txt', import.meta.url), 'utf8'),
  'multiedit.txt': readFileSync(new URL('./text/multiedit.txt', import.meta.url), 'utf8'),
  'patch.txt': readFileSync(new URL('./text/patch.txt', import.meta.url), 'utf8'),
  'question.txt': readFileSync(new URL('./text/question.txt', import.meta.url), 'utf8'),
  'read.txt': readFileSync(new URL('./text/read.txt', import.meta.url), 'utf8'),
  'task.txt': readFileSync(new URL('./text/task.txt', import.meta.url), 'utf8'),
  'todoread.txt': readFileSync(new URL('./text/todoread.txt', import.meta.url), 'utf8'),
  'todowrite.txt': readFileSync(new URL('./text/todowrite.txt', import.meta.url), 'utf8'),
  'webfetch.txt': readFileSync(new URL('./text/webfetch.txt', import.meta.url), 'utf8'),
  'websearch.txt': readFileSync(new URL('./text/websearch.txt', import.meta.url), 'utf8'),
  'write.txt': readFileSync(new URL('./text/write.txt', import.meta.url), 'utf8'),
};

function findProjectTextDir() {
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(current, 'mastra/tools/text');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const PROJECT_TEXT_DIR = process.env.NODE_ENV === 'production' ? null : findProjectTextDir();

export function loadText(fileName: string) {
  const bundledText = TEXT_BY_NAME[fileName];
  if (bundledText) return bundledText;
  if (PROJECT_TEXT_DIR) {
    const sourcePath = path.join(PROJECT_TEXT_DIR, fileName);
    if (existsSync(sourcePath)) return readFileSync(sourcePath, 'utf8');
  }
  throw new Error(`Missing tool description file: ${fileName}`);
}

export const HowOneResultSchema = z.object({
  title: z.string(),
  output: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  attachments: z.array(z.any()).optional(),
});

export const TodoItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

export type TodoItem = z.infer<typeof TodoItemSchema>;

export function getSandboxIdOrThrow(sandboxId?: string): string {
  if (sandboxId) return sandboxId;
  throw new Error('sandboxId is required for this tool.');
}

export function truncateOutput(text: string) {
  if (text.length <= MAX_OUTPUT_LENGTH) return { text, truncated: false };
  return { text: `${text.slice(0, MAX_OUTPUT_LENGTH)}\n\n[bash] output truncated`, truncated: true };
}

export function toText(value: unknown) {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return '';
}

export function quoteForBash(command: string) {
  if (command.includes('\n')) {
    const escaped = command.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    return `$'${escaped}'`;
  }
  return JSON.stringify(command);
}

export function buildShellCommand(command: string, workdir?: string, timeoutMs?: number) {
  const baseCommand = workdir ? `cd ${JSON.stringify(workdir)} && ${command}` : command;
  if (timeoutMs && timeoutMs > 0) {
    const timeoutSec = Math.ceil(timeoutMs / 1000);
    return `timeout ${timeoutSec}s bash -lc ${quoteForBash(baseCommand)}`;
  }
  return `bash -lc ${quoteForBash(baseCommand)}`;
}

export function normalizePackageCommand(command: string) {
  const trimmed = command.trim();
  const match = /^(npm|pnpm|yarn)\b(.*)$/.exec(trimmed);
  if (!match) return command;
  const args = match[2].trim();
  if (!args) return 'bun install';
  const [first, ...restParts] = args.split(/\s+/);
  const rest = restParts.join(' ');
  switch (first) {
    case 'install':
    case 'i':
      return rest ? `bun install ${rest}` : 'bun install';
    case 'add':
      return rest ? `bun add ${rest}` : 'bun add';
    case 'run':
      return rest ? `bun run ${rest}` : 'bun run';
    case 'test':
      return rest ? `bun test ${rest}` : 'bun test';
    default:
      return rest ? `bun ${first} ${rest}` : `bun ${first}`;
  }
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isBlockedEnv(filePath: string) {
  const base = path.posix.basename(filePath);
  const whitelist = ['.env.sample', '.env.example', '.example', '.env.template'];
  if (whitelist.some(suffix => base.endsWith(suffix))) return false;
  return /^\.env(\.|$)/.test(base);
}

export function isBinaryExtension(filePath: string) {
  const ext = path.posix.extname(filePath).toLowerCase();
  return [
    '.zip',
    '.tar',
    '.gz',
    '.exe',
    '.dll',
    '.so',
    '.class',
    '.jar',
    '.war',
    '.7z',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.odt',
    '.ods',
    '.odp',
    '.bin',
    '.dat',
    '.obj',
    '.o',
    '.a',
    '.lib',
    '.wasm',
    '.pyc',
    '.pyo',
  ].includes(ext);
}

export function looksBinary(content: string) {
  if (!content) return false;
  let nonPrintable = 0;
  const length = Math.min(content.length, 4096);
  for (let i = 0; i < length; i++) {
    const code = content.charCodeAt(i);
    if (code === 0) return true;
    if (code < 9 || (code > 13 && code < 32)) nonPrintable++;
  }
  return nonPrintable / length > 0.3;
}

export function mimeFromPath(filePath: string) {
  const ext = path.posix.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  return IMAGE_MIME_BY_EXT[ext] ?? '';
}

export function formatFileOutput(content: string, offset: number, limit: number) {
  const lines = content.split('\n');
  const slice = lines.slice(offset, offset + limit);
  const raw = slice.map(line => (line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}...` : line));
  const contentLines = raw.map((line, index) => `${String(index + offset + 1).padStart(5, '0')}| ${line}`);
  const preview = raw.slice(0, 20).join('\n');

  let output = '<file>\n';
  output += contentLines.join('\n');

  const totalLines = lines.length;
  const lastReadLine = offset + contentLines.length;
  const hasMoreLines = totalLines > lastReadLine;
  if (hasMoreLines) {
    output += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${lastReadLine})`;
  } else {
    output += `\n\n(End of file - total ${totalLines} lines)`;
  }
  output += '\n</file>';
  return { output, preview };
}

export async function readSandboxTextFile(sandboxId: string, filePath: string) {
  const sandbox = await getSandboxById(sandboxId);
  const raw = await sandbox.fs.downloadFile(filePath);
  return toText(raw);
}

export async function downloadSandboxBytes(sandboxId: string, filePath: string) {
  const sandbox = await getSandboxById(sandboxId);
  const raw = await sandbox.fs.downloadFile(filePath);
  if (typeof raw === 'string') return Buffer.from(raw, 'utf8');
  return Buffer.from(raw);
}

export async function ensureSandboxDir(sandboxId: string, filePath: string) {
  const sandbox = await getSandboxById(sandboxId);
  const dir = path.posix.dirname(filePath);
  if (dir === '/' || dir === '.') return;
  const parts = dir.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    await sandbox.fs.createFolder(current, '755');
  }
}

export async function writeSandboxTextFile(sandboxId: string, filePath: string, content: string) {
  await ensureSandboxDir(sandboxId, filePath);
  const sandbox = await getSandboxById(sandboxId);
  await sandbox.fs.uploadFiles([createFileUploadFormat(content, filePath)]);
}

export function formatEnv(env: Record<string, string> | undefined) {
  if (!env) return '';
  return Object.entries(env)
    .map(([key, value]) => `${key}=${quoteForBash(value)}`)
    .join(' ');
}

export async function runSandboxCommand(
  sandboxId: string,
  command: string,
  workdir?: string,
  timeoutMs?: number,
  env?: Record<string, string>,
) {
  const sandbox = await getSandboxById(sandboxId);
  const envPrefix = formatEnv(env);
  const full = envPrefix ? `${envPrefix} ${command}` : command;
  const cmd = buildShellCommand(full, workdir, timeoutMs);
  const result = await sandbox.process.executeCommand(cmd);
  const record = (result ?? {}) as Record<string, unknown>;
  const stdout = toText(record.result ?? record.output ?? record.stdout);
  const stderr = toText(record.stderr);
  const exitCode =
    typeof record.exitCode === 'number'
      ? record.exitCode
      : typeof record.exit_code === 'number'
        ? record.exit_code
        : 0;
  return { stdout, stderr, exitCode };
}

export async function runSandboxSessionCommand(
  sandboxId: string,
  command: string,
  workdir?: string,
  timeoutMs?: number,
  runAsync?: boolean,
) {
  const sandbox = await getSandboxById(sandboxId);
  const cmd = buildShellCommand(command, workdir, timeoutMs);
  const sessionId = `mastra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await sandbox.process.createSession(sessionId);
  const result = await sandbox.process.executeSessionCommand(sessionId, {
    command: cmd,
    runAsync: runAsync ?? false,
  });
  const record = (result ?? {}) as Record<string, unknown>;
  const stdout = toText(record.result ?? record.output ?? record.stdout);
  const stderr = toText(record.stderr);
  const exitCode =
    typeof record.exitCode === 'number'
      ? record.exitCode
      : typeof record.exit_code === 'number'
        ? record.exit_code
        : 0;
  return { stdout, stderr, exitCode };
}

type UpdateFileChunk = {
  old_lines: string[];
  new_lines: string[];
  change_context?: string;
  is_end_of_file?: boolean;
};

type PatchHunk =
  | { type: 'add'; filePath: string; content: string }
  | { type: 'delete'; filePath: string }
  | { type: 'update'; filePath: string; movePath?: string; chunks: UpdateFileChunk[] };

function parseUpdateFileChunks(lines: string[], startIdx: number): { chunks: UpdateFileChunk[]; nextIdx: number } {
  const chunks: UpdateFileChunk[] = [];
  let i = startIdx;

  while (i < lines.length && !lines[i].startsWith('***')) {
    if (lines[i].startsWith('@@')) {
      const contextLine = lines[i].substring(2).trim();
      i++;

      const oldLines: string[] = [];
      const newLines: string[] = [];
      let isEndOfFile = false;

      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('***')) {
        const changeLine = lines[i];

        if (changeLine === '*** End of File') {
          isEndOfFile = true;
          i++;
          break;
        }

        if (changeLine.startsWith(' ')) {
          const content = changeLine.substring(1);
          oldLines.push(content);
          newLines.push(content);
        } else if (changeLine.startsWith('-')) {
          oldLines.push(changeLine.substring(1));
        } else if (changeLine.startsWith('+')) {
          newLines.push(changeLine.substring(1));
        }
        i++;
      }

      chunks.push({
        old_lines: oldLines,
        new_lines: newLines,
        change_context: contextLine || undefined,
        is_end_of_file: isEndOfFile || undefined,
      });
    } else {
      i++;
    }
  }

  return { chunks, nextIdx: i };
}

function parsePatchText(patchText: string): PatchHunk[] {
  const lines = patchText.split('\n');
  const start = lines.indexOf('*** Begin Patch');
  const end = lines.indexOf('*** End Patch');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Invalid patch format');
  }

  const hunks: PatchHunk[] = [];
  let i = start + 1;
  while (i < end) {
    const line = lines[i];

    if (line.startsWith('*** Add File: ')) {
      const filePath = line.replace('*** Add File: ', '').trim();
      const contentLines: string[] = [];
      i++;
      while (i < end && !lines[i].startsWith('***')) {
        const l = lines[i];
        contentLines.push(l.startsWith('+') ? l.slice(1) : l);
        i++;
      }
      hunks.push({ type: 'add', filePath, content: contentLines.join('\n') });
      continue;
    }

    if (line.startsWith('*** Delete File: ')) {
      const filePath = line.replace('*** Delete File: ', '').trim();
      hunks.push({ type: 'delete', filePath });
      i++;
      continue;
    }

    if (line.startsWith('*** Update File: ')) {
      const filePath = line.replace('*** Update File: ', '').trim();
      i++;
      let movePath: string | undefined;
      if (lines[i]?.startsWith('*** Move to: ')) {
        movePath = lines[i].replace('*** Move to: ', '').trim();
        i++;
      }
      const { chunks, nextIdx } = parseUpdateFileChunks(lines.slice(0, end), i);
      hunks.push({ type: 'update', filePath, movePath, chunks });
      i = nextIdx;
      continue;
    }

    i++;
  }

  return hunks;
}

function seekSequence(
  lines: string[],
  pattern: string[],
  startIndex: number,
  ignoreTrailingWhitespace: boolean,
): number {
  if (pattern.length === 0) return -1;

  const matchLine = (a: string, b: string) =>
    ignoreTrailingWhitespace ? a.trimEnd() === b.trimEnd() : a === b;

  for (let i = startIndex; i <= lines.length - pattern.length; i++) {
    let matches = true;
    for (let j = 0; j < pattern.length; j++) {
      if (!matchLine(lines[i + j], pattern[j])) {
        matches = false;
        break;
      }
    }
    if (matches) return i;
  }
  return -1;
}

function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[],
  ignoreTrailingWhitespace: boolean,
): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.change_context) {
      const contextIdx = seekSequence(
        originalLines,
        [chunk.change_context],
        lineIndex,
        ignoreTrailingWhitespace,
      );
      if (contextIdx === -1) {
        throw new Error(`Failed to find context '${chunk.change_context}' in ${filePath}`);
      }
      lineIndex = contextIdx + 1;
    }

    if (chunk.old_lines.length === 0) {
      const insertionIdx =
        originalLines.length > 0 && originalLines[originalLines.length - 1] === ''
          ? originalLines.length - 1
          : originalLines.length;
      const targetIdx = chunk.is_end_of_file ? insertionIdx : lineIndex;
      replacements.push([targetIdx, 0, chunk.new_lines]);
      continue;
    }

    let pattern = chunk.old_lines;
    let newSlice = chunk.new_lines;
    let found = seekSequence(originalLines, pattern, lineIndex, ignoreTrailingWhitespace);

    if (found === -1 && pattern.length > 0 && pattern[pattern.length - 1] === '') {
      pattern = pattern.slice(0, -1);
      if (newSlice.length > 0 && newSlice[newSlice.length - 1] === '') {
        newSlice = newSlice.slice(0, -1);
      }
      found = seekSequence(originalLines, pattern, lineIndex, ignoreTrailingWhitespace);
    }

    if (found === -1) {
      throw new Error(
        `Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join('\n')}`,
      );
    }

    replacements.push([found, pattern.length, newSlice]);
    lineIndex = found + pattern.length;
  }

  replacements.sort((a, b) => a[0] - b[0]);
  return replacements;
}

function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
  const result = [...lines];
  for (let i = replacements.length - 1; i >= 0; i--) {
    const [startIdx, oldLen, newSegment] = replacements[i];
    result.splice(startIdx, oldLen);
    for (let j = 0; j < newSegment.length; j++) {
      result.splice(startIdx + j, 0, newSegment[j]);
    }
  }
  return result;
}

function deriveNewContentsFromChunks(
  filePath: string,
  chunks: UpdateFileChunk[],
  ignoreTrailingWhitespace: boolean,
  originalContent: string,
) {
  const normalized = normalizeLineEndings(originalContent);
  const originalLines = normalized.split('\n');

  if (originalLines.length > 0 && originalLines[originalLines.length - 1] === '') {
    originalLines.pop();
  }

  const replacements = computeReplacements(
    originalLines,
    filePath,
    chunks,
    ignoreTrailingWhitespace,
  );
  const newLines = applyReplacements(originalLines, replacements);

  if (newLines.length === 0 || newLines[newLines.length - 1] !== '') {
    newLines.push('');
  }

  return newLines.join('\n');
}

export async function applyPatchInSandbox(
  sandboxId: string,
  patchText: string,
  ignoreTrailingWhitespace = true,
) {
  const hunks = parsePatchText(patchText);
  if (hunks.length === 0) throw new Error('No changes found in patch');

  const sandbox = await getSandboxById(sandboxId);
  const changed: string[] = [];
  let totalDiff = '';

  for (const h of hunks) {
    const rawPath = normalizeSandboxPath(h.filePath);

    if (h.type === 'add') {
      await ensureSandboxDir(sandboxId, rawPath);
      await sandbox.fs.uploadFiles([createFileUploadFormat(h.content, rawPath)]);
      totalDiff += createTwoFilesPatch(rawPath, rawPath, '', h.content) + '\n';
      changed.push(rawPath);
      continue;
    }

    if (h.type === 'delete') {
      const oldContent = await readSandboxTextFile(sandboxId, rawPath);
      await sandbox.fs.deleteFile(rawPath, true);
      totalDiff += createTwoFilesPatch(rawPath, rawPath, oldContent, '') + '\n';
      changed.push(rawPath);
      continue;
    }

    const oldContent = await readSandboxTextFile(sandboxId, rawPath);
    const patched = deriveNewContentsFromChunks(
      rawPath,
      h.chunks,
      ignoreTrailingWhitespace,
      oldContent,
    );

    if (h.movePath) {
      const movePath = normalizeSandboxPath(h.movePath);
      await ensureSandboxDir(sandboxId, movePath);
      await sandbox.fs.uploadFiles([createFileUploadFormat(patched, movePath)]);
      await sandbox.fs.deleteFile(rawPath, true);
      totalDiff += createTwoFilesPatch(rawPath, movePath, oldContent, patched) + '\n';
      changed.push(movePath);
    } else {
      await sandbox.fs.uploadFiles([createFileUploadFormat(patched, rawPath)]);
      totalDiff += createTwoFilesPatch(rawPath, rawPath, oldContent, patched) + '\n';
      changed.push(rawPath);
    }
  }

  return {
    output: `Patch applied in sandbox:\n${changed.map(p => `  ${p}`).join('\n')}`,
    files: changed,
    diff: totalDiff.trim(),
  };
}

export function parseFrontmatter(content: string) {
  if (!content.startsWith('---')) return { body: content };
  const end = content.indexOf('\n---');
  if (end === -1) return { body: content };
  const fm = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();
  const result: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    result[key] = val;
  }
  return { frontmatter: result, body };
}

export function formatSkillList(skills: Array<{ name: string; description?: string }>) {
  if (skills.length === 0) {
    return 'Load a skill to get detailed instructions for a specific task. No skills are currently available.';
  }
  return [
    'Load a skill to get detailed instructions for a specific task.',
    'Skills provide specialized knowledge and step-by-step guidance.',
    'Use this when a task matches an available skill\'s description.',
    '<available_skills>',
    ...skills.flatMap(skill => [
      '  <skill>',
      `    <name>${skill.name}</name>`,
      `    <description>${skill.description ?? ''}</description>`,
      '  </skill>',
    ]),
    '</available_skills>',
  ].join(' ');
}

function normalizeSkillText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenizeAscii(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
}

export function scoreSkillMatch(task: string, skill: { name: string; description?: string }) {
  const haystack = normalizeSkillText(task);
  if (!haystack) return 0;
  const name = normalizeSkillText(skill.name);
  if (!name) return 0;

  let score = 0;
  if (haystack.includes(name)) score += 10;

  const nameTokens = tokenizeAscii(name);
  for (const token of nameTokens) {
    if (haystack.includes(token)) score += 2;
  }

  if (skill.description) {
    const desc = normalizeSkillText(skill.description);
    if (desc && desc.length <= 32 && haystack.includes(desc)) score += 5;
    const descTokens = tokenizeAscii(desc);
    let matches = 0;
    for (const token of descTokens) {
      if (haystack.includes(token)) matches += 1;
    }
    score += Math.min(5, matches);
  }

  return score;
}

export function pickBestSkillMatch<T extends { name: string; description?: string }>(
  task: string,
  skills: T[],
  options?: { minScore?: number; minDelta?: number },
) {
  let best: T | undefined;
  let bestScore = 0;
  let runnerUp = 0;

  for (const skill of skills) {
    const score = scoreSkillMatch(task, skill);
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = skill;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  const minScore = options?.minScore ?? 5;
  const minDelta = options?.minDelta ?? 2;
  if (bestScore >= minScore || (bestScore >= 3 && bestScore >= runnerUp + minDelta)) {
    return { skill: best, score: bestScore };
  }
  return { skill: undefined, score: bestScore };
}

export function pickTopSkillMatches<T extends { name: string; description?: string }>(
  task: string,
  skills: T[],
  options?: { minScore?: number; limit?: number },
) {
  const minScore = options?.minScore ?? 5;
  const limit = Math.max(1, options?.limit ?? 3);
  const scored = skills
    .map(skill => ({ skill, score: scoreSkillMatch(task, skill) }))
    .filter(entry => entry.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

type SkillEntry = { name: string; description?: string; filePath: string };

const skillCache = new Map<string, { expiresAt: number; skills: SkillEntry[] }>();

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) break;
      results[current] = await mapper(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function loadSkills(sandboxId: string, dir: string) {
  const cacheKey = `${sandboxId}:${dir}`;
  const cached = skillCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.skills;
  }
  const { stdout, stderr, exitCode } = await runSandboxCommand(
    sandboxId,
    `rg --files -g 'SKILL.md' -g 'skill.md' ${dir}`,
    dir,
    30000,
  );
  if (exitCode !== 0) {
    const message = stderr.trim();
    if (!message || message.includes('No such file or directory')) {
      return [];
    }
    throw new Error(`rg --files failed: ${message}`);
  }

  const files = stdout
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const entries = await mapWithConcurrency(files, 8, async file => {
    const raw = await readSandboxTextFile(sandboxId, file).catch(() => '');
    if (!raw) return null;
    const { frontmatter } = parseFrontmatter(raw);
    const folderName = path.posix.basename(path.posix.dirname(file));
    const name = frontmatter?.name || folderName;
    const description = frontmatter?.description;
    return { name, description, filePath: file } satisfies SkillEntry;
  });
  const skills = entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const sorted = skills.sort((a, b) => a.name.localeCompare(b.name));
  skillCache.set(cacheKey, { expiresAt: now + SKILL_CACHE_TTL_MS, skills: sorted });
  return sorted;
}

const todoStore = new Map<string, TodoItem[]>();

type SessionScopeContext = {
  agent?: {
    threadId?: string;
    resourceId?: string;
    requestContext?: { get?: (key: string) => unknown };
  };
  requestContext?: { get?: (key: string) => unknown };
  runtimeContext?: { get?: (key: string) => unknown };
  context?: {
    requestContext?: { get?: (key: string) => unknown };
  };
  threadId?: string;
  resourceId?: string;
};

function readContextString(context: SessionScopeContext | undefined, key: string) {
  const candidates = [
    context?.requestContext,
    context?.runtimeContext,
    context?.context?.requestContext,
    context?.agent?.requestContext,
  ];

  for (const candidate of candidates) {
    const value = candidate?.get?.(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function resolveLocalSessionScope(context?: SessionScopeContext) {
  return (
    readContextString(context, 'threadId') ??
    context?.agent?.threadId ??
    context?.threadId ??
    readContextString(context, 'workspaceRoot') ??
    readContextString(context, 'resourceId') ??
    context?.agent?.resourceId ??
    context?.resourceId ??
    'default'
  );
}

export function readTodos(sandboxId: string, sessionId: string) {
  const key = `${sandboxId}:${sessionId}`;
  return todoStore.get(key) ?? [];
}

export function writeTodos(sandboxId: string, sessionId: string, todos: TodoItem[]) {
  const key = `${sandboxId}:${sessionId}`;
  todoStore.set(
    key,
    todos.map(item => ({ ...item })),
  );
}

export function buildProjectPathCandidates(projectPath?: string) {
  const candidates: string[] = [];
  if (projectPath) {
    candidates.push(projectPath);
    if (projectPath.startsWith('/')) {
      candidates.push(projectPath.slice(1));
    }
  } else {
    candidates.push('workspace', '/workspace', '.');
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

export { normalizeSandboxPath };
