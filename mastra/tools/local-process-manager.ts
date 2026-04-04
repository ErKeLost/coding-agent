import { randomUUID } from 'node:crypto';
import { ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LocalProcessRecord } from '@/lib/local-process';
import {
  findProcessRecord,
  readProcessRegistry,
  updateProcessRecord,
  upsertProcessRecord,
} from './local-process-registry';

type ManagedProcessKind = LocalProcessRecord['kind'];
type ManagedProcessStatus = LocalProcessRecord['status'];

type ManagedProcessState = {
  child: ChildProcess;
  record: LocalProcessRecord;
  outputVersion: number;
  waiters: Set<() => void>;
};

type StartManagedProcessOptions = {
  kind: ManagedProcessKind;
  command: string;
  cwd: string;
  detached?: boolean;
  metadata?: Partial<Pick<LocalProcessRecord, 'host' | 'port' | 'url'>>;
};

const managedProcesses = new Map<string, ManagedProcessState>();

function notifyWaiters(state: ManagedProcessState) {
  state.outputVersion += 1;
  for (const notify of state.waiters) {
    notify();
  }
}

function ensureLogDir() {
  const logDir = path.join(os.homedir(), '.coding-agent', 'logs');
  mkdirSync(logDir, { recursive: true });
  return logDir;
}

function createLogFile(kind: ManagedProcessKind) {
  const logDir = ensureLogDir();
  const logPath = path.join(logDir, `${kind}-${Date.now()}.log`);
  writeFileSync(logPath, '');
  return logPath;
}

function tailText(text: string, lines: number) {
  return text.split(/\r?\n/).slice(-lines).join('\n').trim();
}

