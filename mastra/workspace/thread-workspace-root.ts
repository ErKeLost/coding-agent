const threadWorkspaceRootCache = new Map<string, string>();
let lastActiveWorkspaceRoot: string | null = null;

export function getThreadBoundWorkspaceRoot(threadId?: string) {
  if (!threadId) return undefined;
  return threadWorkspaceRootCache.get(threadId);
}

export function getLastActiveWorkspaceRoot() {
  return lastActiveWorkspaceRoot ?? undefined;
}

export function bindWorkspaceRootToThread(threadId: string, workspaceRoot: string) {
  const normalizedThreadId = threadId.trim();
  const normalizedWorkspaceRoot = workspaceRoot.trim();
  if (!normalizedThreadId || !normalizedWorkspaceRoot) return;
  threadWorkspaceRootCache.set(normalizedThreadId, normalizedWorkspaceRoot);
  lastActiveWorkspaceRoot = normalizedWorkspaceRoot;
}

export function setActiveWorkspaceRoot(workspaceRoot: string) {
  const normalizedWorkspaceRoot = workspaceRoot.trim();
  if (!normalizedWorkspaceRoot) return;
  lastActiveWorkspaceRoot = normalizedWorkspaceRoot;
}