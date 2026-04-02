import type { Sandbox } from '@daytonaio/sdk';
import type {
  CopyOptions,
  FileContent,
  FileEntry,
  FileStat,
  FilesystemInfo,
  ListOptions,
  ProviderStatus,
  ReadOptions,
  RemoveOptions,
  WriteOptions,
} from '@mastra/core/workspace';
import { MastraFilesystem } from '@mastra/core/workspace';
import { getDaytonaClient, normalizeSandboxPath } from '../tools/daytona-client';
import { dirname, extname, posix } from 'node:path';

export interface DaytonaWorkspaceFilesystemOptions {
  id?: string;
  name?: string;
  sandboxId?: string;
  sandboxIdResolver?: () => string | Promise<string>;
  timeoutMs?: number;
  readOnly?: boolean;
}

function toSeconds(timeoutMs: number | undefined, fallbackMs: number): number {
  const timeout = timeoutMs ?? fallbackMs;
  if (timeout <= 0) return 0;
  return Math.ceil(timeout / 1000);
}

function toBuffer(content: FileContent): Buffer {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  return Buffer.from(content, 'utf8');
}

function toDate(value: string | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
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

export class DaytonaWorkspaceFilesystem extends MastraFilesystem {
  readonly id: string;
  readonly name: string;
  readonly provider = 'daytona';
  readonly readOnly: boolean;
  status: ProviderStatus = 'pending';

  private readonly sandboxIdFromOptions?: string;
  private readonly sandboxIdResolver?: () => string | Promise<string>;
  private readonly timeoutMs: number;
  private sandbox: Sandbox | null = null;
  private activeSandboxId: string | null = null;

  constructor(options: DaytonaWorkspaceFilesystemOptions = {}) {
    const name = options.name ?? 'Daytona Workspace Filesystem';
    super({ name });
    this.id = options.id ?? 'daytona-workspace-filesystem';
    this.name = name;
    this.readOnly = Boolean(options.readOnly);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.sandboxIdFromOptions = options.sandboxId;
    this.sandboxIdResolver = options.sandboxIdResolver;
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
      'Daytona workspace filesystem is missing sandbox ID. Set DAYTONA_SANDBOX_ID or pass sandboxId.'
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
      if (sandbox.state !== 'started') {
        await withTimeout(
          sandbox.start(toSeconds(this.timeoutMs, this.timeoutMs)),
          this.timeoutMs,
          `Starting sandbox ${sandboxId}`,
        );
      }
      this.sandbox = sandbox;
      this.activeSandboxId = sandboxId;
      this.status = 'ready';
      return sandbox;
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  private assertWritable() {
    if (this.readOnly) {
      throw new Error('Daytona workspace filesystem is read-only.');
    }
  }

  async readFile(inputPath: string, options?: ReadOptions): Promise<string | Buffer> {
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const path = normalizeSandboxPath(inputPath);
    const buffer = await sandbox.fs.downloadFile(path, toSeconds(this.timeoutMs, this.timeoutMs));
    if (options?.encoding) return buffer.toString(options.encoding);
    return buffer;
  }

  async writeFile(inputPath: string, content: FileContent, options?: WriteOptions): Promise<void> {
    this.assertWritable();
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const path = normalizeSandboxPath(inputPath);

    if (options?.overwrite === false && (await this.exists(path))) {
      throw new Error(`File already exists: ${path}`);
    }

    if (options?.recursive) {
      const parent = dirname(path);
      await sandbox.process.executeCommand(`mkdir -p ${JSON.stringify(parent)}`);
    }

    await sandbox.fs.uploadFile(toBuffer(content), path, toSeconds(this.timeoutMs, this.timeoutMs));
  }

  async appendFile(inputPath: string, content: FileContent): Promise<void> {
    this.assertWritable();
    const path = normalizeSandboxPath(inputPath);
    const existing = (await this.exists(path)) ? ((await this.readFile(path)) as Buffer) : Buffer.alloc(0);
    await this.writeFile(path, Buffer.concat([existing, toBuffer(content)]), { overwrite: true, recursive: true });
  }

  async deleteFile(inputPath: string, options?: RemoveOptions): Promise<void> {
    this.assertWritable();
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const path = normalizeSandboxPath(inputPath);
    try {
      await sandbox.fs.deleteFile(path, Boolean(options?.recursive));
    } catch (error) {
      if (!options?.force) throw error;
    }
  }

  async copyFile(src: string, dest: string, options?: CopyOptions): Promise<void> {
    this.assertWritable();
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const source = normalizeSandboxPath(src);
    const target = normalizeSandboxPath(dest);
    if (!options?.overwrite && (await this.exists(target))) {
      throw new Error(`Destination already exists: ${target}`);
    }
    const recursiveFlag = options?.recursive ? '-r ' : '';
    await sandbox.process.executeCommand(
      `cp ${recursiveFlag}${JSON.stringify(source)} ${JSON.stringify(target)}`
    );
  }

  async moveFile(src: string, dest: string, options?: CopyOptions): Promise<void> {
    this.assertWritable();
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const source = normalizeSandboxPath(src);
    const target = normalizeSandboxPath(dest);
    if (!options?.overwrite && (await this.exists(target))) {
      throw new Error(`Destination already exists: ${target}`);
    }
    await sandbox.fs.moveFiles(source, target);
  }

  async mkdir(inputPath: string, options?: { recursive?: boolean }): Promise<void> {
    this.assertWritable();
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const path = normalizeSandboxPath(inputPath);
    if (options?.recursive) {
      await sandbox.process.executeCommand(`mkdir -p ${JSON.stringify(path)}`);
      return;
    }
    await sandbox.fs.createFolder(path, '755');
  }

  async rmdir(inputPath: string, options?: RemoveOptions): Promise<void> {
    this.assertWritable();
    await this.deleteFile(inputPath, options);
  }

  async readdir(inputPath: string, options?: ListOptions): Promise<FileEntry[]> {
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const root = normalizeSandboxPath(inputPath);
    const recursive = Boolean(options?.recursive);
    const maxDepth = options?.maxDepth ?? Number.POSITIVE_INFINITY;
    const extensions = Array.isArray(options?.extension)
      ? options.extension
      : options?.extension
        ? [options.extension]
        : null;

    const entries: FileEntry[] = [];

    const walk = async (path: string, depth: number) => {
      const list = await withTimeout(
        sandbox.fs.listFiles(path),
        this.timeoutMs,
        `Listing files in ${path}`,
      );
      for (const item of list) {
        const childPath = posix.join(path, item.name);
        const entry: FileEntry = {
          name: item.name,
          type: item.isDir ? 'directory' : 'file',
          size: item.isDir ? undefined : item.size,
        };

        if (
          !extensions ||
          entry.type === 'directory' ||
          extensions.includes(extname(item.name))
        ) {
          entries.push(entry);
        }

        if (recursive && item.isDir && depth < maxDepth) {
          await walk(childPath, depth + 1);
        }
      }
    };

    await walk(root, 1);
    return entries;
  }

  async exists(inputPath: string): Promise<boolean> {
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const path = normalizeSandboxPath(inputPath);
    try {
      await sandbox.fs.getFileDetails(path);
      return true;
    } catch {
      return false;
    }
  }

  async stat(inputPath: string): Promise<FileStat> {
    await this.ensureReady();
    const sandbox = await this.getSandbox();
    const path = normalizeSandboxPath(inputPath);
    const info = await sandbox.fs.getFileDetails(path);
    return {
      name: info.name,
      path,
      type: info.isDir ? 'directory' : 'file',
      size: info.size ?? 0,
      createdAt: toDate(info.modTime),
      modifiedAt: toDate(info.modTime),
    };
  }

  async init(): Promise<void> {
    await this.getSandbox();
    this.status = 'ready';
  }

  async destroy(): Promise<void> {
    this.sandbox = null;
    this.activeSandboxId = null;
    this.status = 'pending';
  }

  async getInfo(): Promise<FilesystemInfo> {
    const sandbox = await this.getSandbox();
    return {
      id: this.id,
      name: this.name,
      provider: this.provider,
      status: this.status,
      readOnly: this.readOnly,
      metadata: {
        sandboxId: sandbox.id,
        sandboxState: sandbox.state,
      },
    };
  }

  getInstructions(): string {
    return [
      'This filesystem is backed by a remote Daytona sandbox filesystem.',
      'Use absolute /workspace-style paths.',
    ].join(' ');
  }
}
