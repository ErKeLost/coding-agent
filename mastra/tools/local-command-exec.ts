import { spawn } from 'node:child_process';
import { startManagedProcess } from './local-process-manager';

const DEFAULT_TIMEOUT_MS = 120_000;

export type ExecuteLocalCommandKind = 'command' | 'shell' | 'unified-exec';

type ExecuteLocalCommandOptions = {
  command: string;
  cwd: string;
  timeout?: number;
  background?: boolean;
  kind?: ExecuteLocalCommandKind;
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

export async function executeLocalCommand({
  command,
  cwd,
  timeout = DEFAULT_TIMEOUT_MS,
  background = false,
  kind = 'command',
}: ExecuteLocalCommandOptions): Promise<ExecuteLocalCommandResult> {
  const startedAt = Date.now();

  if (background) {
    const managed = startManagedProcess({
      kind,
      command,
      cwd,
    });

    return {
      success: true,
      state: 'running',
      stdout: '',
      stderr: '',
      command,
      executionTime: Date.now() - startedAt,
      pid: managed.pid,
      processId: managed.processId,
      logPath: managed.logPath,
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
