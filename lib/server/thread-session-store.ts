import "server-only";

import { ensureMastraStorageReady, mastraStore } from "@/mastra/storage";
import type { ThreadRecord, ThreadSession, ThreadSessionState } from "@/lib/thread-session";
import { inferExecutionState } from "@/lib/continuation";

const RESOURCE_ID = "web";
const CODEX_METADATA_KEY = "codex";
const memoryStore = mastraStore.stores.memory;

type StorageThreadLike = {
  id: string;
  resourceId?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toIsoString = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return undefined;
};

const getCodexMetadata = (thread: StorageThreadLike | null | undefined) => {
  if (!thread?.metadata || !isRecord(thread.metadata)) return {};
  const metadata = thread.metadata[CODEX_METADATA_KEY];
  return isRecord(metadata) ? metadata : {};
};

const toThreadRecord = (thread: StorageThreadLike): ThreadRecord => {
  const codexMetadata = getCodexMetadata(thread);
  const state = isRecord(codexMetadata.state)
    ? (codexMetadata.state as ThreadSessionState)
    : null;
  return {
    id: thread.id,
    title:
      typeof codexMetadata.title === "string" && codexMetadata.title.trim()
        ? codexMetadata.title.trim()
        : typeof thread.title === "string" && thread.title.trim()
          ? thread.title.trim()
          : thread.id,
    subtitle:
      typeof codexMetadata.subtitle === "string" && codexMetadata.subtitle.trim()
        ? codexMetadata.subtitle.trim()
        : "workspace",
    updatedAt:
      typeof codexMetadata.updatedAt === "number"
        ? codexMetadata.updatedAt
        : Date.now(),
    workspaceRoot:
      typeof state?.workspaceRoot === "string" && state.workspaceRoot.trim()
        ? state.workspaceRoot.trim()
        : null,
  };
};

const toThreadSession = (thread: StorageThreadLike): ThreadSession => {
  const codexMetadata = getCodexMetadata(thread);
  return {
    ...toThreadRecord(thread),
    resourceId: thread.resourceId ?? RESOURCE_ID,
    createdAt: toIsoString(thread.createdAt),
    state: isRecord(codexMetadata.state)
      ? (codexMetadata.state as ThreadSessionState)
      : {},
  };
};

const getListRows = (result: unknown): StorageThreadLike[] => {
  if (Array.isArray(result)) return result as StorageThreadLike[];
  if (isRecord(result) && Array.isArray(result.threads)) {
    return result.threads as StorageThreadLike[];
  }
  return [];
};

export async function listThreadSessions(limit = 24): Promise<ThreadRecord[]> {
  await ensureMastraStorageReady();
  const result = await memoryStore.listThreads({
    page: 0,
    perPage: limit,
    filter: { resourceId: RESOURCE_ID },
  });

  return getListRows(result)
    .map(toThreadRecord)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getThreadSession(threadId: string): Promise<ThreadSession | null> {
  await ensureMastraStorageReady();
  const thread = (await memoryStore.getThreadById({
    threadId,
  })) as StorageThreadLike | null;

  if (!thread) return null;
  return toThreadSession(thread);
}

export async function upsertThreadSession(params: {
  threadId: string;
  title?: string;
  subtitle?: string;
  state?: ThreadSessionState;
}) {
  await ensureMastraStorageReady();
  const rawExisting = (await memoryStore.getThreadById({
    threadId: params.threadId,
  })) as StorageThreadLike | null;
  const existing = rawExisting ? toThreadSession(rawExisting) : null;
  const existingMetadata = rawExisting ? getCodexMetadata(rawExisting) : {};
  const nextUpdatedAt = Date.now();
  const nextState: ThreadSessionState = {
    ...(existing?.state ?? {}),
    ...(params.state ?? {}),
  };
  nextState.execution = inferExecutionState(nextState);
  const nextMetadata = {
    ...existingMetadata,
    title: params.title ?? existing?.title ?? params.threadId,
    subtitle: params.subtitle ?? existing?.subtitle ?? "workspace",
    updatedAt: nextUpdatedAt,
    state: nextState,
  };

  await memoryStore.saveThread({
    thread: {
      id: params.threadId,
      resourceId: existing?.resourceId ?? RESOURCE_ID,
      title: params.title ?? existing?.title ?? params.threadId,
      metadata: {
        ...(isRecord(rawExisting?.metadata) ? rawExisting.metadata : {}),
        [CODEX_METADATA_KEY]: nextMetadata,
      },
      createdAt: existing?.createdAt ? new Date(existing.createdAt) : new Date(),
      updatedAt: new Date(nextUpdatedAt),
    },
  });

  return getThreadSession(params.threadId);
}

export async function deleteThreadSession(threadId: string) {
  await ensureMastraStorageReady();
  await memoryStore.deleteThread({ threadId });
}

export const THREAD_RESOURCE_ID = RESOURCE_ID;
