"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { ChatItem, PreviewLog } from "@/lib/stream-event-bus";
import {
  LAST_ACTIVE_THREAD_STORAGE_KEY,
  type ThreadRecord,
} from "@/lib/thread-session";

const PENDING_NEW_THREAD_STORAGE_KEY = "chat-pending-new-thread";

type SerializablePlan = {
  title: string;
  todos: Array<{
    id: string;
    label: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    description?: string;
  }>;
};

export type ThreadRuntimeState = {
  items: ChatItem[];
  previewUrl: string | null;
  previewLogs: PreviewLog[];
  plan: SerializablePlan | null;
  workspaceRoot: string | null;
  hydrated: boolean;
  loading: boolean;
};

type ThreadRuntimeUpdater =
  | Partial<ThreadRuntimeState>
  | ((previous: ThreadRuntimeState) => ThreadRuntimeState);

type UseThreadSessionOptions = {
  params: ReadonlyURLSearchParams | Record<string, string | string[] | undefined> | null | undefined;
  router: AppRouterInstance;
  setError: (value: string | null) => void;
  createThreadId: () => string;
  serializeItemsForThread: (items: ChatItem[]) => ChatItem[];
  summarizeThreadTitle: (content?: string | null) => string;
  summarizeWorkspaceRoot: (value: string | null | undefined) => string;
  logWorkspaceDebug: (label: string, payload?: Record<string, unknown>) => void;
  isPlanRecord: (value: unknown) => value is SerializablePlan;
  onClearDesktopState?: () => void;
};

const EMPTY_RUNTIME: ThreadRuntimeState = {
  items: [],
  previewUrl: null,
  previewLogs: [],
  plan: null,
  workspaceRoot: null,
  hydrated: false,
  loading: false,
};

const getRuntime = (
  state: Record<string, ThreadRuntimeState>,
  threadId: string,
) => state[threadId] ?? EMPTY_RUNTIME;

const arePreviewLogsEqual = (a: PreviewLog[], b: PreviewLog[]) =>
  a.length === b.length &&
  a.every(
    (entry, index) =>
      entry.level === b[index]?.level &&
      entry.message === b[index]?.message &&
      entry.timestamp.getTime() === b[index]?.timestamp.getTime(),
  );

const areRuntimeStatesEqual = (
  previous: ThreadRuntimeState,
  next: ThreadRuntimeState,
) =>
  previous.workspaceRoot === next.workspaceRoot &&
  previous.previewUrl === next.previewUrl &&
  previous.hydrated === next.hydrated &&
  previous.loading === next.loading &&
  previous.plan === next.plan &&
  previous.items === next.items &&
  previous.previewLogs === next.previewLogs;

