import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { upsertProcessRecord } from './local-process-registry';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_POLL_MS = 250;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function isPortOpen(host: string, port: number) {
  return await new Promise<boolean>(resolve => {
    const socket = net.connect({ host, port });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };

    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1_000, () => done(false));
  });
}

function readLogTail(logPath: string) {
  try {
    const content = readFileSync(logPath, 'utf8');
    return content.split(/\r?\n/).slice(-40).join('\n').trim();
  } catch {
    return '';
  }
}

async function waitForServerReady(options: {
  child: ReturnType<typeof spawn>;
  host: string;
  port: number;
  timeoutMs: number;
  logPath: string;
}) {
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    if (await isPortOpen(options.host, options.port)) {
      return;
    }

    if (options.child.exitCode !== null) {
      const logs = readLogTail(options.logPath);
      throw new Error(logs || `Dev server exited with code ${options.child.exitCode}.`);
    }

    await sleep(DEFAULT_POLL_MS);
  }

  const logs = readLogTail(options.logPath);
  throw new Error(logs || `Timed out waiting for http://${options.host}:${options.port}`);
}

export const startLocalDevServerTool = createTool({
  id: 'startLocalDevServer',
  description:
    'Start a local dev server for this project and return its localhost URL. Prefer this over runCommand/getProcessOutput for bun dev, npm run dev, pnpm dev, or yarn dev.',
  inputSchema: z.object({
    command: z.string().default('bun run dev').describe('Dev server command'),
    workingDirectory: z
      .string()
      .optional()
      .nullable()
      .describe('Working directory for the dev server'),
    host: z.string().default(DEFAULT_HOST).describe('Host to check'),
    port: z.number().int().positive().default(DEFAULT_PORT).describe('Port to check'),
    startupTimeoutMs: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_TIMEOUT_MS)
      .describe('How long to wait for the server to accept connections'),
  }),
  outputSchema: z.object({
    processId: z.string().optional().describe('Stable process id for later log/status/stop operations'),
    url: z.string().describe('Local dev server URL'),
    command: z.string().describe('Command used to start the server'),
    workingDirectory: z.string().describe('Directory used to start the server'),
    host: z.string().describe('Host for the running server'),
    port: z.number().describe('Port for the running server'),
    pid: z.number().optional().describe('PID for the spawned server process'),
    reused: z.boolean().describe('Whether an existing server was reused'),
    logPath: z.string().optional().describe('Path to the startup log file'),
  }),
  execute: async inputData => {
    const host = inputData.host ?? DEFAULT_HOST;
    const port = inputData.port ?? DEFAULT_PORT;
    const command = inputData.command.trim();
    const workingDirectory = path.resolve(inputData.workingDirectory ?? process.cwd());
    const url = `http://${host}:${port}`;

    if (await isPortOpen(host, port)) {
      return {
        processId: undefined,
        url,
        command,
        workingDirectory,
        host,
        port,
        reused: true,
      };
    }

    const logDir = path.join(os.homedir(), '.coding-agent', 'logs');
    mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `dev-server-${Date.now()}.log`);
    writeFileSync(logPath, '');

    const child = spawn(command, {
      cwd: workingDirectory,
      detached: true,
      env: {
        ...process.env,
      },
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

    await waitForServerReady({
      child,
      host,
      port,
      timeoutMs: inputData.startupTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      logPath,
    });

    const now = new Date().toISOString();
    const processId = `dev-${randomUUID()}`;
    upsertProcessRecord({
      id: processId,
      kind: 'dev-server',
      command,
      workingDirectory,
      host,
      port,
      url,
      pid: child.pid ?? undefined,
      logPath,
      status: 'running',
      createdAt: now,
      updatedAt: now,
    });

    return {
      processId,
      url,
      command,
      workingDirectory,
      host,
      port,
      pid: child.pid ?? undefined,
      reused: false,
      logPath,
    };
  },
});
