"use client";

export type AvatarProfile = {
  id: string;
  name: string;
  description?: string;
  personalityPrompt?: string;
  systemPrompt?: string;
  modelPath: string;
  capabilities?: AvatarModelCapabilities;
  builtin?: boolean;
};

export type AvatarModelAssetOption = {
  id: string;
  name: string;
  description?: string;
  modelPath: string;
  capabilities?: AvatarModelCapabilities;
  builtin?: boolean;
  sourceProfileId?: string;
};

export type AvatarCapabilityAction =
  | "idle"
  | "walk"
  | "hop"
  | "dance"
  | "thinking"
  | "focus"
  | "explain"
  | "greet"
  | "nod"
  | "concern"
  | "celebrate";

export type AvatarModelCapabilities = {
  animationCount: number;
  animationNames: string[];
  morphTargetCount: number;
  morphTargetNames: string[];
  clipGroups: Partial<Record<AvatarCapabilityAction, number[]>>;
  summary: string;
};

const buildCapabilitySummary = (capabilities: AvatarModelCapabilities) => {
  const lines = [
    `动画数量：${capabilities.animationCount}`,
    capabilities.morphTargetCount > 0
      ? `表情/形变数量：${capabilities.morphTargetCount}`
      : "没有检测到表情 morph target",
  ];

  const actionNotes = Object.entries(capabilities.clipGroups)
    .filter(([, indexes]) => Array.isArray(indexes) && indexes.length > 0)
    .map(([action, indexes]) => `${action}: ${indexes.join(", ")}`);
  if (actionNotes.length > 0) {
    lines.push(`推荐动作映射：${actionNotes.join(" | ")}`);
  }

  return lines.join("；");
};

const range = (start: number, endExclusive: number) =>
  Array.from(
    { length: Math.max(0, endExclusive - start) },
    (_, index) => start + index,
  );

const uniqueNumbers = (values: number[]) => [...new Set(values)].filter((v) => v >= 0);

export const inferClipGroupsFromAnimationCount = (animationCount: number) => {
  if (animationCount <= 0) return {};
  if (animationCount >= 27) {
    return {
      idle: [16, 19, 20, 18, 26],
      walk: [3, 5, 8, 9, 10, 13, 18, 20, 26],
      hop: [12, 18, 26, 10],
      thinking: [6, 15, 17, 19, 22, 24, 25],
      focus: [6, 17, 22, 24, 25],
      explain: [1, 2, 6, 15, 17, 22],
      greet: [13, 18, 20, 22],
      nod: [18, 20, 26],
      concern: [6, 19, 24, 25],
      celebrate: [0, 4, 7, 11, 14, 21, 23],
      dance: [0, 1, 2, 4, 7, 11, 14, 21, 23],
    } satisfies Partial<Record<AvatarCapabilityAction, number[]>>;
  }

  const all = range(0, animationCount);
  const idle = uniqueNumbers([Math.floor(animationCount / 2), 0]);
  const walk = uniqueNumbers(range(0, Math.min(animationCount, Math.max(2, Math.ceil(animationCount / 3)))));
  const expressive = uniqueNumbers(
    range(Math.max(0, animationCount - Math.max(2, Math.ceil(animationCount / 3))), animationCount),
  );
  const reflective = uniqueNumbers(
    range(
      Math.max(0, Math.floor(animationCount / 3)),
      Math.max(Math.floor(animationCount / 3) + 1, Math.min(animationCount, Math.floor((animationCount * 2) / 3))),
    ),
  );

  return {
    idle: idle.length ? idle : all.slice(0, 1),
    walk: walk.length ? walk : all.slice(0, 1),
    hop: all.slice(0, Math.min(animationCount, 2)),
    dance: expressive.length ? expressive : all.slice(-1),
    celebrate: expressive.length ? expressive : all.slice(-1),
    thinking: reflective.length ? reflective : idle,
    focus: reflective.length ? reflective : idle,
    explain: uniqueNumbers([...reflective, ...expressive].slice(0, 3)),
    greet: expressive.length ? expressive.slice(0, 2) : idle,
    nod: idle,
    concern: reflective.length ? reflective : idle,
  } satisfies Partial<Record<AvatarCapabilityAction, number[]>>;
};

export const createCapabilities = (input: {
  animationCount: number;
  animationNames?: string[];
  morphTargetCount?: number;
  morphTargetNames?: string[];
  clipGroups?: Partial<Record<AvatarCapabilityAction, number[]>>;
}) => {
  const capabilities: AvatarModelCapabilities = {
    animationCount: input.animationCount,
    animationNames: input.animationNames ?? [],
    morphTargetCount: input.morphTargetCount ?? 0,
    morphTargetNames: input.morphTargetNames ?? [],
    clipGroups:
      input.clipGroups ?? inferClipGroupsFromAnimationCount(input.animationCount),
    summary: "",
  };
  capabilities.summary = buildCapabilitySummary(capabilities);
  return capabilities;
};

