import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RequestContext } from '@mastra/core/request-context';
import { LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS, Workspace } from '@mastra/core/workspace';
import { resolveUserSkillDirectories, resolveWorkspaceSkillDirectories } from '../skills';
import {
  getLastActiveWorkspaceRoot,
  getThreadBoundWorkspaceRoot,
} from './thread-workspace-root';

const workspaceCache = new Map<string, Workspace>();
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function getRequestContextString(requestContext: RequestContext, key: string) {
  const value = requestContext.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resolveWorkspaceRoot(input?: string) {
  return path.resolve(input ?? process.env.MASTRA_WORKSPACE_ROOT ?? repoRoot);
}

function resolveSkillDirectories(workspaceRoot: string) {
  return [...new Set([...resolveWorkspaceSkillDirectories(workspaceRoot), ...resolveUserSkillDirectories()])].filter(
    candidate => existsSync(candidate),
  );
}

export function resolveWorkspaceRootFromRequest(requestContext: RequestContext) {
  const requestedRoot = getRequestContextString(requestContext, 'workspaceRoot');
  const threadId = getRequestContextString(requestContext, 'threadId');
  const cachedThreadRoot = getThreadBoundWorkspaceRoot(threadId);
  return resolveWorkspaceRoot(
    requestedRoot ?? cachedThreadRoot ?? getLastActiveWorkspaceRoot() ?? undefined,
  );
}

export function getWorkspaceForRoot(workspaceRoot: string) {
  const normalizedRoot = resolveWorkspaceRoot(workspaceRoot);
  const cached = workspaceCache.get(normalizedRoot);
  if (cached) return cached;

  const workspace = new Workspace({
    id: `local-workspace-${normalizedRoot.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    name: `Local Workspace (${path.basename(normalizedRoot) || normalizedRoot})`,
    filesystem: new LocalFilesystem({
      basePath: normalizedRoot,
      contained: true,
    }),
    sandbox: new LocalSandbox({
      workingDirectory: normalizedRoot,
      isolation: process.env.MASTRA_LOCAL_SANDBOX_ISOLATION === 'seatbelt' ? 'seatbelt' : 'none',
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        SHELL: process.env.SHELL ?? '',
        TERM: process.env.TERM ?? 'xterm-256color',
        NODE_ENV: process.env.NODE_ENV ?? 'development',
      },
      instructions: ({ defaultInstructions }) =>
        `${defaultInstructions} This workspace runs on the local machine at ${normalizedRoot}.`,
    }),
    skills: resolveSkillDirectories(normalizedRoot),
    bm25: true,
    lsp: {
      diagnosticTimeout: Number(process.env.MASTRA_LSP_DIAGNOSTIC_TIMEOUT_MS ?? 4_000),
      initTimeout: Number(process.env.MASTRA_LSP_INIT_TIMEOUT_MS ?? 8_000),
      searchPaths: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'],
    },
    tools: {
      enabled: true,
      [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
        enabled: false,
        name: 'read',
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
        enabled: false,
        name: 'write',
        requireReadBeforeWrite: true,
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
        enabled: false,
        name: 'edit',
        requireReadBeforeWrite: true,
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: {
        name: 'list',
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
        name: 'rm',
        maxOutputTokens: 2_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: {
        name: 'stat',
        maxOutputTokens: 2_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: {
        name: 'mkdir',
        maxOutputTokens: 2_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.GREP]: {
        name: 'grep',
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: {
        name: 'ast_edit',
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
        enabled: false,
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
        name: 'getProcessOutput',
        maxOutputTokens: 4_000,
      },
      [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: {
        name: 'killProcess',
        maxOutputTokens: 2_000,
      },
      [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: {
        name: 'lsp_inspect',
        maxOutputTokens: 4_000,
      },
    },
  });

  workspaceCache.set(normalizedRoot, workspace);
  return workspace;
}

export function getWorkspaceForRequest(requestContext: RequestContext) {
  return getWorkspaceForRoot(resolveWorkspaceRootFromRequest(requestContext));
}
