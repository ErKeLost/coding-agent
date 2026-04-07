import "server-only";

import type { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { ThreadSession } from "@/lib/thread-session";
import {
  buildContextWindowState,
  CONTEXT_COMPACT_RECENT_MESSAGES,
  CONTEXT_CRITICAL_RECENT_MESSAGES,
  CONTEXT_DEFAULT_RECENT_MESSAGES,
  getCompactionStrategy,
  hashTranscript,
  summarizeItemsTranscript,
  type ContextCompactionStrategy,
  type ThreadCompactionState,
  type ThreadContextWindowState,
} from "@/lib/context-window";
import { upsertThreadSession } from "@/lib/server/thread-session-store";

const COMPACTION_PROMPT = `你是一个线程上下文压缩器。

目标：把较早的对话压缩成一段高密度 continuation summary，供后续编码 agent 继续工作。

输出要求：
- 只输出中文 summary，不要寒暄，不要标题，不要 markdown
- 保留：用户目标、已完成事项、关键文件、关键命令/工具结果、当前阻塞、下一步
- 不要复述无意义闲聊
- 不要编造不存在的信息
- 控制在 2200 字以内
- 如果存在未完成风险，要明确点出
`;

const FALLBACK_SENTENCE_LIMIT = 10;

const pickPreservedRecentMessages = (strategy: ContextCompactionStrategy) => {
  if (strategy === "critical") return CONTEXT_CRITICAL_RECENT_MESSAGES;
  if (strategy === "compact") return CONTEXT_COMPACT_RECENT_MESSAGES;
  return CONTEXT_DEFAULT_RECENT_MESSAGES;
};

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const buildFallbackSummary = (transcript: string) => {
  const lines = transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-FALLBACK_SENTENCE_LIMIT)
    .map((line) => `- ${truncateText(line, 240)}`);

  return [
    "历史上下文压缩摘要：",
    ...lines,
  ].join("\n");
};

const cloneRequestContext = (source: RequestContext) => {
  const clone = new (source.constructor as typeof RequestContext)();
  const sourceWithGet = source as RequestContext & {
    get?: (name: string) => unknown;
  };
  const keys = [
    "model",
    "threadId",
    "resourceId",
    "workspaceRoot",
  ];

  for (const key of keys) {
    const value = sourceWithGet.get?.(key);
    if (value !== undefined) clone.set(key, value);
  }
  return clone;
};

const getRequestContextString = (requestContext: RequestContext, key: string) => {
  const value = (requestContext as RequestContext & {
    get?: (name: string) => unknown;
  }).get?.(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const generateSummaryWithAgent = async (args: {
  agent: Agent;
  requestContext: RequestContext;
  transcript: string;
}) => {
  const prompt = `${COMPACTION_PROMPT}\n\n需要压缩的历史记录如下：\n${args.transcript}`;

  const result = await args.agent.generate(prompt, {
    requestContext: cloneRequestContext(args.requestContext),
    memory: undefined,
    modelSettings: {
      temperature: 0.2,
      topP: 1,
    },
    abortSignal: AbortSignal.timeout?.(15000),
  });

  const content =
    typeof result?.text === "string"
      ? result.text
      : typeof (result as { outputText?: unknown }).outputText === "string"
        ? ((result as { outputText?: string }).outputText ?? "")
        : "";
  return content.trim();
};

export async function prepareThreadContextWindow(args: {
  agent: Agent;
  requestContext: RequestContext;
  threadSession: ThreadSession | null;
  incomingText?: string;
  systemPromptText?: string;
}) : Promise<{
  contextWindow: ThreadContextWindowState;
  compaction: ThreadCompactionState | null;
  memoryOptions: {
    lastMessages: number;
    semanticRecall: {
      topK: number;
      messageRange: number;
      scope: "thread";
    };
    workingMemory: {
      enabled: true;
      scope: "thread";
      template: string;
    };
  };
}> {
  const modelId = getRequestContextString(args.requestContext, "model");
  const items = Array.isArray(args.threadSession?.state.items)
    ? args.threadSession?.state.items
    : [];
  const existingCompaction = args.threadSession?.state.contextWindow?.compaction ?? null;

  const rawWindow = buildContextWindowState({
    items,
    currentInputText: args.incomingText,
    systemPromptText: args.systemPromptText,
    compaction: null,
    modelId,
  });
  const strategy = getCompactionStrategy(rawWindow.estimatedPromptTokens, modelId);
  const preservedRecentMessages = pickPreservedRecentMessages(strategy);
  const olderItems =
    strategy === "none" ? [] : items.slice(0, Math.max(0, items.length - preservedRecentMessages));
  const transcript = summarizeItemsTranscript(olderItems);
  const transcriptHash = hashTranscript(transcript);

  let compaction = existingCompaction;
  if (
    strategy !== "none" &&
    transcript.trim() &&
    (!existingCompaction ||
      existingCompaction.sourceHash !== transcriptHash ||
      existingCompaction.strategy !== strategy)
  ) {
    let summary = "";
    let generatedBy: ThreadCompactionState["generatedBy"] = "fallback";

    try {
      summary = await generateSummaryWithAgent({
        agent: args.agent,
        requestContext: args.requestContext,
        transcript,
      });
      if (summary) {
        generatedBy = "model";
      }
    } catch {
      summary = "";
    }

    if (!summary) {
      summary = buildFallbackSummary(transcript);
    }

    compaction = {
      summary,
      sourceHash: transcriptHash,
      sourceItemCount: olderItems.length,
      preservedRecentMessages,
      updatedAt: Date.now(),
      strategy,
      generatedBy,
    };
  }

  if (strategy === "none") {
    compaction = null;
  }

  const contextWindow = buildContextWindowState({
    items,
    currentInputText: args.incomingText,
    systemPromptText: args.systemPromptText,
    compaction,
    preservedRecentMessages,
    modelId,
  });

  if (args.threadSession?.id) {
    await upsertThreadSession({
      threadId: args.threadSession.id,
      state: {
        contextWindow,
      },
    });
  }

  return {
    contextWindow,
    compaction,
    memoryOptions: {
      lastMessages: preservedRecentMessages,
      semanticRecall: {
        topK: strategy === "critical" ? 1 : strategy === "compact" ? 2 : 3,
        messageRange: strategy === "critical" ? 1 : strategy === "compact" ? 1 : 2,
        scope: "thread",
      },
      workingMemory: {
        enabled: true,
        scope: "thread",
        template: `# Session Context

- Current project:
- Current goal:
- Relevant files:
- Constraints:
- Open questions:
- Next concrete step:
`,
      },
    },
  };
}
