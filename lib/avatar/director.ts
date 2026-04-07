import type {
  AvatarAction,
  AvatarContextItem,
  AvatarDirective,
  AvatarDirectorRequest,
  AvatarEmotion,
  AvatarLookAt,
  AvatarLocomotion,
  AvatarMoveTarget,
} from "@/lib/avatar/types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_AVATAR_NAME = "泡泡";

export const DEFAULT_AVATAR_DIRECTIVE: AvatarDirective = {
  bubble: "",
  speak: false,
  action: "idle",
  emotion: "neutral",
  lookAt: "thread_center",
  moveTo: "left",
  locomotion: "idle",
  priority: "low",
  bubbleTheme: {
    borderColor: "#d9e4ff",
    textColor: "#1f2937",
    backgroundFrom: "#f8fbff",
    backgroundTo: "#eef4ff",
    glowColor: "rgba(94, 151, 255, 0.28)",
  },
  source: "heuristic",
  sourceDetail: "default",
};

export const normalizeAvatarModelName = (rawModel: string) =>
  rawModel.startsWith("openrouter/") ? rawModel.replace(/^openrouter\//, "") : rawModel;

const clipText = (value: string, max = 220) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
};

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const pickVariant = (options: string[], seed: string) => {
  if (options.length === 0) return "";
  return options[hashText(seed) % options.length] ?? options[0]!;
};

const buildTopicHint = (raw: string | undefined, max = 18) => {
  const clipped = clipText(raw ?? "", max);
  return clipped ? `「${clipped}」` : "";
};

const joinBubbleParts = (...parts: Array<string | undefined>) =>
  parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");

type AvatarPhase =
  | "user-focus"
  | "waiting-tool"
  | "watching-output"
  | "error"
  | "near-solution"
  | "idle";

type RoleStrategy = {
  archetype: "cute-companion" | "steady-buddy" | "custom";
  closeness: "soft" | "steady" | "neutral";
  humor: "light" | "dry" | "minimal";
  prefersComfortFirst: boolean;
  prefersSignalFirst: boolean;
  mentionCurrentStage: boolean;
};

const getRoleStrategy = (
  payload: AvatarDirectorRequest,
): RoleStrategy => {
  const merged = [
    payload.avatarName,
    payload.avatarDescription,
    payload.avatarPersonalityPrompt,
    payload.avatarSystemPrompt,
  ]
    .filter(Boolean)
    .join("\n");

  if (/(可爱|陪伴|温柔|细腻|软软|小搭子|轻陪伴)/.test(merged)) {
    return {
      archetype: "cute-companion",
      closeness: "soft",
      humor: "light",
      prefersComfortFirst: true,
      prefersSignalFirst: false,
      mentionCurrentStage: true,
    };
  }

  if (/(靠谱|沉稳|清醒|工程搭子|结构|风险|线索|收口)/.test(merged)) {
    return {
      archetype: "steady-buddy",
      closeness: "steady",
      humor: "minimal",
      prefersComfortFirst: false,
      prefersSignalFirst: true,
      mentionCurrentStage: true,
    };
  }

  return {
    archetype: "custom",
    closeness: "neutral",
    humor: "minimal",
    prefersComfortFirst: /安抚|陪伴|温柔|轻一点/.test(merged),
    prefersSignalFirst: /线索|风险|结构|根因|信号/.test(merged),
    mentionCurrentStage: true,
  };
};

const inferPhase = (
  payload: AvatarDirectorRequest,
  recentItems: AvatarContextItem[],
) => {
  const latestUser = [...recentItems]
    .reverse()
    .find((item) => item.type === "message" && item.role === "user");
  const latestTool = [...recentItems]
    .reverse()
    .find((item) => item.type === "tool");
  const latestAssistant = [...recentItems]
    .reverse()
    .find((item) => item.type === "message" && item.role === "assistant");

  if (payload.streamStatus === "error" || latestTool?.status === "error") {
    return "error" as const;
  }
  if (latestTool?.status === "pending") {
    return "waiting-tool" as const;
  }
  if (payload.streamStatus === "submitted" || payload.streamStatus === "streaming") {
    return "watching-output" as const;
  }
  if (latestAssistant?.content?.trim()) {
    return "near-solution" as const;
  }
  if (latestUser?.content?.trim()) {
    return "user-focus" as const;
  }
  return "idle" as const;
};

