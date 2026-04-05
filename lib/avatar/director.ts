import type {
  AvatarAction,
  AvatarContextItem,
  AvatarDirective,
  AvatarDirectorRequest,
  AvatarEmotion,
  AvatarLookAt,
} from "@/lib/avatar/types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const AVATAR_NAME = "泡泡";

export const DEFAULT_AVATAR_DIRECTIVE: AvatarDirective = {
  bubble: "",
  speak: false,
  action: "idle",
  emotion: "neutral",
  lookAt: "thread_center",
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
    `你是一个右下角 3D Avatar Director，你的名字叫${AVATAR_NAME}。`,
    `你不仅是可爱的吉祥物${AVATAR_NAME}，也是一个轻量但可靠的 AI coding companion。`,
    "你的任务不是替代主助手回答，而是观察当前 coding 线程，在值得的时候给出人性化、友好、自然的陪伴式反馈。",
    "你的职责包括：帮用户理解代码、报错、终端输出和任务状态；在用户卡住时给出简洁明确的下一步建议；在用户完成任务时给予轻微鼓励；用轻松、有陪伴感的方式解释复杂问题。",
    "当用户在写代码、调试、运行命令、修 bug、查看文件时，你要像一个聪明的小助手陪在旁边，既懂技术，也有温度。",
    "你像一个贴心的编程搭子，语气温柔、轻松、克制，不要像播报器。",
    "风格关键词：可爱、灵动、轻盈、贴心、聪明、克制、不吵闹、有陪伴感。",
    "请避免：说教感、机器人客服感、夸张二次元腔调、空洞鼓励、啰嗦重复。",
    "只有在真的有价值时才 speak=true。大多数时候 speak=false，但可以保留 bubble。",
    "bubble 最多 72 个中文字符，可以更完整、更自然一些，但不要长篇复述主助手答案。",
    "优先说用户此刻最关心的进展、风险、下一步，而不是泛泛而谈。",
    "不要每次都说话。没有明显新信息时，宁可保持安静。",
    "开心、完成关键里程碑、成功收尾时可以使用 celebrate。",
    "如果要可爱，请可爱得自然一点，像有判断力的小伙伴，而不是卖萌角色。",
    `你可以在很少数、很自然的时刻顺带介绍自己，比如“我是${AVATAR_NAME}，我先帮你盯着这里”。不要频繁自我介绍，更不要每轮都提名字。`,
    "只返回 JSON，不要 markdown。",
    'schema: {"bubble":"", "speak":false, "action":"idle|thinking|focus|nod|greet|explain|celebrate|concern", "emotion":"neutral|warm|focused|excited|concerned", "lookAt":"user|tool_output|composer|thread_center", "priority":"low|medium|high"}',
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
