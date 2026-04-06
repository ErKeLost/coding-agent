"use client";

export type BehaviorEventKind =
  | "thread_created"
  | "thread_switched"
  | "model_switched"
  | "avatar_switched"
  | "avatar_profile_saved"
  | "guide_used"
  | "terminal_opened"
  | "dev_server_requested"
  | "full_error_viewed"
  | "explicit_completion_requested";

export type BehaviorEvent = {
  kind: BehaviorEventKind;
  at: number;
  workspaceRoot?: string | null;
  modelId?: string | null;
  avatarId?: string | null;
};

export type UserBehaviorProfile = {
  version: number;
  events: BehaviorEvent[];
  counters: Record<BehaviorEventKind, number>;
  preferredModelId?: string | null;
  preferredAvatarId?: string | null;
  preferredWorkspaceRoot?: string | null;
};

export const USER_BEHAVIOR_PROFILE_VERSION = 1;
const MAX_EVENTS = 160;

const EVENT_KINDS: BehaviorEventKind[] = [
  "thread_created",
  "thread_switched",
  "model_switched",
  "avatar_switched",
  "avatar_profile_saved",
  "guide_used",
  "terminal_opened",
  "dev_server_requested",
  "full_error_viewed",
  "explicit_completion_requested",
];

export const createEmptyBehaviorProfile = (): UserBehaviorProfile => ({
  version: USER_BEHAVIOR_PROFILE_VERSION,
  events: [],
  counters: Object.fromEntries(EVENT_KINDS.map((kind) => [kind, 0])) as Record<
    BehaviorEventKind,
    number
  >,
  preferredModelId: null,
  preferredAvatarId: null,
  preferredWorkspaceRoot: null,
});

export const normalizeBehaviorProfile = (
  value: Partial<UserBehaviorProfile> | null | undefined,
): UserBehaviorProfile => {
  const base = createEmptyBehaviorProfile();
  const events = Array.isArray(value?.events)
    ? value.events
        .filter((event): event is BehaviorEvent => {
          return (
            !!event &&
            typeof event === "object" &&
            typeof event.kind === "string" &&
            EVENT_KINDS.includes(event.kind as BehaviorEventKind) &&
            typeof event.at === "number"
          );
        })
        .slice(-MAX_EVENTS)
    : [];

  const counters = { ...base.counters };
  for (const kind of EVENT_KINDS) {
    const nextValue = value?.counters?.[kind];
    counters[kind] = typeof nextValue === "number" && nextValue > 0 ? nextValue : 0;
  }

  return {
    version: USER_BEHAVIOR_PROFILE_VERSION,
    events,
    counters,
    preferredModelId:
      typeof value?.preferredModelId === "string" ? value.preferredModelId : null,
    preferredAvatarId:
      typeof value?.preferredAvatarId === "string" ? value.preferredAvatarId : null,
    preferredWorkspaceRoot:
      typeof value?.preferredWorkspaceRoot === "string"
        ? value.preferredWorkspaceRoot
        : null,
  };
};

export const recordBehaviorEvent = (
  profile: UserBehaviorProfile,
  event: Omit<BehaviorEvent, "at"> & { at?: number },
) => {
  const next = normalizeBehaviorProfile(profile);
  const normalizedEvent: BehaviorEvent = {
    ...event,
    at: event.at ?? Date.now(),
  };

  next.events = [...next.events, normalizedEvent].slice(-MAX_EVENTS);
  next.counters[normalizedEvent.kind] =
    (next.counters[normalizedEvent.kind] ?? 0) + 1;

  if (normalizedEvent.modelId?.trim()) {
    next.preferredModelId = normalizedEvent.modelId.trim();
  }
  if (normalizedEvent.avatarId?.trim()) {
    next.preferredAvatarId = normalizedEvent.avatarId.trim();
  }
  if (normalizedEvent.workspaceRoot?.trim()) {
    next.preferredWorkspaceRoot = normalizedEvent.workspaceRoot.trim();
  }

  return next;
};

const countRecent = (
  events: BehaviorEvent[],
  kind: BehaviorEventKind,
  windowMs: number,
) => {
  const cutoff = Date.now() - windowMs;
  return events.filter((event) => event.kind === kind && event.at >= cutoff).length;
};

export const summarizeBehaviorProfile = (profile: UserBehaviorProfile) => {
  const normalized = normalizeBehaviorProfile(profile);
  const lines: string[] = [];

  if (normalized.counters.explicit_completion_requested >= 2) {
    lines.push("用户很在意明确的完成/终止状态，不喜欢模糊收尾。");
  }
  if (normalized.counters.full_error_viewed >= 2) {
    lines.push("用户偏好看到完整错误原文，而不是被过度摘要。");
  }
  if (normalized.counters.guide_used >= 2) {
    lines.push("用户会主动追加引导，偏好在执行中途微调方向。");
  }
  if (normalized.counters.thread_switched >= 4) {
    lines.push("用户常在多个线程之间切换，接受并行上下文。");
  }
  if (
    normalized.counters.dev_server_requested >= 1 ||
    normalized.counters.terminal_opened >= 2
  ) {
    lines.push("用户经常依赖终端/开发服务器反馈推进任务。");
  }
  if (normalized.counters.avatar_profile_saved >= 1) {
    lines.push("用户会认真调角色设定，偏好可配置、可个性化的陪伴体验。");
  }
  if (countRecent(normalized.events, "thread_switched", 10 * 60 * 1000) >= 3) {
    lines.push("用户最近处于高频切线程状态，回复和动作切换应更利落。");
  }

  if (normalized.preferredModelId) {
    lines.push(`用户最近常用模型：${normalized.preferredModelId}。`);
  }
  if (normalized.preferredAvatarId) {
    lines.push(`用户当前偏好角色：${normalized.preferredAvatarId}。`);
  }

  return lines.join("\n");
};