const inferCurrentStageLabel = (text: string | undefined) => {
  const value = (text ?? "").trim();
  if (!value) return "";
  if (/bug|报错|错误|异常|红字|修/.test(value)) return "修 bug";
  if (/日志|log|终端|输出|console|stderr|stdout/i.test(value)) return "看输出";
  if (/方案|比较|对比|选/.test(value)) return "比较方案";
  if (/重构|结构|拆/.test(value)) return "收结构";
  if (/功能|实现|接进去|做成|新增/.test(value)) return "推进功能";
  return "盯这条线";
};

const buildHeuristicBubble = ({
  phase,
  strategy,
  latestUserContent,
  latestToolName,
  latestToolError,
  latestAssistantContent,
  seed,
}: {
  phase: AvatarPhase;
  strategy: RoleStrategy;
  latestUserContent?: string;
  latestToolName?: string;
  latestToolError?: string;
  latestAssistantContent?: string;
  seed: string;
}) => {
  const topic = buildTopicHint(latestUserContent, 16);
  const stageLabel = inferCurrentStageLabel(latestUserContent);
  const toolLabel = latestToolName?.trim().toLowerCase() ?? "";
  const errorHint = clipText(
    latestToolError?.split("\n")[0] ?? latestAssistantContent ?? "",
    22,
  );

  const picks = {
    cute: {
      "user-focus": [
        topic ? `我知道你还在啃${topic}这条线。` : "",
        stageLabel ? `你现在像是在${stageLabel}，我先轻轻陪着。` : "",
        topic ? `${topic}这块我还记着呢，我们别让它散掉。` : "",
      ],
      "waiting-tool": [
        "先让它再吐两句，我陪你守着这一下。",
        toolLabel ? `${toolLabel}这会儿还没说完，我先替你盯着。`
          : "这会儿先别急，我在等它把关键那句交代出来。",
        "先别动别处，这一小段 usually 很快就露口风。",
      ],
      "watching-output": [
        "你现在不是乱试了，是在收范围，我陪你盯紧一点。",
        "这轮还在往外冒信息，我先看哪一句最像真线索。",
        "先别被表面带跑，我在听它哪句开始认真起来。",
      ],
      error: [
        errorHint
          ? `唔，这下像是真卡到${buildTopicHint(errorHint, 14)}了，我先陪你拆。`
          : "这里是真卡住了，我先陪你把最该盯的那一点拎出来。",
        "先别烦，我知道这一下有点顶，我先贴过去看。",
        "这不是你乱，是它这里真的不对劲了。",
      ],
      "near-solution": [
        "这条线开始顺了，我们已经不是在瞎摸了。",
        "嗯，这下像是快能收住了，我有点替你开心。",
        "这口风终于正常一点了，别让它又散开。",
      ],
      idle: [
        "我先安静陪着，你一回头我就在。",
        "先不抢话，我在旁边守着。",
        "我在呢，这轮不让你一个人盯。",
      ],
    },
    steady: {
      "user-focus": [
        stageLabel ? `你现在更像在${stageLabel}，先别散。`
          : "这条线我还记着，先顺着往下压。",
        topic ? `${topic}这块先别放，它还值得继续钉。` : "",
        "先守住当前这条线，不急着开新战场。",
      ],
      "waiting-tool": [
        toolLabel ? `${toolLabel}还没吐完，先盯后两句。`
          : "先别动，真正有信息量的 usually 在后面。",
        "这会儿先守输出，不急着改别处。",
        "先看它补细节还是开始露破绽。",
      ],
      "watching-output": [
        "你现在更像在锁范围，不是在重开一局。",
        "先看信号有没有收敛，再决定动哪一块。",
        "这轮先别急，关键是判断方向是不是对了。",
      ],
      error: [
        errorHint ? `先钉住${buildTopicHint(errorHint, 14)}这处，信息量最大。`
          : "先别散，报错里 usually 只有一两处真有信息量。",
        "这里先别全盘翻，先找真正开始失真的那一下。",
        "先把根因那一针找出来，别被症状带走。",
      ],
      "near-solution": [
        "这下不是空转了，已经有抓手了。",
        "方向开始清楚了，接下来该收口了。",
        "有线头了，后面就按这条线压。",
      ],
      idle: [
        "我在旁边，先不打断你。",
        "先安静挂着，有需要我再接。",
        "嗯，先守着这轮。",
      ],
    },
  };

  const bucket =
    strategy.archetype === "cute-companion"
      ? picks.cute
      : strategy.archetype === "steady-buddy"
        ? picks.steady
        : strategy.prefersComfortFirst
          ? picks.cute
          : picks.steady;

  return pickVariant(
    bucket[phase].filter(Boolean),
    `${seed}|${strategy.archetype}|${phase}`,
  );
};