const DEFAULT_AVATAR_PROFILES: AvatarProfile[] = [
  {
    id: "baobao",
    name: "泡泡",
    description:
      "一个陪你写代码的小搭子，轻轻在线，知道你在忙什么，也懂什么时候该安静陪着。",
    personalityPrompt:
      "你是泡泡，一个可爱但不幼稚的 coding companion。你会在用户写代码时陪着他，轻轻观察他的节奏、情绪和当前卡点。你知道用户此刻是在推进功能、修 bug、看日志、等结果，还是有点烦了。你说话短、轻、自然，像贴在旁边顺口补一句。你先看人的状态，再看问题本身。你不要像客服、不要像播报器、不要机械鼓励。你的目标是让用户感觉：你知道我现在在干什么，而且你在陪我一起做完。",
    systemPrompt:
      "你优先做三件事：1. 判断用户当前正在做的 coding 阶段。2. 判断用户此刻更需要陪伴、提醒、安抚还是安静。3. 只补一句最像真人搭子会说的话。如果没有新的判断，就少说。如果用户明显专注，就更轻。如果用户明显卡住，就更贴近一点。如果用户刚推进成功，就给一点温暖的反馈。永远不要抢主助手的正面回答。你必须优先识别用户当前正在做什么，而不是只看表面的消息内容。尤其要努力识别：正在写新功能、正在修 bug、正在看终端或日志、正在等待工具结果、正在比较两个方案、正在试探性改动、已经接近解决、明显有点烦了、只是想有人陪着继续做完。当你说话时，要让人感觉你知道他现在处在哪个阶段。",
    modelPath: "/models/baobao.glb",
    capabilities: createCapabilities({
      animationCount: 27,
      animationNames: Array.from({ length: 27 }, (_, index) =>
        index === 0 ? "NlaTrack" : `NlaTrack.${String(index).padStart(3, "0")}`,
      ),
    }),
    builtin: true,
  },
  {
    id: "fanfan",
    name: "饭饭",
    description:
      "一个站在你旁边的 coding 搭子，安静、靠谱、判断很稳，陪你一起盯代码、看日志、拆问题、收口。",
    personalityPrompt:
      "你是饭饭，一个沉稳、靠谱、懂工程现场的 coding companion。你会在用户工作时判断当前最关键的线索、风险和切口。你知道用户现在是在推进、排查、验证、等待还是收尾。你说话短、稳、准，不说空话，不抢解释，只补一句最有抓手的话。你不是指挥官，是并肩搭子。你的目标是让用户感觉：你真的看懂了我这段代码现场，而且你在帮我稳住节奏。",
    systemPrompt:
      "你的优先级是：1. 识别当前最关键的代码线索或风险点。2. 用一句短话帮用户稳住注意力。3. 不复述主助手，不做长解释。如果没有新判断，就保持安静。如果用户在修 bug，优先指出最值得盯住的一处。如果用户在推进功能，优先提醒结构或边界。如果用户在看输出，优先判断这输出是否说明方向对了。如果用户明显烦躁，语气可以更稳一点，但不要过度安慰。你必须优先识别用户当前正在做什么，而不是只看表面的消息内容。尤其要努力识别：正在写新功能、正在修 bug、正在看终端或日志、正在等待工具结果、正在比较两个方案、正在试探性改动、已经接近解决、明显有点烦了、只是想有人陪着继续做完。当你说话时，要让人感觉你知道他现在处在哪个阶段。这个角色的动作能力相对有限，表达尽量简洁自然，不要过度暗示夸张庆祝或丰富表情。",
    modelPath: "/models/fanfan.glb",
    capabilities: createCapabilities({
      animationCount: 7,
      animationNames: [
        "NlaTrack",
        "NlaTrack.001",
        "NlaTrack.002",
        "NlaTrack.003",
        "NlaTrack.004",
        "NlaTrack.005",
        "NlaTrack.006",
      ],
      clipGroups: {
        idle: [0, 3],
        walk: [1],
        hop: [1],
        dance: [4, 5],
        celebrate: [5, 6],
        thinking: [2, 3],
        focus: [2, 3],
        explain: [2, 4],
        greet: [4],
        nod: [0, 3],
        concern: [2],
      },
    }),
    builtin: true,
  },
];

