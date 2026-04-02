import "server-only";

type PendingSteerEntry = {
  id: string;
  text: string;
  createdAt: number;
};

const steerQueues = new Map<string, PendingSteerEntry[]>();

const createSteerId = () =>
  `steer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function enqueueThreadSteer(threadId: string, text: string) {
  const normalizedThreadId = threadId.trim();
  const normalizedText = text.trim();
  if (!normalizedThreadId || !normalizedText) {
    return null;
  }

  const entry: PendingSteerEntry = {
    id: createSteerId(),
    text: normalizedText,
    createdAt: Date.now(),
  };
  const current = steerQueues.get(normalizedThreadId) ?? [];
  current.push(entry);
  steerQueues.set(normalizedThreadId, current);
  return entry;
}

export function peekThreadSteers(threadId: string) {
  return [...(steerQueues.get(threadId.trim()) ?? [])];
}

export function consumeThreadSteers(threadId: string) {
  const normalizedThreadId = threadId.trim();
  const entries = steerQueues.get(normalizedThreadId) ?? [];
  if (entries.length === 0) {
    return [];
  }

  steerQueues.delete(normalizedThreadId);
  return entries;
}

export function clearThreadSteers(threadId: string) {
  steerQueues.delete(threadId.trim());
}