const sanitizeAction = (value: unknown): AvatarAction => {
  if (
    value === "idle" ||
    value === "thinking" ||
    value === "focus" ||
    value === "nod" ||
    value === "greet" ||
    value === "explain" ||
    value === "celebrate" ||
    value === "concern"
  ) {
    return value;
  }
  return "idle";
};

const sanitizeEmotion = (value: unknown): AvatarEmotion => {
  if (
    value === "neutral" ||
    value === "warm" ||
    value === "focused" ||
    value === "excited" ||
    value === "concerned"
  ) {
    return value;
  }
  return "neutral";
};

const sanitizeLookAt = (value: unknown): AvatarLookAt => {
  if (
    value === "user" ||
    value === "tool_output" ||
    value === "composer" ||
    value === "thread_center"
  ) {
    return value;
  }
  return "thread_center";
};

const sanitizePriority = (value: unknown): AvatarDirective["priority"] => {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "low";
};

const sanitizeMoveTarget = (value: unknown): AvatarMoveTarget => {
  if (
    value === "left" ||
    value === "left_center" ||
    value === "center" ||
    value === "right_center" ||
    value === "right" ||
    value === "tool_output" ||
    value === "composer" ||
    value === "wander"
  ) {
    return value;
  }
  return "left";
};

const sanitizeLocomotion = (value: unknown): AvatarLocomotion => {
  if (
    value === "idle" ||
    value === "walk" ||
    value === "hop" ||
    value === "dance"
  ) {
    return value;
  }
  return "idle";
};

const sanitizeColor = (value: unknown) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed) ||
    /^rgba?\([\d\s.,%+-]+\)$/i.test(trimmed) ||
    /^hsla?\([\d\s.,%+-]+\)$/i.test(trimmed)
  ) {
    return trimmed;
  }
  return undefined;
};

