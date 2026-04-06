import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  readManagedProcessLogs,
  resolveManagedProcessRecord,
  startManagedProcess,
} from './local-process-manager';

const DEFAULT_TIMEOUT_MS = 120_000;
const BACKGROUND_INITIAL_WAIT_MS = 1200;
const BACKGROUND_INITIAL_LINES = 80;
const UNIFIED_EXEC_SETTLE_WAIT_MS = 75;

const resolveShellExecutable = () => {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'cmd.exe';
  }

  const preferred = process.env.SHELL;
  if (preferred && existsSync(preferred)) {
    return preferred;
  }

  const candidates = ['/bin/sh', '/usr/bin/sh', '/bin/bash', '/usr/bin/bash'];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
};

const commandNeedsShell = (command: string) =>
  /[|&;<>()`$\\\n]/.test(command);

const splitCommand = (command: string) => {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped || quote) return null;
  if (current) tokens.push(current);
  return tokens;
};

const shellSeemsExecutable = (shell: string) => {
  if (process.platform === 'win32') return true;
  const probe = spawnSync(shell, ['-c', 'exit 0'], {
    stdio: 'ignore',
    timeout: 1500,
  });
  return !probe.error;
};

const maybeRewriteExplicitShellWrapper = (command: string) => {
  const wrapperMatch =
    command.match(/^(\S+)\s+-lc\s+(['"])([\s\S]*)\2$/) ??
    command.match(/^(\S+)\s+-c\s+(['"])([\s\S]*)\2$/);
  if (!wrapperMatch) return command;

  const shellPath = wrapperMatch[1];
  const inner = wrapperMatch[3]?.trim();
  if (!inner) return command;

  if (existsSync(shellPath) && shellSeemsExecutable(shellPath)) {
    return command;
  }

  return inner;
};

export type ExecuteLocalCommandKind = 'command' | 'shell' | 'unified-exec';

type ExecuteLocalCommandOptions = {
  command: string;
  cwd: string;
  timeout?: number;
  background?: boolean;
  kind?: ExecuteLocalCommandKind;
  yieldTimeMs?: number;
};

type ExecuteLocalCommandResult = {
  success: boolean;
  state: 'completed' | 'failed' | 'running' | 'timed_out';
  exitCode?: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  command: string;
  executionTime: number;
  metadata: Record<string, unknown>;
  pid?: number;
  sessionId?: string;
  processId?: string;
  logPath?: string;
};

export async function executeLocalCommand({
  command,
  cwd,
  timeout = DEFAULT_TIMEOUT_MS,
  background = false,
  kind = 'command',
  yieldTimeMs,
}: ExecuteLocalCommandOptions): Promise<ExecuteLocalCommandResult> {
  const startedAt = Date.now();

  if (kind === 'unified-exec') {
    const managed = startManagedProcess({
      kind,
      command,
      cwd,
    });

    const initialWaitMs = Math.max(0, yieldTimeMs ?? BACKGROUND_INITIAL_WAIT_MS);
    const initialLogs = managed.processId
      ? await readManagedProcessLogs(managed.processId, {
          lines: BACKGROUND_INITIAL_LINES,
          waitForMs: initialWaitMs,
        }).catch(() => null)
      : null;
    let refreshedRecord = managed.processId
      ? resolveManagedProcessRecord(managed.processId)
      : null;
    if (managed.processId && refreshedRecord?.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, UNIFIED_EXEC_SETTLE_WAIT_MS));
      refreshedRecord = resolveManagedProcessRecord(managed.processId);
    }
    const processStatus = refreshedRecord?.status ?? initialLogs?.status ?? 'running';
    const failed = processStatus === 'failed';
    const completed = processStatus === 'stopped';
    const snapshotOutput = initialLogs?.output ?? '';
    const sessionStillRunning = !failed && !completed;

    return {
      success: !failed,
      state: failed ? 'failed' : completed ? 'completed' : 'running',
      stdout: snapshotOutput,
      stderr: failed ? snapshotOutput : '',
      exitCode: refreshedRecord?.exitCode ?? initialLogs?.exitCode,
      timedOut: false,
      command,
      executionTime: Date.now() - startedAt,
      metadata: {
        background: sessionStillRunning,
        shellMode: false,
        initialOutputObserved: Boolean(snapshotOutput.trim()),
        initialWaitMs,
        unifiedExecSession: true,
      },
      pid: refreshedRecord?.pid ?? managed.pid,
      sessionId: sessionStillRunning ? managed.processId : undefined,
      processId: sessionStillRunning ? managed.processId : undefined,
      logPath: refreshedRecord?.logPath ?? managed.logPath,
    };
  }

  if (background) {
    const managed = startManagedProcess({
      kind,
      command,
      cwd,
    });

    const processRecord = managed.processId
      ? resolveManagedProcessRecord(managed.processId)
      : null;
    const initialLogs = managed.processId
      ? await readManagedProcessLogs(managed.processId, {
          lines: BACKGROUND_INITIAL_LINES,
          waitForMs: BACKGROUND_INITIAL_WAIT_MS,
        }).catch(() => null)
      : null;
    const refreshedRecord = managed.processId
      ? resolveManagedProcessRecord(managed.processId)
      : processRecord;
    const processStatus = refreshedRecord?.status ?? initialLogs?.status ?? 'running';
    const failed = processStatus === 'failed';
    const completed = processStatus === 'stopped';
    const snapshotOutput = initialLogs?.output ?? '';

    return {
      success: !failed,
      state: failed ? 'failed' : completed ? 'completed' : 'running',
      stdout: snapshotOutput,
      stderr: failed ? snapshotOutput : '',
      exitCode: refreshedRecord?.exitCode,
      timedOut: false,
      command,
      executionTime: Date.now() - startedAt,
      metadata: {
        background: true,
        shellMode: false,
        initialOutputObserved: Boolean(snapshotOutput.trim()),
        initialWaitMs: BACKGROUND_INITIAL_WAIT_MS,
      },
      pid: refreshedRecord?.pid ?? managed.pid,
      sessionId: managed.processId,
      processId: managed.processId,
      logPath: refreshedRecord?.logPath ?? managed.logPath,
    };
  }

  return await new Promise((resolve) => {
    const commandToRun = maybeRewriteExplicitShellWrapper(command);
    const directTokens = !commandNeedsShell(commandToRun)
      ? splitCommand(commandToRun)
      : null;
    const canRunDirect = Array.isArray(directTokens) && directTokens.length > 0;
    const shellExecutable = canRunDirect ? null : resolveShellExecutable();

    if (!canRunDirect && (!shellExecutable || !shellSeemsExecutable(shellExecutable))) {
      resolve({
        success: false,
        state: 'failed',
        stdout: '',
        stderr: 'No usable shell executable available for command execution',
        timedOut: false,
        command: commandToRun,
        executionTime: Date.now() - startedAt,
        metadata: {
          background: false,
          shellMode: false,
          reason: 'no_shell_executable',
        },
      });
      return;
    }

    let child;
    try {
      child = canRunDirect
        ? spawn(directTokens[0], directTokens.slice(1), {
            cwd,
            env: { ...process.env },
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
        : spawn(commandToRun, {
            cwd,
            env: { ...process.env },
            shell: shellExecutable ?? undefined,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      resolve({
        success: false,
        state: 'failed',
        stdout: '',
        stderr: message,
        timedOut: false,
        command: commandToRun,
        executionTime: Date.now() - startedAt,
        metadata: {
          background: false,
          shellMode: !canRunDirect,
          reason: 'spawn_error',
        },
      });
      return;
    }

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
      finish({
        success: false,
        state: timedOut ? 'timed_out' : 'failed',
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
        timedOut,
        command: commandToRun,
        executionTime: Date.now() - startedAt,
        metadata: {
          background: false,
          shellMode: !canRunDirect,
          reason: 'runtime_error',
        },
        pid: child.pid ?? undefined,
      });
    });

    child.once('close', code => {
      const executionTime = Date.now() - startedAt;
      finish({
        success: !timedOut && code === 0,
        state: timedOut ? 'timed_out' : code === 0 ? 'completed' : 'failed',
        exitCode: typeof code === 'number' ? code : undefined,
        stdout,
        stderr,
        timedOut,
        command: commandToRun,
        executionTime,
        metadata: {
          background: false,
          shellMode: !canRunDirect,
        },
        pid: child.pid ?? undefined,
      });
    });
  });
}
