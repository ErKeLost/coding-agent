"use client";

export type DesktopWorkspaceNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: DesktopWorkspaceNode[];
};

export type DesktopWorkspaceFile = {
  name: string;
  path: string;
  language: string;
  content: string;
};

export type DesktopWorkspacePayload = {
  rootPath: string;
  rootName: string;
  tree: DesktopWorkspaceNode[];
  activeFile: DesktopWorkspaceFile | null;
};

export type WorkspaceBranchPayload = {
  hasGit: boolean;
  currentBranch: string | null;
  branches: string[];
  hasChanges: boolean;
  hasRemote: boolean;
};

export type WorkspaceContentSearchMatch = {
  line: number;
  text: string;
};

export type WorkspaceContentSearchFile = {
  path: string;
  name: string;
  totalMatches: number;
  matches: WorkspaceContentSearchMatch[];
};

export type WorkspaceGitChange = {
  path: string;
  stagedStatus: string;
  unstagedStatus: string;
  isUntracked: boolean;
};

export type WorkspaceGitDiffPayload = {
  path: string;
  staged: string;
  unstaged: string;
};

export type DesktopTerminalSession = {
  sessionId: string;
  cwd: string;
  shell: string;
};

export type DesktopTerminalOutput = {
  sessionId: string;
  output: string;
  nextOffset: number;
};

export type DesktopTerminalOutputEvent = {
  sessionId: string;
  output: string;
  nextOffset: number;
};

export type PickedWorkspaceFile = {
  rootPath: string;
  relativePath: string;
  name: string;
};

const LAST_WORKSPACE_STORAGE_KEY = "desktop-last-workspace-root";

export const isTauriDesktop = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

const getInvoke = async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
};

const getListen = async () => {
  const { listen } = await import("@tauri-apps/api/event");
  return listen;
};

export const pickWorkspaceDirectory = async () => {
  const invoke = await getInvoke();
  return invoke<string | null>("pick_workspace_directory");
};

export const pickWorkspaceFile = async () => {
  const invoke = await getInvoke();
  return invoke<PickedWorkspaceFile | null>("pick_workspace_file");
};

export const loadDesktopWorkspace = async (path: string) => {
  const invoke = await getInvoke();
  return invoke<DesktopWorkspacePayload>("load_workspace", { path });
};

export const readDesktopWorkspaceFile = async (relativePath: string) => {
  const invoke = await getInvoke();
  return invoke<DesktopWorkspaceFile>("read_workspace_file", {
    relativePath,
  });
};

export const getWorkspaceBranches = async (path: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceBranchPayload>("get_workspace_branches", { path });
};

export const switchWorkspaceBranch = async (path: string, branch: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceBranchPayload>("switch_workspace_branch", {
    path,
    branch,
  });
};

export const commitWorkspaceChanges = async (path: string, message: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceBranchPayload>("commit_workspace_changes", {
    path,
    message,
  });
};

export const commitWorkspaceStagedChanges = async (path: string, message: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceBranchPayload>("commit_workspace_staged_changes", {
    path,
    message,
  });
};

export const pushWorkspaceBranch = async (path: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceBranchPayload>("push_workspace_branch", { path });
};

export const searchWorkspaceContent = async (path: string, query: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceContentSearchFile[]>("search_workspace_content", {
    path,
    query,
  });
};

export const openWorkspaceTerminal = async (path: string) => {
  const invoke = await getInvoke();
  return invoke<void>("open_workspace_terminal", { path });
};

export const openExternalUrl = async (url: string) => {
  const normalized = url.trim();
  if (!normalized) return;
  if (isTauriDesktop()) {
    const invoke = await getInvoke();
    return invoke<void>("open_external_url", { url: normalized });
  }
  window.open(normalized, "_blank", "noopener,noreferrer");
};

export const getWorkspaceGitChanges = async (path: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceGitChange[]>("get_workspace_git_changes", { path });
};

export const getWorkspaceGitDiff = async (path: string, filePath: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceGitDiffPayload>("get_workspace_git_diff", {
    path,
    filePath,
  });
};

export const stageWorkspaceFile = async (path: string, filePath: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceGitChange[]>("stage_workspace_file", {
    path,
    filePath,
  });
};

export const unstageWorkspaceFile = async (path: string, filePath: string) => {
  const invoke = await getInvoke();
  return invoke<WorkspaceGitChange[]>("unstage_workspace_file", {
    path,
    filePath,
  });
};

export const startDesktopTerminalSession = async (path: string) => {
  const invoke = await getInvoke();
  return invoke<DesktopTerminalSession>("start_terminal_session", { path });
};

export const readDesktopTerminalSession = async (sessionId: string, offset = 0) => {
  const invoke = await getInvoke();
  return invoke<DesktopTerminalOutput>("read_terminal_session", { sessionId, offset });
};

export const writeDesktopTerminalSession = async (sessionId: string, input: string) => {
  const invoke = await getInvoke();
  return invoke<void>("write_terminal_session", { sessionId, input });
};

export const resizeDesktopTerminalSession = async (
  sessionId: string,
  cols: number,
  rows: number,
) => {
  const invoke = await getInvoke();
  return invoke<void>("resize_terminal_session", { sessionId, cols, rows });
};

export const stopDesktopTerminalSession = async (sessionId: string) => {
  const invoke = await getInvoke();
  return invoke<void>("stop_terminal_session", { sessionId });
};

export const listenDesktopTerminalOutput = async (
  sessionId: string,
  onOutput: (payload: DesktopTerminalOutputEvent) => void,
) => {
  const listen = await getListen();
  return listen<DesktopTerminalOutputEvent>(`terminal-output://${sessionId}`, (event) => {
    onOutput(event.payload);
  });
};

export const getStoredWorkspaceRoot = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LAST_WORKSPACE_STORAGE_KEY);
};

export const setStoredWorkspaceRoot = (path: string | null) => {
  if (typeof window === "undefined") return;

  if (!path) {
    window.localStorage.removeItem(LAST_WORKSPACE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(LAST_WORKSPACE_STORAGE_KEY, path);
};
