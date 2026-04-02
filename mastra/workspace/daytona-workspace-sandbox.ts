import type { Sandbox } from '@daytonaio/sdk';
import { getDaytonaClient } from '../tools/daytona-client';
import {
  MastraSandbox,
  type CommandResult,
  type ExecuteCommandOptions,
  type ProviderStatus,
  type SandboxInfo,
} from '@mastra/core/workspace';

export interface DaytonaWorkspaceSandboxOptions {
  id?: string;
  name?: string;
  sandboxId?: string;
  sandboxIdResolver?: () => string | Promise<string>;
  timeoutMs?: number;
  workingDirectory?: string;
  destroyBehavior?: 'stop' | 'delete';
}

function toSeconds(timeoutMs: number | undefined, fallbackMs: number): number {
  const timeout = timeoutMs ?? fallbackMs;
  if (timeout <= 0) return 0;
  return Math.ceil(timeout / 1000);
}

function shellQuoteArg(value: string): string {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise.finally(() => clearTimeout(timer));
    }),
  ]);
}

export class DaytonaWorkspaceSandbox extends MastraSandbox {
  readonly id: string;
  readonly name: string;
  readonly provider = 'daytona';
  readonly workingDirectory: string;
  status: ProviderStatus = 'pending';

  private readonly sandboxIdFromOptions?: string;
  private readonly sandboxIdResolver?: () => string | Promise<string>;
  private readonly timeoutMs: number;
  private readonly destroyBehavior: 'stop' | 'delete';
  private sandbox: Sandbox | null = null;
  private activeSandboxId: string | null = null;

  constructor(options: DaytonaWorkspaceSandboxOptions = {}) {
    const id = options.id ?? 'daytona-workspace-sandbox';
    const name = options.name ?? 'Daytona Workspace Sandbox';
    super({ name });
    this.id = id;
    this.name = name;
    this.sandboxIdFromOptions = options.sandboxId;
    this.sandboxIdResolver = options.sandboxIdResolver;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.workingDirectory = options.workingDirectory ?? '/workspace';
    this.destroyBehavior = options.destroyBehavior ?? 'stop';
  }

  private async resolveSandboxId(): Promise<string> {
    if (this.sandboxIdResolver) {
      const resolved = await this.sandboxIdResolver();
      if (resolved?.trim()) return resolved.trim();
    }
    if (this.sandboxIdFromOptions?.trim()) return this.sandboxIdFromOptions.trim();
    const fromEnv = process.env.DAYTONA_SANDBOX_ID?.trim();
    if (fromEnv) return fromEnv;
    throw new Error(
      'Daytona workspace sandbox is missing sandbox ID. Set DAYTONA_SANDBOX_ID or pass sandboxId.'
    );
  }

  private async getSandbox(): Promise<Sandbox> {
    try {
      const sandboxId = await this.resolveSandboxId();
      if (this.sandbox && this.activeSandboxId === sandboxId) {
        this.status = 'ready';
        return this.sandbox;
      }

      const daytona = getDaytonaClient();
      const sandbox = await withTimeout(
        daytona.get(sandboxId),
        this.timeoutMs,
        `Loading sandbox ${sandboxId}`,
      );
      this.sandbox = sandbox;
      this.activeSandboxId = sandboxId;
      this.status = 'ready';
      return sandbox;
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  async start(): Promise<void> {
    const sandbox = await this.getSandbox();
    if (sandbox.state !== 'started') {
      await withTimeout(
        sandbox.start(toSeconds(this.timeoutMs, this.timeoutMs)),
        this.timeoutMs,
        `Starting sandbox ${sandbox.id}`,
      );
    }
    this.status = 'ready';
  }

  async stop(): Promise<void> {
    if (!this.sandbox) return;
    await withTimeout(
      this.sandbox.stop(toSeconds(this.timeoutMs, this.timeoutMs)),
      this.timeoutMs,
      `Stopping sandbox ${this.sandbox.id}`,
    );
    this.status = 'pending';
  }

  async destroy(): Promise<void> {
    if (!this.sandbox) return;
    if (this.destroyBehavior === 'delete') {
      await withTimeout(
        this.sandbox.delete(toSeconds(this.timeoutMs, this.timeoutMs)),
        this.timeoutMs,
        `Deleting sandbox ${this.sandbox.id}`,
      );
    } else {
      await withTimeout(
        this.sandbox.stop(toSeconds(this.timeoutMs, this.timeoutMs)),
        this.timeoutMs,
        `Stopping sandbox ${this.sandbox.id}`,
      );
    }
    this.status = 'pending';
  }

  async executeCommand(
    command: string,
    args: string[] = [],
    options: ExecuteCommandOptions = {}
  ): Promise<CommandResult> {
    await this.ensureRunning();
    const sandbox = await this.getSandbox();

    const startedAt = Date.now();
    const fullCommand =
      args.length > 0 ? `${command} ${args.map((arg) => shellQuoteArg(arg)).join(' ')}` : command;

    const response = await sandbox.process.executeCommand(
      fullCommand,
      options.cwd ?? this.workingDirectory,
      options.env,
      toSeconds(options.timeout, this.timeoutMs)
    );

    const stdout = response.artifacts?.stdout ?? response.result ?? '';
    const stderr = '';
    options.onStdout?.(stdout);
    if (stderr) options.onStderr?.(stderr);

    return {
      success: response.exitCode === 0,
      exitCode: response.exitCode,
      stdout,
      stderr,
      executionTimeMs: Date.now() - startedAt,
      command,
      args,
    };
  }

  async getInfo(): Promise<SandboxInfo> {
    const sandbox = await this.getSandbox();
    return {
      id: sandbox.id,
      name: this.name,
      provider: this.provider,
      status: this.status,
      createdAt: sandbox.createdAt ? new Date(sandbox.createdAt) : new Date(),
      lastUsedAt: sandbox.updatedAt ? new Date(sandbox.updatedAt) : undefined,
      resources: {
        cpuCores: sandbox.cpu,
        memoryMB: sandbox.memory ? sandbox.memory * 1024 : undefined,
        diskMB: sandbox.disk ? sandbox.disk * 1024 : undefined,
      },
      metadata: {
        sandboxState: sandbox.state,
        sandboxId: sandbox.id,
      },
    };
  }

  getInstructions(): string {
    return [
      `This workspace executes commands in a remote Daytona sandbox.`,
      `Default working directory: ${this.workingDirectory}.`,
      `Use the workspace execute command tool for shell commands.`,
    ].join(' ');
  }
}
