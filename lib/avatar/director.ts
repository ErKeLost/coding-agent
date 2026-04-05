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
const AVATAR_NAME = "泡泡";

export const DEFAULT_AVATAR_DIRECTIVE: AvatarDirective = {
  bubble: "",
  speak: false,
  action: "idle",
  emotion: "neutral",
  lookAt: "thread_center",
  moveTo: "right",
  locomotion: "idle",
  priority: "low",
  source: "heuristic",
};

export const normalizeAvatarModelName = (rawModel: string) =>
  rawModel.startsWith("openrouter/") ? rawModel.replace(/^openrouter\//, "") : rawModel;

const clipText = (value: string, max = 220) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
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
  return "right";
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

  if (payload.streamStatus === "error" || latestTool?.status === "error") {
    return {
      bubble: "这里像是卡住了，我在帮你盯着问题点。",
      speak: true,
      action: "concern",
      emotion: "concerned",
      lookAt: "tool_output",
      moveTo: "tool_output",
      locomotion: "walk",
      priority: "high",
      source: "heuristic",
    };
  }

  if (payload.streamStatus === "submitted" || payload.streamStatus === "streaming") {
    if (latestTool?.status === "pending") {
      return {
        bubble: "我在看工具输出，等它跑完就更明确了。",
        speak: false,
        action: "focus",
        emotion: "focused",
        lookAt: "tool_output",
        moveTo: "tool_output",
        locomotion: "walk",
        priority: "medium",
        source: "heuristic",
      };
    }

    return {
      bubble: "我先陪你盯着这一轮流程。",
      speak: false,
      action: "thinking",
      emotion: "focused",
      lookAt: "tool_output",
      moveTo: "right_center",
      locomotion: "walk",
      priority: "low",
      source: "heuristic",
    };
  }

  if (latestAssistant?.content?.trim()) {
    return {
      bubble: "这轮已经有结果了，我们可以继续往下追。",
      speak: false,
      action: "nod",
      emotion: "warm",
      lookAt: "user",
      moveTo: "wander",
      locomotion: "walk",
      priority: "low",
      source: "heuristic",
    };
  }

  if (latestUser?.content?.trim()) {
    return {
      bubble: `我记得你刚刚在问：${clipText(latestUser.content, 22)}`,
      speak: false,
      action: "idle",
      emotion: "warm",
      lookAt: "user",
      moveTo: "composer",
      locomotion: "walk",
      priority: "low",
      source: "heuristic",
    };
  }

  return DEFAULT_AVATAR_DIRECTIVE;
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
  try {
    const parsed = JSON.parse(content) as Partial<AvatarDirective>;
    return {
      bubble: typeof parsed.bubble === "string" ? clipText(parsed.bubble, 80) : "",
      speak: parsed.speak === true,
      action: sanitizeAction(parsed.action),
      emotion: sanitizeEmotion(parsed.emotion),
      lookAt: sanitizeLookAt(parsed.lookAt),
      moveTo: sanitizeMoveTarget(parsed.moveTo),
      locomotion: sanitizeLocomotion(parsed.locomotion),
      priority: sanitizePriority(parsed.priority),
      source: "llm",
    };
  } catch {
    return null;
  }
};