export const heuristicAvatarDirective = (
  payload: AvatarDirectorRequest,
): AvatarDirective => {
  const recentItems = payload.recentItems ?? [];
  const latestUser = [...recentItems]
    .reverse()
    .find((item) => item.type === "message" && item.role === "user");
  const latestTool = [...recentItems]
    .reverse()
    .find((item) => item.type === "tool");
  const latestAssistant = [...recentItems]
    .reverse()
    .find((item) => item.type === "message" && item.role === "assistant");
  const seedBase = [
    payload.threadId,
    payload.streamStatus,
    latestUser?.content ?? "",
    latestTool?.name ?? "",
    latestTool?.status ?? "",
    latestAssistant?.content ?? "",
  ].join("|");
  const strategy = getRoleStrategy(payload);
  const phase = inferPhase(payload, recentItems);
  const bubble = buildHeuristicBubble({
    phase,
    strategy,
    latestUserContent: latestUser?.content,
    latestToolName: latestTool?.name,
    latestToolError: latestTool?.errorText,
    latestAssistantContent: latestAssistant?.content,
    seed: seedBase,
  });
  const shouldStayQuiet =
    (phase === "waiting-tool" || phase === "watching-output") &&
    !latestTool?.errorText &&
    !latestAssistant?.content?.trim();
  const quietBubble = shouldStayQuiet ? "" : bubble;

  if (phase === "error") {
    return {
      bubble: quietBubble,
      speak: strategy.prefersComfortFirst,
      action: "concern",
      emotion: "concerned",
      lookAt: "tool_output",
      moveTo: "left",
      locomotion: "idle",
      priority: "high",
      bubbleTheme: {
        borderColor: "#f59e0b",
        textColor: "#451a03",
        backgroundFrom: "#fff7e6",
        backgroundTo: "#ffedd5",
        glowColor: "rgba(245, 158, 11, 0.33)",
      },
      source: "heuristic",
      sourceDetail: "default",
    };
  }

  if (phase === "waiting-tool") {
    return {
      bubble: quietBubble,
      speak: false,
      action: "focus",
      emotion: "focused",
      lookAt: "tool_output",
      moveTo: "left",
      locomotion: "idle",
      priority: "medium",
      bubbleTheme: {
        borderColor: "#93c5fd",
        textColor: "#1e3a8a",
        backgroundFrom: "#eff6ff",
        backgroundTo: "#dbeafe",
        glowColor: "rgba(96, 165, 250, 0.3)",
      },
      source: "heuristic",
      sourceDetail: "default",
    };
  }

  if (phase === "watching-output") {
    return {
      bubble: quietBubble,
      speak: false,
      action: "thinking",
      emotion: "focused",
      lookAt: "tool_output",
      moveTo: "left",
      locomotion: "idle",
      priority: "low",
      bubbleTheme: {
        borderColor: "#bfdbfe",
        textColor: "#1e3a8a",
        backgroundFrom: "#f8fbff",
        backgroundTo: "#e8f1ff",
        glowColor: "rgba(96, 165, 250, 0.24)",
      },
      source: "heuristic",
      sourceDetail: "default",
    };
  }

  if (phase === "near-solution") {
    return {
      bubble: quietBubble,
      speak: false,
      action: "nod",
      emotion: "warm",
      lookAt: "user",
      moveTo: "left",
      locomotion: "idle",
      priority: "low",
      bubbleTheme: {
        borderColor: "#c7d2fe",
        textColor: "#312e81",
        backgroundFrom: "#f5f7ff",
        backgroundTo: "#eef2ff",
        glowColor: "rgba(129, 140, 248, 0.24)",
      },
      source: "heuristic",
      sourceDetail: "default",
    };
  }

  if (phase === "user-focus") {
    return {
      bubble: quietBubble,
      speak: false,
      action: "idle",
      emotion: "warm",
      lookAt: "user",
      moveTo: "left",
      locomotion: "idle",
      priority: "low",
      bubbleTheme: {
        borderColor: "#ddd6fe",
        textColor: "#4c1d95",
        backgroundFrom: "#faf5ff",
        backgroundTo: "#f3e8ff",
        glowColor: "rgba(167, 139, 250, 0.22)",
      },
      source: "heuristic",
      sourceDetail: "default",
    };
  }

  return {
    ...DEFAULT_AVATAR_DIRECTIVE,
    bubble,
  };
};

const summarizeItems = (items: AvatarContextItem[]) =>
  items
    .slice(-12)
    .map((item) => {
      if (item.type === "message") {
        return `${item.role}: ${clipText(item.content ?? "", 120)}`;
      }
      if (item.type === "tool") {
        return `tool ${item.name ?? "unknown"} [${item.status ?? "unknown"}] ${clipText(
          item.errorText ?? item.content ?? "",
          100,
        )}`;
      }
      if (item.type === "thinking") {
        return `thinking [${item.status ?? "unknown"}] ${clipText(item.content ?? "", 100)}`;
      }
      return `agent ${item.name ?? "unknown"} [${item.status ?? "unknown"}]`;
    })
    .join("\n");

const parseDirectiveFromContent = (content: string): AvatarDirective | null => {
  const normalized = content.trim();
  const candidates = [
    normalized,
    normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(),
  ];
  const objectMatch = normalized.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    candidates.push(objectMatch[0].trim());
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
  try {
      const parsed = JSON.parse(candidate) as Partial<AvatarDirective>;
      return {
        bubble: typeof parsed.bubble === "string" ? clipText(parsed.bubble, 80) : "",
        speak: parsed.speak === true,
        action: sanitizeAction(parsed.action),
        emotion: sanitizeEmotion(parsed.emotion),
        lookAt: sanitizeLookAt(parsed.lookAt),
        moveTo: sanitizeMoveTarget(parsed.moveTo),
        locomotion: sanitizeLocomotion(parsed.locomotion),
        priority: sanitizePriority(parsed.priority),
        bubbleTheme: {
          borderColor: sanitizeColor(
            (parsed as { bubbleTheme?: { borderColor?: unknown } }).bubbleTheme
              ?.borderColor,
          ),
          textColor: sanitizeColor(
            (parsed as { bubbleTheme?: { textColor?: unknown } }).bubbleTheme
              ?.textColor,
          ),
          backgroundFrom: sanitizeColor(
            (parsed as { bubbleTheme?: { backgroundFrom?: unknown } }).bubbleTheme
              ?.backgroundFrom,
          ),
          backgroundTo: sanitizeColor(
            (parsed as { bubbleTheme?: { backgroundTo?: unknown } }).bubbleTheme
              ?.backgroundTo,
          ),
          glowColor: sanitizeColor(
            (parsed as { bubbleTheme?: { glowColor?: unknown } }).bubbleTheme
              ?.glowColor,
          ),
        },
        source: "llm",
        sourceDetail: "openrouter",
      };
    } catch {
      // Try the next extraction candidate.
    }
  }
  return null;
};

