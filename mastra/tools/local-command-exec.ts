import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { upsertProcessRecord } from './local-process-registry';

const DEFAULT_TIMEOUT_MS = 120_000;

type ExecuteLocalCommandOptions = {
  command: string;
  cwd: string;
  timeout?: number;
  background?: boolean;
  kind?: 'command' | 'shell' | 'unified-exec';
};

type ExecuteLocalCommandResult = {
  success: boolean;
  state: 'completed' | 'failed' | 'running' | 'timed_out';
  exitCode?: number;
  stdout: string;
  stderr: string;
  command: string;
  executionTime: number;
  pid?: number;
  processId?: string;
  logPath?: string;
};

function ensureLogDir() {
  const logDir = path.join(os.homedir(), '.coding-agent', 'logs');
  mkdirSync(logDir, { recursive: true });
  return logDir;
}

export async function executeLocalCommand({
  command,
  cwd,
  timeout = DEFAULT_TIMEOUT_MS,
  background = false,
  kind = 'command',
}: ExecuteLocalCommandOptions): Promise<ExecuteLocalCommandResult> {
  const startedAt = Date.now();

  if (background) {
    const logDir = ensureLogDir();
    const logPath = path.join(logDir, `${kind}-${Date.now()}.log`);
    writeFileSync(logPath, '');

    const child = spawn(command, {
      cwd,
      detached: true,
      env: { ...process.env },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', chunk => {
      writeFileSync(logPath, chunk, { flag: 'a' });
    });
    child.stderr?.on('data', chunk => {
      writeFileSync(logPath, chunk, { flag: 'a' });
    });
    child.unref();

    const processId = `${kind}-${randomUUID()}`;
    const now = new Date().toISOString();
    upsertProcessRecord({
      id: processId,
      kind,
      command,
      workingDirectory: cwd,
      pid: child.pid ?? undefined,
      logPath,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      state: 'running',
      stdout: '',
      stderr: '',
      command,
      executionTime: Date.now() - startedAt,
      pid: child.pid ?? undefined,
      processId,
      logPath,
    };
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: { ...process.env },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const finish = (result: ExecuteLocalCommandResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    child.stdout?.on('data', chunk => {
      stdout += String(chunk);
    });

    child.stderr?.on('data', chunk => {
      stderr += String(chunk);
    });

    child.once('error', error => {
      if (finished) return;
      clearTimeout(timer);
      reject(error);
    });

    child.once('close', code => {
      const executionTime = Date.now() - startedAt;
      finish({
        success: !timedOut && code === 0,
        state: timedOut ? 'timed_out' : code === 0 ? 'completed' : 'failed',
        exitCode: typeof code === 'number' ? code : undefined,
        stdout,
        stderr,
        command,
        executionTime,
        pid: child.pid ?? undefined,
      });
    });
  });
}