"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  commitWorkspaceChanges,
  getStoredWorkspaceRoot,
  getWorkspaceBranches,
  isTauriDesktop,
  loadDesktopWorkspace,
  pickWorkspaceDirectory,
  pushWorkspaceBranch,
  readDesktopWorkspaceFile,
  setStoredWorkspaceRoot,
  switchWorkspaceBranch,
  type DesktopWorkspaceFile,
  type DesktopWorkspacePayload,
  type WorkspaceBranchPayload,
} from "@/lib/desktop-workspace";

type UseDesktopWorkspaceOptions = {
  hasMounted: boolean;
  recentThreadCount: number;
  workspaceRoot: string | null;
  currentThreadId: string | null;
  onNewThread: (workspaceRoot?: string | null) => void;
  setWorkspaceRoot: (value: string | null) => void;
  logWorkspaceDebug: (label: string, payload?: Record<string, unknown>) => void;
};

export function useDesktopWorkspace({
  hasMounted,
  recentThreadCount,
  workspaceRoot,
  currentThreadId,
  onNewThread,
  setWorkspaceRoot,
  logWorkspaceDebug,
}: UseDesktopWorkspaceOptions) {
  const [desktopWorkspace, setDesktopWorkspace] =
    useState<DesktopWorkspacePayload | null>(null);
  const [desktopWorkspaceLoading, setDesktopWorkspaceLoading] = useState(false);
  const [desktopWorkspaceError, setDesktopWorkspaceError] = useState<string | null>(null);
  const [commandDialogOpen, setCommandDialogOpen] = useState(true);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState("code");
  const [activeView, setActiveView] = useState<"chat" | "editor">("chat");
  const [editorSelectedFile, setEditorSelectedFile] = useState<DesktopWorkspaceFile | null>(null);
  const [workspaceBranches, setWorkspaceBranches] = useState<WorkspaceBranchPayload | null>(null);
  const [workspaceBranchLoading, setWorkspaceBranchLoading] = useState(false);
  const requestedWorkspaceRootRef = useRef<string | null>(null);

  const isDesktopRuntime = hasMounted && isTauriDesktop();

  const applyDesktopWorkspace = useCallback((payload: DesktopWorkspacePayload) => {
    logWorkspaceDebug("applyDesktopWorkspace", {
      rootPath: payload.rootPath,
      rootName: payload.rootName,
      activeFile: payload.activeFile?.path ?? null,
    });
    setDesktopWorkspace(payload);
    setDesktopWorkspaceError(null);
    setWorkspaceRoot(payload.rootPath);
    setStoredWorkspaceRoot(payload.rootPath);
  }, [logWorkspaceDebug, setWorkspaceRoot]);

  const loadWorkspaceBranches = useCallback(async (targetPath: string) => {
    if (!isTauriDesktop()) {
      setWorkspaceBranches(null);
      return;
    }

    try {
      const payload = await getWorkspaceBranches(targetPath);
      setWorkspaceBranches(payload);
    } catch {
      setWorkspaceBranches({
        hasGit: false,
        currentBranch: null,
        branches: [],
      });
    }
  }, []);

  const loadDesktopWorkspaceFromPath = useCallback(
    async (targetPath: string) => {
      const normalizedTargetPath = targetPath.trim();
      requestedWorkspaceRootRef.current = normalizedTargetPath;
      setDesktopWorkspaceLoading(true);
      try {
        const payload = await loadDesktopWorkspace(normalizedTargetPath);
        if (requestedWorkspaceRootRef.current !== normalizedTargetPath) {
          return;
        }
        applyDesktopWorkspace(payload);
        await loadWorkspaceBranches(payload.rootPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load workspace";
        setDesktopWorkspaceError(message);
      } finally {
        setDesktopWorkspaceLoading(false);
      }
    },
    [applyDesktopWorkspace, loadWorkspaceBranches],
  );

  useEffect(() => {
    if (!isDesktopRuntime || recentThreadCount === 0 || workspaceRoot?.trim()) return;
    const storedRoot = getStoredWorkspaceRoot();
    if (!storedRoot) return;
    logWorkspaceDebug("restoreStoredWorkspaceRoot", {
      storedRoot,
      recentThreads: recentThreadCount,
    });
    void loadDesktopWorkspaceFromPath(storedRoot);
  }, [
    isDesktopRuntime,
    loadDesktopWorkspaceFromPath,
    logWorkspaceDebug,
    recentThreadCount,
    workspaceRoot,
  ]);

  useEffect(() => {
    if (!isDesktopRuntime) return;

    const normalizedWorkspaceRoot =
      typeof workspaceRoot === "string" && workspaceRoot.trim()
        ? workspaceRoot.trim()
        : null;

    if (!normalizedWorkspaceRoot) {
      requestedWorkspaceRootRef.current = null;
      setDesktopWorkspace(null);
      setDesktopWorkspaceError(null);
      setWorkspaceBranches(null);
      setEditorSelectedFile(null);
      return;
    }

    if (desktopWorkspace?.rootPath === normalizedWorkspaceRoot) {
      return;
    }

    logWorkspaceDebug("syncDesktopWorkspaceToThread", {
      currentThreadId,
      workspaceRoot: normalizedWorkspaceRoot,
      desktopWorkspaceRoot: desktopWorkspace?.rootPath ?? null,
    });
    void loadDesktopWorkspaceFromPath(normalizedWorkspaceRoot);
  }, [
    currentThreadId,
    desktopWorkspace?.rootPath,
    isDesktopRuntime,
    loadDesktopWorkspaceFromPath,
    logWorkspaceDebug,
    workspaceRoot,
  ]);

  const handleOpenWorkspaceFile = useCallback(async (relativePath: string) => {
    if (!workspaceRoot) return;
    try {
      const file = await readDesktopWorkspaceFile(relativePath);
      setEditorSelectedFile(file);
      setActiveView("editor");
      setPreviewTab("code");
    } catch (error) {
      setDesktopWorkspaceError(
        error instanceof Error ? error.message : "Failed to open file",
      );
    }
  }, [workspaceRoot]);

  const handleChangeWorkspaceRoot = useCallback(async () => {
    if (!isDesktopRuntime) return;
    const selectedPath = await pickWorkspaceDirectory();
    if (!selectedPath) return;
    logWorkspaceDebug("handleChangeWorkspaceRoot:selected", {
      selectedPath,
      currentThreadId,
      currentWorkspaceRoot: workspaceRoot,
    });
    onNewThread(selectedPath);
    await loadDesktopWorkspaceFromPath(selectedPath);
  }, [
    currentThreadId,
    isDesktopRuntime,
    loadDesktopWorkspaceFromPath,
    logWorkspaceDebug,
    onNewThread,
    workspaceRoot,
  ]);

  const handleRefreshDesktopWorkspace = useCallback(async () => {
    if (!isDesktopRuntime || !workspaceRoot) return;
    await loadDesktopWorkspaceFromPath(workspaceRoot);
  }, [isDesktopRuntime, loadDesktopWorkspaceFromPath, workspaceRoot]);

  const handleSwitchWorkspaceBranch = useCallback(async (branch: string) => {
    if (!isDesktopRuntime || !workspaceRoot) return;
    setWorkspaceBranchLoading(true);
    try {
      await switchWorkspaceBranch(workspaceRoot, branch);
      await loadDesktopWorkspaceFromPath(workspaceRoot);
    } finally {
      setWorkspaceBranchLoading(false);
    }
  }, [isDesktopRuntime, loadDesktopWorkspaceFromPath, workspaceRoot]);

  const handleCommitWorkspace = useCallback(async () => {
    if (!isDesktopRuntime || !workspaceRoot) return;
    const message = window.prompt("Commit message");
    if (!message?.trim()) return;
    setWorkspaceBranchLoading(true);
    try {
      await commitWorkspaceChanges(workspaceRoot, message.trim());
      await loadDesktopWorkspaceFromPath(workspaceRoot);
    } finally {
      setWorkspaceBranchLoading(false);
    }
  }, [isDesktopRuntime, loadDesktopWorkspaceFromPath, workspaceRoot]);

  const handlePushWorkspaceBranch = useCallback(async () => {
    if (!isDesktopRuntime || !workspaceRoot) return;
    setWorkspaceBranchLoading(true);
    try {
      await pushWorkspaceBranch(workspaceRoot);
      await loadDesktopWorkspaceFromPath(workspaceRoot);
    } finally {
      setWorkspaceBranchLoading(false);
    }
  }, [isDesktopRuntime, loadDesktopWorkspaceFromPath, workspaceRoot]);

  return {
    isDesktopRuntime,
    desktopWorkspace,
    setDesktopWorkspace,
    desktopWorkspaceLoading,
    desktopWorkspaceError,
    commandDialogOpen,
    setCommandDialogOpen,
    workspaceSearchOpen,
    setWorkspaceSearchOpen,
    previewTab,
    setPreviewTab,
    activeView,
    setActiveView,
    editorSelectedFile,
    setEditorSelectedFile,
    workspaceBranches,
    setWorkspaceBranches,
    workspaceBranchLoading,
    loadDesktopWorkspaceFromPath,
    handleOpenWorkspaceFile,
    handleChangeWorkspaceRoot,
    handleRefreshDesktopWorkspace,
    handleSwitchWorkspaceBranch,
    handleCommitWorkspace,
    handlePushWorkspaceBranch,
  };
}
