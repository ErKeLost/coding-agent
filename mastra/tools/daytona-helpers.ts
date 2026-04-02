import { z } from 'zod';
import { escapeRegExp } from './sandbox-helpers';
import type { getSandbox } from './daytona-client';

export const FileEventSchema = z.enum(['CREATE', 'DELETE', 'WRITE']);

function toRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return '';
}

export function buildShellCommand(command: string, workdir?: string | null, timeoutMs?: number) {
  const baseCommand = workdir ? `cd ${JSON.stringify(workdir)} && ${command}` : command;
  if (timeoutMs && timeoutMs > 0) {
    const timeoutSec = Math.ceil(timeoutMs / 1000);
    return `timeout ${timeoutSec}s bash -lc ${JSON.stringify(baseCommand)}`;
  }
  return `bash -lc ${JSON.stringify(baseCommand)}`;
}

export function compilePatterns(patterns: string[] | undefined, defaults: string[]) {
  const values = patterns && patterns.length > 0 ? patterns : defaults;
  return values.map((pattern) => {
    try {
      return new RegExp(pattern, 'i');
    } catch {
      return new RegExp(escapeRegExp(pattern), 'i');
    }
  });
}

export async function captureSnapshot(
  sandbox: Awaited<ReturnType<typeof getSandbox>>,
  root: string,
  recursive: boolean,
) {
  const script = [
    'import json, os, sys',
    `root = ${JSON.stringify(root)}`,
    `recursive = ${recursive ? 'True' : 'False'}`,
    'result = {}',
    'def add(path):',
    '    try:',
    '        st = os.stat(path)',
    '    except FileNotFoundError:',
    '        return',
    '    result[path] = {"mtime": st.st_mtime, "size": st.st_size}',
    'if recursive:',
    '    for dirpath, dirnames, filenames in os.walk(root):',
    '        for name in dirnames + filenames:',
    '            add(os.path.join(dirpath, name))',
    'else:',
    '    try:',
    '        for name in os.listdir(root):',
    '            add(os.path.join(root, name))',
    '    except FileNotFoundError:',
    '        pass',
    'print(json.dumps(result))',
  ].join('\n');
  const command = `python - <<'PY'\n${script}\nPY`;
  const response = await sandbox.process.executeCommand(command);
  const output = toText(toRecord(response).result ?? toRecord(response).output ?? toRecord(response).stdout);
  if (!output.trim()) return {} as Record<string, { mtime: number; size: number }>;
  return JSON.parse(output) as Record<string, { mtime: number; size: number }>;
}

export function extractCommandResult(result: unknown) {
  const record = toRecord(result);
  const stdout = toText(record.stdout ?? record.output ?? record.result);
  const stderr = toText(record.stderr);
  const exitCode =
    typeof record.exitCode === 'number'
      ? record.exitCode
      : typeof record.exit_code === 'number'
        ? record.exit_code
        : 0;
  return { stdout, stderr, exitCode };
}