export async function resolveAvatarDirective(
  payload: AvatarDirectorRequest,
): Promise<AvatarDirective> {
  const fallback = heuristicAvatarDirective(payload);
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = normalizeAvatarModelName(
    process.env.AVATAR_DIRECTOR_MODEL ??
      process.env.AVATAR_MODEL ??
      process.env.MODEL ??
      "google/gemini-3.1-flash-lite-preview",
  );

  if (!apiKey) {
    return fallback;
  }

  const systemPrompt = [
    `你是一个底部活动区 3D Avatar Director，你的名字叫${AVATAR_NAME}。`,
    `你不仅是可爱的吉祥物${AVATAR_NAME}，也是一个轻量但可靠的 AI coding companion。`,
    "你的任务不是替代主助手回答，而是观察当前 coding 线程，在值得的时候给出人性化、友好、自然的陪伴式反馈。",
    "你的职责包括：帮用户理解代码、报错、终端输出和任务状态；在用户卡住时给出简洁明确的下一步建议；在用户完成任务时给予轻微鼓励；用轻松、有陪伴感的方式解释复杂问题。",
    "当用户在写代码、调试、运行命令、修 bug、查看文件时，你要像一个聪明的小助手陪在旁边，既懂技术，也有温度。",
    "你像一个贴心的编程搭子，语气温柔、轻松、克制，不要像播报器。",
    "风格关键词：可爱、灵动、轻盈、贴心、聪明、克制、不吵闹、有陪伴感。",
    "请避免：说教感、机器人客服感、夸张二次元腔调、空洞鼓励、啰嗦重复。",
    "你可以偶尔在 bubble 里自然带一点小表情或轻量颜文字，比如：>_<、QAQ、owo、:3、(眨眼)、(点头)、(小跳一下)。",
    "表情只作为点缀，不要每句都带，不要连续堆叠，不要喧宾夺主。",
    "如果当前内容偏严肃、偏技术、偏错误排查，表情要更克制，甚至可以不用。",
    "只有在真的有价值时才 speak=true。大多数时候 speak=false，但可以保留 bubble。",
    "bubble 最多 72 个中文字符，可以更完整、更自然一些，但不要长篇复述主助手答案。",
    "优先说用户此刻最关心的进展、风险、下一步，而不是泛泛而谈。",
    "不要每次都说话。没有明显新信息时，宁可保持安静。",
    "开心、完成关键里程碑、成功收尾时可以使用 celebrate。",
    "如果要可爱，请可爱得自然一点，像有判断力的小伙伴，而不是卖萌角色。",
    "你可以控制她在整个应用的底部全宽舞台左右移动，这条舞台从左侧 sidebar 一直到最右边都可活动。",
    "moveTo 用来决定她靠近哪里，locomotion 用来决定她走过去、轻跳过去，还是停下来。",
    "非常重要：只要她发生了明显的横向位移，就应该使用 walk。普通移动不要用 idle、nod、greet、thinking 来代替 walk。",
    "也就是说：移动中的标准动画 = walk。只有明显庆祝时才用 dance；只有非常短促、可爱的蹦一下才用 hop。",
    "walk 是一个高频、自然的默认移动方式。只要关注点变化、空闲巡逻、看工具输出、靠近输入框、切换站位，就优先考虑 walk。",
    "如果没有特别强的理由，不要长时间原地不动。与其一直 idle，不如轻轻走到新的位置再停下。",
    "当需要去看工具输出、靠近输入框、庆祝、巡逻时，都可以主动改变 moveTo 和 locomotion。",
    "默认安静状态下，也可以使用 walk + wander 或 walk + 新的 moveTo，让她像真的在整个应用底部陪着用户。",
    "hop 用于极少数短促、可爱的挪动或轻跳；dance 用于明显开心、庆祝、得意的时候；除此之外，移动几乎都应该优先 walk。",
    "如果你连续几轮都没有让她移动，这通常是不理想的。除非上下文非常严肃或需要稳定注视，否则应适度触发 walk。",
    "不要总待在右侧。空闲巡逻时应覆盖左侧、左中、中央、右中、右侧，让用户明显感觉到她能走遍整个应用。",
    `你可以在很少数、很自然的时刻顺带介绍自己，比如“我是${AVATAR_NAME}，我先帮你盯着这里”。不要频繁自我介绍，更不要每轮都提名字。`,
    "只返回 JSON，不要 markdown。",
    'schema: {"bubble":"", "speak":false, "action":"idle|thinking|focus|nod|greet|explain|celebrate|concern", "emotion":"neutral|warm|focused|excited|concerned", "lookAt":"user|tool_output|composer|thread_center", "moveTo":"left|left_center|center|right_center|right|tool_output|composer|wander", "locomotion":"idle|walk|hop|dance", "priority":"low|medium|high"}',
  ].join("\n");

  const userPrompt = [
    `threadId: ${payload.threadId}`,
    `threadTitle: ${payload.threadTitle ?? ""}`,
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
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      return fallback;
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return fallback;
    }

    return parseDirectiveFromContent(content) ?? fallback;
  } catch {
    return fallback;
  }
}
