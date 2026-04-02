import type { RequestContext } from '@mastra/core/request-context';
import { WORKSPACE_TOOLS, Workspace } from '@mastra/core/workspace';
import { DEFAULT_SKILLS_DIR } from '../tools/sandbox-helpers';
import { DaytonaWorkspaceFilesystem } from './daytona-workspace-filesystem';
import { DaytonaWorkspaceSandbox } from './daytona-workspace-sandbox';

const workspaceCache = new Map<string, Workspace>();

export function resolveSandboxIdFromRequest(
  requestContext: RequestContext,
  fallbackSandboxId = process.env.DAYTONA_SANDBOX_ID
): string | undefined {
  const requestSandboxId = requestContext.get('sandboxId');
  if (typeof requestSandboxId === 'string' && requestSandboxId.trim()) {
    return requestSandboxId.trim();
  }
  return fallbackSandboxId;
}

export function getWorkspaceForSandboxId(sandboxId: string): Workspace {
  const normalizedId = sandboxId.trim();
  const cached = workspaceCache.get(normalizedId);
  if (cached) return cached;

  const safeId = normalizedId.replace(/[^a-zA-Z0-9_-]/g, '-');
  const timeoutMs = Number(process.env.DAYTONA_WORKSPACE_TIMEOUT_MS ?? 30_000);
  const workspace = new Workspace({
    id: `daytona-workspace-${safeId}`,
    bm25: true,
    filesystem: new DaytonaWorkspaceFilesystem({
      id: `daytona-filesystem-${safeId}`,
      sandboxId: normalizedId,
      timeoutMs,
    }),
    sandbox: new DaytonaWorkspaceSandbox({
      id: `daytona-sandbox-${safeId}`,
      sandboxId: normalizedId,
      timeoutMs,
      workingDirectory: process.env.DAYTONA_WORKSPACE_CWD ?? '/workspace',
    }),
    skills: [DEFAULT_SKILLS_DIR],
    lsp: {
      diagnosticTimeout: Number(process.env.DAYTONA_LSP_DIAGNOSTIC_TIMEOUT_MS ?? 4_000),
      initTimeout: Number(process.env.DAYTONA_LSP_INIT_TIMEOUT_MS ?? 8_000),
      searchPaths: ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'],
    },
    tools: {
      enabled: false,
      [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: {
        enabled: true,
        name: 'lsp_inspect',
        maxOutputTokens: 4_000,
      },
    },
  });

  workspaceCache.set(normalizedId, workspace);
  return workspace;
}

export function getWorkspaceForRequest(requestContext: RequestContext): Workspace | undefined {
  const sandboxId = resolveSandboxIdFromRequest(requestContext);
  return sandboxId ? getWorkspaceForSandboxId(sandboxId) : undefined;
}
