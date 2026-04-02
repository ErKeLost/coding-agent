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
