"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { ChatItem, PreviewLog } from "@/lib/stream-event-bus";
import type { ThreadRecord } from "@/lib/thread-session";

const RECENT_THREADS_STORAGE_KEY = "chat-recent-threads";
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
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [hydratedThreadId, setHydratedThreadId] = useState<string | null>(null);
  const [pendingNewThreadId, setPendingNewThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLogs, setPreviewLogs] = useState<PreviewLog[]>([]);
  const [plan, setPlan] = useState<SerializablePlan | null>(null);

  const activeThreadRecord = useMemo(
    () => recentThreads.find((entry) => entry.id === threadId),
    [recentThreads, threadId],
  );

  const isHydratingThread =
    Boolean(threadId) &&
    hydratedThreadId !== threadId &&
    pendingNewThreadId !== threadId;

  const mergeRecentThreads = useCallback((nextRecord: ThreadRecord, current: ThreadRecord[]) => {
    return [nextRecord, ...current.filter((entry) => entry.id !== nextRecord.id)].slice(0, 16);
  }, []);

  const resetConversationState = useCallback(() => {
    setItems([]);
    setPlan(null);
    setPreviewUrl(null);
    setPreviewLogs([]);
  }, []);

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
    }
  }, [params]);

  useEffect(() => {
    try {
      const rawThreads = window.localStorage.getItem(RECENT_THREADS_STORAGE_KEY);
      if (rawThreads) {
        const parsedThreads = JSON.parse(rawThreads) as unknown;
        if (Array.isArray(parsedThreads)) {
          setRecentThreads(parsedThreads as ThreadRecord[]);
        }
      }

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
      window.localStorage.setItem(
        RECENT_THREADS_STORAGE_KEY,
        JSON.stringify(recentThreads),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [recentThreads]);

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
    if (!threadId) {
      logWorkspaceDebug("hydrateThread:no-thread", {});
      setHydratedThreadId(null);
      setWorkspaceRoot(null);
      return;
    }

    if (pendingNewThreadId === threadId) {
      logWorkspaceDebug("hydrateThread:pending-new-thread", {
        threadId,
        workspaceRoot,
      });
      resetConversationState();
      setHydratedThreadId(threadId);
      setPendingNewThreadId(null);
      return;
    }

    let cancelled = false;
    setHydratedThreadId(null);

    const loadThreadSession = async () => {
      try {
        const response = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          resetConversationState();
          setWorkspaceRoot(null);
          setHydratedThreadId(threadId);
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

        logWorkspaceDebug("hydrateThread:loaded", {
          threadId,
          hydratedWorkspaceRoot,
          title: payload.thread?.title ?? null,
        });

        setWorkspaceRoot(hydratedWorkspaceRoot);
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
        setItems(Array.isArray(state?.items) ? (state.items as ChatItem[]) : []);
        setPlan(isPlanRecord(state?.plan) ? state.plan : null);
        setPreviewUrl(typeof state?.previewUrl === "string" ? state.previewUrl : null);
        setPreviewLogs(
          Array.isArray(state?.previewLogs)
            ? state.previewLogs.map((entry) => ({
                ...entry,
                timestamp: new Date(entry.timestamp),
              }))
            : [],
        );
        setHydratedThreadId(threadId);
      } catch {
        if (cancelled) return;
        setHydratedThreadId(threadId);
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
    resetConversationState,
    summarizeWorkspaceRoot,
    threadId,
    workspaceRoot,
  ]);

  useEffect(() => {
    if (!threadId || hydratedThreadId !== threadId) return;

    const timeout = window.setTimeout(() => {
      const latestUserMessage = [...items]
        .reverse()
        .find((item) => item.type === "message" && item.role === "user");
      const title = latestUserMessage?.content
        ? summarizeThreadTitle(latestUserMessage.content)
        : activeThreadRecord?.title ??
          (threadId.startsWith("thread-") ? threadId.slice(7) : threadId);

      void fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle: summarizeWorkspaceRoot(workspaceRoot),
          state: {
            workspaceRoot,
            previewUrl,
            items: serializeItemsForThread(items),
            plan,
            previewLogs: previewLogs.map((entry) => ({
              ...entry,
              timestamp: entry.timestamp.toISOString(),
            })),
          },
        }),
      }).catch(() => {
        // Ignore persistence failures.
      });
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activeThreadRecord?.title,
    hydratedThreadId,
    items,
    plan,
    previewLogs,
    previewUrl,
    serializeItemsForThread,
    summarizeThreadTitle,
    summarizeWorkspaceRoot,
    threadId,
    workspaceRoot,
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
    setHydratedThreadId(nextId);
    setWorkspaceRoot(normalizedWorkspaceRoot);
    router.push(`/${nextId}`);
    resetConversationState();

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
    resetConversationState,
    router,
    summarizeWorkspaceRoot,
  ]);

  const handleSelectThread = useCallback((nextThreadId: string) => {
    if (!nextThreadId || nextThreadId === threadId) return;
    setThreadId(nextThreadId);
    setHydratedThreadId(null);
    resetConversationState();
    router.push(`/${nextThreadId}`);
  }, [resetConversationState, router, threadId]);

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

    if (threadId !== targetThreadId) {
      return;
    }

    const fallbackThreadId = remainingThreads[0]?.id;
    if (fallbackThreadId) {
      handleSelectThread(fallbackThreadId);
      return;
    }

    setThreadId("");
    setHydratedThreadId(null);
    resetConversationState();
    setWorkspaceRoot(null);
    onClearDesktopState?.();
  }, [
    handleSelectThread,
    onClearDesktopState,
    recentThreads,
    resetConversationState,
    setError,
    threadId,
  ]);

  return {
    items,
    setItems,
    plan,
    setPlan,
    previewUrl,
    setPreviewUrl,
    previewLogs,
    setPreviewLogs,
    threadId,
    setThreadId,
    recentThreads,
    setRecentThreads,
    workspaceRoot,
    setWorkspaceRoot,
    hydratedThreadId,
    pendingNewThreadId,
    activeThreadRecord,
    isHydratingThread,
    mergeRecentThreads,
    resetConversationState,
    loadThreadList,
    handleNewThread,
    handleSelectThread,
    handleDeleteThread,
  };
}