export const DEFAULT_AVATAR_PROFILE_ID =
  DEFAULT_AVATAR_PROFILES[0]?.id ?? "baobao";

const clip = (value: string | undefined, max: number) => {
  const normalized = value?.trim() ?? "";
  if (!normalized) return undefined;
  return normalized.length > max
    ? normalized.slice(0, max).trim()
    : normalized;
};

const normalizeProfileRecord = (
  profile: Partial<AvatarProfile>,
  fallback?: AvatarProfile | null,
): AvatarProfile | null => {
  const id = (profile.id ?? fallback?.id ?? "").trim();
  const modelPath = (profile.modelPath ?? fallback?.modelPath ?? "").trim();
  const name = clip(profile.name ?? fallback?.name, 40);

  if (!id || !modelPath || !name) return null;

  return {
    id,
    name,
    description: clip(profile.description ?? fallback?.description, 120),
    personalityPrompt: clip(
      profile.personalityPrompt ?? fallback?.personalityPrompt,
      800,
    ),
    systemPrompt: clip(profile.systemPrompt ?? fallback?.systemPrompt, 1600),
    modelPath,
    capabilities: profile.capabilities ?? fallback?.capabilities,
    builtin: profile.builtin ?? fallback?.builtin ?? false,
  };
};

export const getDefaultAvatarProfiles = () =>
  DEFAULT_AVATAR_PROFILES.map((profile) => ({ ...profile }));

export const getAvatarModelAssetOptions = (
  profiles: AvatarProfile[] | null | undefined,
) => {
  const source = normalizeAvatarProfiles(profiles);
  const deduped = new Map<string, AvatarModelAssetOption>();

  for (const profile of source) {
    const modelPath = profile.modelPath?.trim();
    if (!modelPath || deduped.has(modelPath)) continue;
    deduped.set(modelPath, {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      modelPath,
      capabilities: profile.capabilities,
      builtin: profile.builtin,
      sourceProfileId: profile.id,
    });
  }

  return Array.from(deduped.values());
};

export const normalizeAvatarProfiles = (
  profiles: Array<Partial<AvatarProfile>> | null | undefined,
) => {
  const fallbackMap = new Map(
    DEFAULT_AVATAR_PROFILES.map((profile) => [profile.id, profile] as const),
  );
  const normalized = (profiles ?? [])
    .map((profile) =>
      normalizeProfileRecord(
        profile,
        typeof profile.id === "string" ? fallbackMap.get(profile.id) : null,
      ),
    )
    .filter((profile): profile is AvatarProfile => profile != null);

  if (normalized.length === 0) return getDefaultAvatarProfiles();

  const deduped = new Map<string, AvatarProfile>();
  for (const profile of normalized) {
    deduped.set(profile.id, profile);
  }

  for (const profile of DEFAULT_AVATAR_PROFILES) {
    if (!deduped.has(profile.id)) {
      deduped.set(profile.id, { ...profile });
    }
  }

  return Array.from(deduped.values());
};

export const getAvatarProfileById = (
  profiles: AvatarProfile[] | null | undefined,
  id: string | null | undefined,
) => {
  const source = normalizeAvatarProfiles(profiles);
  return (
    source.find((entry) => entry.id === id) ??
    source.find((entry) => entry.id === DEFAULT_AVATAR_PROFILE_ID) ??
    source[0] ??
    null
  );
};

export const upsertAvatarProfile = (
  profiles: AvatarProfile[] | null | undefined,
  profile: Partial<AvatarProfile>,
) => {
  const normalizedProfiles = normalizeAvatarProfiles(profiles);
  const current = profile.id
    ? normalizedProfiles.find((entry) => entry.id === profile.id) ?? null
    : null;
  const nextId =
    profile.id?.trim() ||
    `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nextProfile = normalizeProfileRecord(
    { ...profile, id: nextId },
    current,
  );

  if (!nextProfile) {
    return {
      profiles: normalizedProfiles,
      saved: null,
    };
  }

  const next = normalizedProfiles.filter((entry) => entry.id !== nextProfile.id);
  next.push(nextProfile);
  return {
    profiles: next,
    saved: nextProfile,
  };
};

export const removeAvatarProfile = (
  profiles: AvatarProfile[] | null | undefined,
  id: string,
) => {
  const normalizedProfiles = normalizeAvatarProfiles(profiles);
  const target = normalizedProfiles.find((entry) => entry.id === id);
  if (!target || target.builtin) return normalizedProfiles;
  const next = normalizedProfiles.filter((entry) => entry.id !== id);
  return next.length > 0 ? next : getDefaultAvatarProfiles();
};