function markProcessStatus(processId: string, status: ManagedProcessStatus) {
  const live = managedProcesses.get(processId);
  if (live) {
    live.record = {
      ...live.record,
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  return updateProcessRecord(processId, { status }) ?? (live ? live.record : null);
}

export function startManagedProcess({
  kind,
  command,
  cwd,
  detached = false,
  metadata,
}: StartManagedProcessOptions) {
  const processId = `${kind}-${randomUUID()}`;
  const logPath = createLogFile(kind);

  const child = spawn(command, {
    cwd,
    detached,
    env: { ...process.env },
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const now = new Date().toISOString();
  const record: LocalProcessRecord = {
    id: processId,
    kind,
    command,
    workingDirectory: cwd,
    ...metadata,
    pid: child.pid ?? undefined,
    logPath,
    status: 'running',
    createdAt: now,
    updatedAt: now,
  };

  const state: ManagedProcessState = {
    child,
    record,
    outputVersion: 0,
    waiters: new Set(),
  };
  managedProcesses.set(processId, state);
  upsertProcessRecord(record);

  const appendChunk = (chunk: unknown) => {
    appendFileSync(logPath, chunk);
    state.record.updatedAt = new Date().toISOString();
    upsertProcessRecord(state.record);
    notifyWaiters(state);
  };

  child.stdout?.on('data', appendChunk);
  child.stderr?.on('data', appendChunk);

  child.once('close', (code) => {
    const nextStatus: ManagedProcessStatus = code === 0 ? 'stopped' : 'failed';
    state.record = {
      ...state.record,
      exitCode: typeof code === 'number' ? code : undefined,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    upsertProcessRecord(state.record);
    notifyWaiters(state);
    managedProcesses.delete(processId);
  });

  child.once('error', (error) => {
    appendChunk(`\n[process error] ${error instanceof Error ? error.message : String(error)}\n`);
    state.record = {
      ...state.record,
      exitCode: 1,
      status: 'failed',
      updatedAt: new Date().toISOString(),
    };
    upsertProcessRecord(state.record);
    notifyWaiters(state);
    managedProcesses.delete(processId);
  });

  if (detached) {
    child.unref();
  }

  return {
    processId,
    pid: child.pid ?? undefined,
    logPath,
  };
}

function getManagedProcessState(processId: string) {
  return managedProcesses.get(processId) ?? null;
}

export function listManagedProcesses() {
  return readProcessRegistry().map((record) => {
    const live = managedProcesses.get(record.id);
    if (!live) {
      return record;
    }

    return {
      ...record,
      status: live.record.status,
      updatedAt: live.record.updatedAt,
    };
  });
}

function isProcessRunning(pid?: number) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function resolveManagedProcessRecord(processId: string) {
  const live = managedProcesses.get(processId);
  if (live) {
    return live.record;
  }

  const record = findProcessRecord(processId);
  if (!record) return null;

  if (record.status === 'running' && !isProcessRunning(record.pid)) {
    return markProcessStatus(processId, 'stopped') ?? {
      ...record,
      status: 'stopped',
      updatedAt: new Date().toISOString(),
    };
  }

  return record;
}

async function waitForOutputVersion(
  state: ManagedProcessState,
  initialVersion: number,
  timeoutMs: number,
) {
  if (state.outputVersion !== initialVersion) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onNotify = () => {
      cleanup();
      resolve();
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      state.waiters.delete(onNotify);
    };

    state.waiters.add(onNotify);
  });
}

export async function readManagedProcessLogs(
  processId: string,
  options?: { lines?: number; waitForMs?: number },
) {
  const record = resolveManagedProcessRecord(processId);
  if (!record) {
    throw new Error(`Unknown process id: ${processId}`);
  }

  const live = managedProcesses.get(processId);
  if (live && options?.waitForMs && options.waitForMs > 0) {
    const initialVersion = live.outputVersion;
    await waitForOutputVersion(live, initialVersion, options.waitForMs);
  }

  let output = '';
  if (record.logPath) {
    try {
      output = tailText(readFileSync(record.logPath, 'utf8'), options?.lines ?? 80);
    } catch {
      output = '';
    }
  }

  return {
    processId: record.id,
    status: resolveManagedProcessRecord(processId)?.status ?? record.status,
    logPath: record.logPath,
    output,
  };
}

export async function stopManagedProcess(processId: string, force = false) {
  const record = resolveManagedProcessRecord(processId);
  if (!record) {
    throw new Error(`Unknown process id: ${processId}`);
  }

  const live = managedProcesses.get(processId);
  if (live) {
    live.child.kill(force ? 'SIGKILL' : 'SIGTERM');
    notifyWaiters(live);
  } else if (record.pid) {
    try {
      process.kill(record.pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      // Process may already be gone; we still normalize registry state below.
    }
  }

  const updated = markProcessStatus(processId, 'stopped') ?? {
    ...record,
    status: 'stopped' as const,
    updatedAt: new Date().toISOString(),
  };

  return {
    processId: updated.id,
    stopped: true,
    status: updated.status,
  };
}

export async function writeManagedProcessStdin(
  processId: string,
  input: string,
  options?: { waitForMs?: number; lines?: number },
) {
  const state = getManagedProcessState(processId);
  if (!state) {
    throw new Error(`Process is not attached to the current app session: ${processId}`);
  }

  const stdin = state.child.stdin;
  if (!stdin || stdin.destroyed || state.record.status !== 'running') {
    throw new Error(`stdin is not available for process ${processId}`);
  }

  const initialVersion = state.outputVersion;

  await new Promise<void>((resolve, reject) => {
    stdin.write(input, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  if (options?.waitForMs && options.waitForMs > 0) {
    await waitForOutputVersion(state, initialVersion, options.waitForMs);
  }

  return readManagedProcessLogs(processId, {
    lines: options?.lines,
  });
}

export async function cleanManagedProcesses() {
  const running = Array.from(managedProcesses.values()).map((entry) => entry.record.id);
  const stopped: string[] = [];
  for (const processId of running) {
    await stopManagedProcess(processId);
    stopped.push(processId);
  }
  return { stopped };
}