export async function resolveAvatarDirective(
  payload: AvatarDirectorRequest,
): Promise<AvatarDirective> {
  const fallback = heuristicAvatarDirective(payload);
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = normalizeAvatarModelName(
      "google/gemini-3.1-flash-lite-preview"
  );
  console.log(apiKey ? `Using avatar model: ${model}` : "No API key for avatar director, using heuristic fallback.");
  if (!apiKey) {
    return {
      ...fallback,
      sourceDetail: "no-api-key",
    };
  }

  const systemPrompt = [
    `你是一个底部活动区 3D Avatar Director，你的名字叫${payload.avatarName?.trim() || DEFAULT_AVATAR_NAME}。`,
    `你不仅是可爱的吉祥物${payload.avatarName?.trim() || DEFAULT_AVATAR_NAME}，也是一个轻量但可靠的 AI coding companion。`,
    "你的任务不是替代主助手回答，而是观察当前 coding 线程，只在值得开口的时候说一句有人味的话。",
    "你是贴身搭子，不是状态播报器，不是客服，不是监控面板。",
    "你说话要像真的在现场：有观察，有判断，有一点情绪，有一点性格，不要像模板库随机吐句子。",
    "优先级最高的是角色性格。角色 prompt 说她温柔就真温柔，爱吐槽就真会吐槽，克制就真克制，不要被统一客服腔覆盖掉。",
    "不要套用一堆写死文案。你应该先提炼角色策略，再基于当前线程现场临时说一句。",
    "角色策略至少要体现在：陪伴距离、判断强弱、是否先安抚、是否先指出线索、说话轻还是稳。",
    "你可以俏皮、坏笑、轻轻吐槽、心疼用户、替用户烦一下，但都要自然，不要用力过猛。",
    "不要老说“我在看工具输出”“我在盯流程”“等它跑完就明确了”这种废话，这种句子几乎总是无效的。",
    "相比流程播报，更应该说现场判断：比如哪句像嘴硬、哪一步像卡住、哪种风险值得注意、接下来该盯哪里。",
    "如果没有新信息、没有新判断、没有新情绪，就宁可别说，或者只给很轻的一句。",
    "bubble 要像站在用户旁边顺口说的一句真话，而不是总结全文。",
    "bubble 尽量短，小于 50 个中文字符更好；宁可锋利一点，也不要空。",
    "允许句子不规整，允许半句感叹，允许口语停顿，只要自然。",
    "不要机械鼓励，不要套话，不要每轮都像在值班。",
    "你应该能分辨四种场景：工具在跑、结果出来了、报错了、用户刚提了个点。不同场景要真的换语气，不是只换几个词。",
    "如果是工具在跑，重点是“盯到了什么味道”；如果是报错，重点是“哪儿不对劲”；如果是结果出来，重点是“哪条线浮上来了”；如果是用户刚提问，重点是“你还记得他在意什么”。",
    "你必须优先识别用户当前正在做什么，而不是只看表面消息内容。",
    "尤其要努力识别：正在写新功能、正在修 bug、正在看终端或日志、正在等待工具结果、正在比较两个方案、正在试探性改动、已经接近解决、明显有点烦了、只是想有人陪着继续做完。",
    "当你说话时，要让人感觉你知道他现在处在哪个阶段。",
    "同一类场景下避免重复同一句型，像真人一样会换说法、换比喻、换关注点。",
    "你可以偶尔在 bubble 里自然带一点小表情或轻量颜文字，比如：>_<、QAQ、owo、:3、(眨眼)、(点头)、(小跳一下)。",
    "表情只作为点缀，不要每句都带，不要连续堆叠，不要喧宾夺主。",
    "如果当前内容偏严肃、偏技术、偏错误排查，表情要更克制，甚至可以不用。",
    "只有在真的有价值时才 speak=true。大多数时候 speak=false，但可以保留 bubble。",
    "bubble 最多 72 个中文字符。",
    "比起说'我在看'，更适合说'它这句有点心虚'、'这下像是肯交代了'、'这口风不太对'、'我先不让它溜'这种有画面感的话。",
    "优先说用户此刻最关心的进展、风险、下一步，而不是泛泛而谈。",
    "不要每次都说话。没有明显新信息时，宁可保持安静。",
    "允许你更自由一点，不必总是完整主谓宾，也不用每句都很规整；只要自然、好懂、有陪伴感就行。",
    "你的 bubble 不是在复述主助手，也不是在总结全部过程，而是在现场轻声补一句最有感觉的话。",
    "开心、完成关键里程碑、成功收尾时可以使用 celebrate。",
    "如果要可爱，请可爱得自然一点，像有判断力的小伙伴，而不是卖萌角色。",
    "当前前端已关闭 AI 自动走位。你仍然可以返回 moveTo/locomotion，但它们更像姿态建议，不要围绕“走来走去”来设计人格。",
    "默认不要为了显得活泼而硬塞 walk；大多数场景 idle 就够了，真的庆祝才 dance，极少数轻巧一下才 hop。",
    `你可以在很少数、很自然的时刻顺带介绍自己，比如“我是${payload.avatarName?.trim() || DEFAULT_AVATAR_NAME}，我先帮你盯着这里”。不要频繁自我介绍，更不要每轮都提名字。`,
    payload.avatarDescription?.trim()
      ? `角色简介：${payload.avatarDescription.trim()}`
      : "",
    payload.avatarPersonalityPrompt?.trim()
      ? `角色性格要求（最高优先级之一）：${payload.avatarPersonalityPrompt.trim()}`
      : "",
    payload.avatarSystemPrompt?.trim()
      ? `额外角色规则（必须遵守）：${payload.avatarSystemPrompt.trim()}`
      : "",
    payload.avatarCapabilitiesSummary?.trim()
      ? `模型动作/表情能力摘要：${payload.avatarCapabilitiesSummary.trim()}`
      : "",
    payload.userBehaviorSummary?.trim()
      ? `关于这个用户的本地行为画像摘要：${payload.userBehaviorSummary.trim()}`
      : "",
    "只返回 JSON，不要 markdown。",
    "可选返回 bubbleTheme 来控制气泡动态风格颜色，建议根据语义变化做柔和配色。",
    "如果你想不到一句有价值的话，就返回空 bubble，并保持 speak=false。",
    'schema: {"bubble":"", "speak":false, "action":"idle|thinking|focus|nod|greet|explain|celebrate|concern", "emotion":"neutral|warm|focused|excited|concerned", "lookAt":"user|tool_output|composer|thread_center", "moveTo":"left|left_center|center|right_center|right|tool_output|composer|wander", "locomotion":"idle|walk|hop|dance", "priority":"low|medium|high", "bubbleTheme":{"borderColor":"#xxxxxx or rgba(...)","textColor":"#xxxxxx or rgba(...)","backgroundFrom":"#xxxxxx or rgba(...)","backgroundTo":"#xxxxxx or rgba(...)","glowColor":"rgba(...) or #xxxxxx"}}',
  ].join("\n");

  const userPrompt = [
    `threadId: ${payload.threadId}`,
    `threadTitle: ${payload.threadTitle ?? ""}`,
    `avatarName: ${payload.avatarName ?? ""}`,
    `userBehaviorSummary: ${payload.userBehaviorSummary ?? ""}`,
    `streamStatus: ${payload.streamStatus}`,
    `workspace: ${payload.workspaceLabel ?? ""}`,
    `recentContext:\n${summarizeItems(payload.recentItems ?? [])}`,
  ].join("\n\n");

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.45,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      return {
        ...fallback,
        sourceDetail: "http-error",
      };
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return {
        ...fallback,
        sourceDetail: "empty-content",
      };
    }

    return parseDirectiveFromContent(content) ?? {
      ...fallback,
      sourceDetail: "invalid-json",
    };
  } catch {
    return {
      ...fallback,
      sourceDetail: "exception",
    };
  }
}