export function useThreadSession({
  params,
  router,
  setError,
  createThreadId,
  serializeItemsForThread,
  summarizeThreadTitle,
  summarizeWorkspaceRoot,
  logWorkspaceDebug,
  isPlanRecord,
  onClearDesktopState,
}: UseThreadSessionOptions) {
  const [threadId, setThreadId] = useState<string>("");
  const [recentThreads, setRecentThreads] = useState<ThreadRecord[]>([]);
  const [pendingNewThreadId, setPendingNewThreadId] = useState<string | null>(null);
  const [threadRuntimeById, setThreadRuntimeById] = useState<
    Record<string, ThreadRuntimeState>
  >({});

  const runtimeRef = useRef(threadRuntimeById);
  const recentThreadsRef = useRef(recentThreads);
  const persistTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    runtimeRef.current = threadRuntimeById;
  }, [threadRuntimeById]);

  useEffect(() => {
    recentThreadsRef.current = recentThreads;
  }, [recentThreads]);

  const activeThreadRecord = useMemo(
    () => recentThreads.find((entry) => entry.id === threadId),
    [recentThreads, threadId],
  );

  const activeRuntime = useMemo(
    () => getRuntime(threadRuntimeById, threadId),
    [threadRuntimeById, threadId],
  );

  const isHydratingThread = Boolean(threadId) && activeRuntime.loading;

  const mergeRecentThreads = useCallback((nextRecord: ThreadRecord, current: ThreadRecord[]) => {
    return [nextRecord, ...current.filter((entry) => entry.id !== nextRecord.id)].slice(0, 16);
  }, []);

  const schedulePersistThread = useCallback((targetThreadId: string) => {
    if (!targetThreadId || typeof window === "undefined") return;

    const existing = persistTimersRef.current[targetThreadId];
    if (existing) {
      window.clearTimeout(existing);
    }

    persistTimersRef.current[targetThreadId] = window.setTimeout(() => {
      delete persistTimersRef.current[targetThreadId];

      const runtime = runtimeRef.current[targetThreadId];
      if (!runtime?.hydrated) return;

      const threadRecord = recentThreadsRef.current.find(
        (entry) => entry.id === targetThreadId,
      );
      const shouldPersistThread =
        Boolean(threadRecord) ||
        Boolean(runtime.workspaceRoot) ||
        runtime.items.length > 0 ||
        Boolean(runtime.plan) ||
        Boolean(runtime.previewUrl) ||
        runtime.previewLogs.length > 0;

      if (!shouldPersistThread) return;

      const latestUserMessage = [...runtime.items]
        .reverse()
        .find((item) => item.type === "message" && item.role === "user");
      const title = latestUserMessage?.content
        ? summarizeThreadTitle(latestUserMessage.content)
        : threadRecord?.title ??
          (targetThreadId.startsWith("thread-")
            ? targetThreadId.slice(7)
            : targetThreadId);

      void fetch(`/api/threads/${targetThreadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle: summarizeWorkspaceRoot(runtime.workspaceRoot),
          state: {
            workspaceRoot: runtime.workspaceRoot,
            previewUrl: runtime.previewUrl,
            items: serializeItemsForThread(runtime.items),
            plan: runtime.plan,
            previewLogs: runtime.previewLogs.map((entry) => ({
              ...entry,
              timestamp: entry.timestamp.toISOString(),
            })),
          },
        }),
      }).catch(() => {
        // Ignore persistence failures.
      });
    }, 700);
  }, [serializeItemsForThread, summarizeThreadTitle, summarizeWorkspaceRoot]);

  const updateThreadRuntime = useCallback((
    targetThreadId: string,
    updater: ThreadRuntimeUpdater,
    options?: { persist?: boolean },
  ) => {
    if (!targetThreadId) return;

    setThreadRuntimeById((previous) => {
      const current = getRuntime(previous, targetThreadId);
      const next =
        typeof updater === "function"
          ? updater(current)
          : { ...current, ...updater };
      if (areRuntimeStatesEqual(current, next)) {
        return previous;
      }
      return {
        ...previous,
        [targetThreadId]: next,
      };
    });

    if (options?.persist !== false) {
      schedulePersistThread(targetThreadId);
    }
  }, [schedulePersistThread]);

  const resetConversationState = useCallback((targetThreadId?: string) => {
    const effectiveThreadId = targetThreadId ?? threadId;
    if (!effectiveThreadId) return;
    updateThreadRuntime(
      effectiveThreadId,
      (previous) => ({
        ...previous,
        items: [],
        plan: null,
        previewUrl: null,
        previewLogs: [],
      }),
      { persist: false },
    );
  }, [threadId, updateThreadRuntime]);

  const loadThreadList = useCallback(async () => {
    try {
      const response = await fetch("/api/threads?limit=24", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { threads?: ThreadRecord[] };
      if (Array.isArray(payload.threads)) {
        setRecentThreads((prev) => {
          const next = payload.threads ?? [];
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      }
    } catch {
      // Ignore thread list load failures.
    }
  }, []);

  useEffect(() => {
    void loadThreadList();
  }, [loadThreadList]);

  useEffect(() => {
    const rawId = "id" in (params ?? {}) ? (params as { id?: string | string[] }).id : undefined;
    const routeId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (routeId && typeof routeId === "string") {
      setThreadId(routeId);
      setThreadRuntimeById((previous) =>
        previous[routeId]
          ? previous
          : {
              ...previous,
              [routeId]: {
                ...EMPTY_RUNTIME,
                loading: true,
              },
            },
      );
    }
  }, [params]);

  useEffect(() => {
    try {
      const pendingThread = window.localStorage.getItem(PENDING_NEW_THREAD_STORAGE_KEY);
      if (pendingThread) {
        setPendingNewThreadId(pendingThread);
      }
    } catch {
      // Ignore storage errors during hydration.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (pendingNewThreadId) {
        window.localStorage.setItem(PENDING_NEW_THREAD_STORAGE_KEY, pendingNewThreadId);
      } else {
        window.localStorage.removeItem(PENDING_NEW_THREAD_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors.
    }
  }, [pendingNewThreadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (threadId) {
        window.localStorage.setItem(LAST_ACTIVE_THREAD_STORAGE_KEY, threadId);
      } else {
        window.localStorage.removeItem(LAST_ACTIVE_THREAD_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors.
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      logWorkspaceDebug("hydrateThread:no-thread", {});
      return;
    }

    if (pendingNewThreadId === threadId) {
      logWorkspaceDebug("hydrateThread:pending-new-thread", {
        threadId,
        workspaceRoot: getRuntime(runtimeRef.current, threadId).workspaceRoot,
      });
      updateThreadRuntime(
        threadId,
        (previous) => ({
          ...previous,
          hydrated: true,
          loading: false,
        }),
        { persist: false },
      );
      setPendingNewThreadId(null);
      return;
    }

    let cancelled = false;
    updateThreadRuntime(
      threadId,
      (previous) => ({
        ...previous,
        loading: true,
      }),
      { persist: false },
    );

    const loadThreadSession = async () => {
      try {
        const response = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          updateThreadRuntime(
            threadId,
            {
              ...EMPTY_RUNTIME,
              hydrated: true,
              loading: false,
            },
            { persist: false },
          );
          return;
        }
        if (!response.ok) {
          throw new Error("Failed to load thread session");
        }

        const payload = (await response.json()) as {
          thread?: {
            title?: string;
            state?: {
              workspaceRoot?: string | null;
              previewUrl?: string | null;
              items?: unknown[];
              plan?: unknown;
              previewLogs?: Array<{
                level: "log" | "warn" | "error";
                message: string;
                timestamp: string | Date;
              }>;
            };
          };
        };
        const state = payload.thread?.state;
        const hydratedWorkspaceRoot =
          typeof state?.workspaceRoot === "string" && state.workspaceRoot.trim()
            ? state.workspaceRoot.trim()
            : null;
        const nextItems = Array.isArray(state?.items) ? (state.items as ChatItem[]) : [];
        const nextPlan = isPlanRecord(state?.plan) ? state.plan : null;
        const nextPreviewUrl =
          typeof state?.previewUrl === "string" ? state.previewUrl : null;
        const nextPreviewLogs = Array.isArray(state?.previewLogs)
          ? state.previewLogs.map((entry) => ({
              ...entry,
              timestamp: new Date(entry.timestamp),
            }))
          : [];

        logWorkspaceDebug("hydrateThread:loaded", {
          threadId,
          hydratedWorkspaceRoot,
          title: payload.thread?.title ?? null,
        });

        setRecentThreads((prev) =>
          prev.map((entry) =>
            entry.id === threadId
              ? {
                  ...entry,
                  subtitle: summarizeWorkspaceRoot(hydratedWorkspaceRoot),
                  workspaceRoot: hydratedWorkspaceRoot,
                }
              : entry,
          ),
        );
        updateThreadRuntime(
          threadId,
          (previous) => ({
            items:
              previous.items.length > nextItems.length ? previous.items : nextItems,
            plan: previous.plan ?? nextPlan,
            previewUrl: previous.previewUrl ?? nextPreviewUrl,
            previewLogs:
              previous.previewLogs.length > 0 &&
              previous.previewLogs.length >= nextPreviewLogs.length
                ? previous.previewLogs
                : nextPreviewLogs,
            workspaceRoot: previous.workspaceRoot ?? hydratedWorkspaceRoot,
            hydrated: true,
            loading: false,
          }),
          { persist: false },
        );
      } catch {
        if (cancelled) return;
        updateThreadRuntime(
          threadId,
          (previous) => ({
            ...previous,
            hydrated: true,
            loading: false,
          }),
          { persist: false },
        );
      }
    };

    void loadThreadSession();

    return () => {
      cancelled = true;
    };
  }, [
    isPlanRecord,
    logWorkspaceDebug,
    pendingNewThreadId,
    summarizeWorkspaceRoot,
    threadId,
    updateThreadRuntime,
  ]);

  const handleNewThread = useCallback((initialWorkspaceRoot?: string | null) => {
    const normalizedWorkspaceRoot =
      typeof initialWorkspaceRoot === "string" && initialWorkspaceRoot.trim()
        ? initialWorkspaceRoot.trim()
        : null;
    const nextId = createThreadId();

    logWorkspaceDebug("handleNewThread", {
      nextId,
      initialWorkspaceRoot: normalizedWorkspaceRoot,
    });

    const nextRecord: ThreadRecord = {
      id: nextId,
      title: "Untitled thread",
      subtitle: summarizeWorkspaceRoot(normalizedWorkspaceRoot),
      workspaceRoot: normalizedWorkspaceRoot,
      updatedAt: Date.now(),
    };

    setRecentThreads((prev) => mergeRecentThreads(nextRecord, prev));
    setPendingNewThreadId(nextId);
    setThreadId(nextId);
    updateThreadRuntime(
      nextId,
      {
        ...EMPTY_RUNTIME,
        workspaceRoot: normalizedWorkspaceRoot,
        hydrated: true,
        loading: false,
      },
      { persist: false },
    );
    router.push(`/${nextId}`);

    void fetch(`/api/threads/${nextId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextRecord.title,
        subtitle: nextRecord.subtitle,
        state: {
          workspaceRoot: normalizedWorkspaceRoot,
          previewUrl: null,
          items: [],
          plan: null,
          previewLogs: [],
        },
      }),
    }).catch(() => {
      // Ignore optimistic thread creation failures.
    });
  }, [
    createThreadId,
    logWorkspaceDebug,
    mergeRecentThreads,
    router,
    summarizeWorkspaceRoot,
    updateThreadRuntime,
  ]);

  const handleSelectThread = useCallback((nextThreadId: string) => {
    if (!nextThreadId || nextThreadId === threadId) return;
    setThreadId(nextThreadId);
    updateThreadRuntime(
      nextThreadId,
      (previous) => ({
        ...previous,
        loading: !previous.hydrated,
      }),
      { persist: false },
    );
    router.push(`/${nextThreadId}`);
  }, [router, threadId, updateThreadRuntime]);

  const handleDeleteThread = useCallback(async (targetThreadId: string) => {
    if (!targetThreadId) return;

    try {
      const response = await fetch(`/api/threads/${targetThreadId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to delete thread");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete thread");
      return;
    }

    const remainingThreads = recentThreads.filter((entry) => entry.id !== targetThreadId);
    setRecentThreads(remainingThreads);
    setThreadRuntimeById((previous) => {
      const next = { ...previous };
      delete next[targetThreadId];
      return next;
    });

    const pendingTimer = persistTimersRef.current[targetThreadId];
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      delete persistTimersRef.current[targetThreadId];
    }

    if (threadId !== targetThreadId) {
      return;
    }

    const fallbackThreadId = remainingThreads[0]?.id;
    if (fallbackThreadId) {
      handleSelectThread(fallbackThreadId);
      return;
    }

    setThreadId("");
    onClearDesktopState?.();
  }, [
    handleSelectThread,
    onClearDesktopState,
    recentThreads,
    setError,
    threadId,
  ]);

  const setItems = useCallback(
    (
      updater:
        | ChatItem[]
        | ((previous: ChatItem[]) => ChatItem[]),
      targetThreadId?: string,
    ) => {
      const effectiveThreadId = targetThreadId ?? threadId;
      if (!effectiveThreadId) return;
      updateThreadRuntime(effectiveThreadId, (previous) => ({
        ...previous,
        items:
          typeof updater === "function"
            ? updater(previous.items)
            : updater,
      }));
    },
    [threadId, updateThreadRuntime],
  );

  const setPlan = useCallback((value: SerializablePlan | null, targetThreadId?: string) => {
    const effectiveThreadId = targetThreadId ?? threadId;
    if (!effectiveThreadId) return;
    updateThreadRuntime(effectiveThreadId, (previous) => ({
      ...previous,
      plan: value,
    }));
  }, [threadId, updateThreadRuntime]);

  const setPreviewUrl = useCallback((value: string | null, targetThreadId?: string) => {
    const effectiveThreadId = targetThreadId ?? threadId;
    if (!effectiveThreadId) return;
    updateThreadRuntime(effectiveThreadId, (previous) => ({
      ...previous,
      previewUrl: value,
    }));
  }, [threadId, updateThreadRuntime]);

  const setPreviewLogs = useCallback((
    updater:
      | PreviewLog[]
      | ((previous: PreviewLog[]) => PreviewLog[]),
    targetThreadId?: string,
  ) => {
    const effectiveThreadId = targetThreadId ?? threadId;
    if (!effectiveThreadId) return;
    updateThreadRuntime(effectiveThreadId, (previous) => {
      const nextPreviewLogs =
        typeof updater === "function"
          ? updater(previous.previewLogs)
          : updater;
      if (arePreviewLogsEqual(previous.previewLogs, nextPreviewLogs)) {
        return previous;
      }
      return {
        ...previous,
        previewLogs: nextPreviewLogs,
      };
    });
  }, [threadId, updateThreadRuntime]);

  const setWorkspaceRoot = useCallback((value: string | null, targetThreadId?: string) => {
    const effectiveThreadId = targetThreadId ?? threadId;
    if (!effectiveThreadId) return;
    const normalizedWorkspaceRoot =
      typeof value === "string" && value.trim() ? value.trim() : null;
    updateThreadRuntime(effectiveThreadId, (previous) => ({
      ...previous,
      workspaceRoot: normalizedWorkspaceRoot,
    }));
    setRecentThreads((prev) =>
      prev.map((entry) =>
        entry.id === effectiveThreadId
          ? {
              ...entry,
              subtitle: summarizeWorkspaceRoot(normalizedWorkspaceRoot),
              workspaceRoot: normalizedWorkspaceRoot,
            }
          : entry,
      ),
    );
  }, [threadId, summarizeWorkspaceRoot, updateThreadRuntime]);

  const getThreadRuntimeState = useCallback(
    (targetThreadId: string) => getRuntime(runtimeRef.current, targetThreadId),
    [],
  );

  return {
    items: activeRuntime.items,
    setItems,
    plan: activeRuntime.plan,
    setPlan,
    previewUrl: activeRuntime.previewUrl,
    setPreviewUrl,
    previewLogs: activeRuntime.previewLogs,
    setPreviewLogs,
    threadId,
    setThreadId,
    recentThreads,
    setRecentThreads,
    workspaceRoot: activeRuntime.workspaceRoot,
    setWorkspaceRoot,
    hydratedThreadId: activeRuntime.hydrated ? threadId : null,
    pendingNewThreadId,
    activeThreadRecord,
    isHydratingThread,
    mergeRecentThreads,
    resetConversationState,
    loadThreadList,
    handleNewThread,
    handleSelectThread,
    handleDeleteThread,
    threadRuntimeById,
    updateThreadRuntime,
    getThreadRuntimeState,
  };
}
