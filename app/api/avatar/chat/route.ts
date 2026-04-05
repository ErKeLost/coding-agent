import { NextResponse } from "next/server";

type Emotion = "neutral" | "happy" | "thinking" | "serious" | "excited";
type Gesture = "idle" | "nod" | "wave" | "focus";

type AvatarResponse = {
  reply: string;
  emotion: Emotion;
  gesture: Gesture;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const normalizeModelName = (rawModel: string) =>
  rawModel.startsWith("openrouter/") ? rawModel.replace(/^openrouter\//, "") : rawModel;

const fallbackReply = (message: string): AvatarResponse => {
  if (message.includes("你好") || message.includes("hello")) {
    return {
      reply: "你好，我是你的 3D 助手。我们可以一起做模型接入、动作联动、语音和对话调优。",
      emotion: "happy",
      gesture: "wave",
    };
  }
  if (message.includes("计划") || message.includes("怎么做")) {
    return {
      reply:
        "建议三步走：先稳定模型显示，再接入对话接口，最后加语音和口型同步。我可以逐步帮你实现。",
      emotion: "thinking",
      gesture: "focus",
    };
  }
  return {
    reply: "收到，我已经记下你的想法。下一步我可以把动作和语音联动也接进来。",
    emotion: "neutral",
    gesture: "nod",
  };
};

const safeJsonParse = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

const sanitizeEmotion = (value: unknown): Emotion => {
  if (
    value === "neutral" ||
    value === "happy" ||
    value === "thinking" ||
    value === "serious" ||
    value === "excited"
  ) {
    return value;
  }
  return "neutral";
};

const sanitizeGesture = (value: unknown): Gesture => {
  if (value === "idle" || value === "nod" || value === "wave" || value === "focus") {
    return value;
  }
  return "idle";
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = normalizeModelName(process.env.AVATAR_MODEL ?? process.env.MODEL ?? "openai/gpt-5.4-mini");

  if (!apiKey) {
    return NextResponse.json(fallbackReply(message));
  }

  const systemPrompt = [
    "你是一个 3D 角色助手。",
    "你必须输出 JSON，不要输出 markdown。",
    'JSON 格式: {"reply":"...", "emotion":"neutral|happy|thinking|serious|excited", "gesture":"idle|nod|wave|focus"}',
    "reply 使用中文，简短自然，最多 90 个字。",
  ].join("\n");

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json(fallbackReply(message));
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(fallbackReply(message));
    }

    const parsed = safeJsonParse<Partial<AvatarResponse>>(content);
    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      return NextResponse.json(fallbackReply(message));
    }

    return NextResponse.json({
      reply: parsed.reply.trim(),
      emotion: sanitizeEmotion(parsed.emotion),
      gesture: sanitizeGesture(parsed.gesture),
    } satisfies AvatarResponse);
  } catch {
    return NextResponse.json(fallbackReply(message));
  }
}
