import "server-only";

import path from "node:path";
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

const COMPACTION_PROMPT = `你是一个线程历史上下文压缩器。

目标：把较早的对话压缩成一段高密度、结构化的历史背景摘要，供后续编码 agent 了解线程历史。

重要原则：
- 这是历史摘要，不是当前任务指令
- 当前用户消息始终优先于这段摘要
- 不要把历史里的“下一步”写成本轮默认必须执行的动作
- 尽量保留事实、结果、文件、命令、风险，少做行为指挥

输出要求：
- 只输出中文摘要，不要寒暄，不要额外说明，不要 markdown
- 必须严格按下面四个分区输出，分区标题必须保留：
历史事实：
相关文件：
验证与结果：
未决风险：
- 每个分区都要有内容；如果没有可写内容，写“无”
- 优先保留：历史背景、关键事实、已完成事项、关键文件、关键命令或工具结果、未决风险
- 如果历史里出现过计划、下一步、待办，只能把它们写成“当时的计划/未决事项”，不要写成当前必须继续执行的目标
- 不要复述无意义闲聊
- 不要编造不存在的信息
- 控制在 2200 字以内
`;

const FALLBACK_SENTENCE_LIMIT = 10;
const SUMMARY_SECTIONS = [
  "历史事实",
  "相关文件",
  "验证与结果",
  "未决风险",
] as const;
type SummarySectionTitle = (typeof SUMMARY_SECTIONS)[number];
type StructuredCompactionSummary = {
  historicalFacts: string[];
  relevantFiles: string[];
  validationResults: string[];
  openRisks: string[];
  renderedSummary: string;
};

const FILE_PATH_PATTERN =
  /(?:^|[\s("'`])([A-Za-z0-9_./@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|py|rs|go|java|kt|swift|css|scss|html|yml|yaml|toml|sh))(?:$|[\s)"'`:;,])/g;
const VALIDATION_PATTERN =
  /(test|tests|testing|lint|typecheck|build|compile|compiled|passed|pass|failed|fail|error|errors|warning|warnings|exit code|exitCode|验证|测试|构建|编译|通过|失败|报错|告警)/i;
const RISK_PATTERN =
  /(risk|risks|block|blocked|blocking|todo|open question|next step|follow-up|failed|error|warning|pending|未决|阻塞|风险|待办|问题|报错|失败|后续)/i;

const pickPreservedRecentMessages = (strategy: ContextCompactionStrategy) => {
  if (strategy === "critical") return CONTEXT_CRITICAL_RECENT_MESSAGES;
  if (strategy === "compact") return CONTEXT_COMPACT_RECENT_MESSAGES;
  return CONTEXT_DEFAULT_RECENT_MESSAGES;
};

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

function uniqueNonEmpty(values: string[], limit = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}

function extractRelevantFiles(transcript: string) {
  const matches: string[] = [];
  for (const match of transcript.matchAll(FILE_PATH_PATTERN)) {
    const candidate = (match[1] ?? "").trim();
    if (!candidate) continue;
    matches.push(candidate.replace(/^["'`(]+|[)"'`:;,]+$/g, ""));
  }
  return uniqueNonEmpty(matches, 10);
}

function pickMatchingLines(transcript: string, pattern: RegExp, limit = 6) {
  return uniqueNonEmpty(
    transcript
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => pattern.test(line))
      .map((line) => truncateText(line, 220)),
    limit,
  );
}

function formatSection(title: (typeof SUMMARY_SECTIONS)[number], lines: string[]) {
  if (lines.length === 0) {
    return `${title}：\n- 无`;
  }
  return `${title}：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function formatWorkingMemoryList(lines: string[], fallback = "unknown") {
  if (lines.length === 0) return `- ${fallback}`;
  return lines.map((line) => `- ${line}`).join("\n");
}

function parseStructuredSummary(summary: string): StructuredCompactionSummary {
  const text = summary.trim();
  if (!text) {
    return {
      historicalFacts: [],
      relevantFiles: [],
      validationResults: [],
      openRisks: [],
      renderedSummary: SUMMARY_SECTIONS.map((title) => formatSection(title, [])).join("\n\n"),
    };
  }

  const values: Record<SummarySectionTitle, string[]> = {
    历史事实: [],
    相关文件: [],
    验证与结果: [],
    未决风险: [],
  };

  let currentTitle: SummarySectionTitle | null = null;
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const matchedTitle = SUMMARY_SECTIONS.find((title) => line === `${title}：`);
    if (matchedTitle) {
      currentTitle = matchedTitle;
      continue;
    }

    const normalizedLine = line.replace(/^-\s*/, "").trim();
    if (!normalizedLine) continue;

    if (currentTitle) {
      values[currentTitle].push(normalizedLine);
    } else {
      values.历史事实.push(normalizedLine);
    }
  }

  const normalized: StructuredCompactionSummary = {
    historicalFacts: uniqueNonEmpty(values.历史事实, 10),
    relevantFiles: uniqueNonEmpty(values.相关文件, 10),
    validationResults: uniqueNonEmpty(values.验证与结果, 10),
    openRisks: uniqueNonEmpty(values.未决风险, 10),
    renderedSummary: "",
  };

  normalized.renderedSummary = [
    formatSection("历史事实", normalized.historicalFacts),
    formatSection("相关文件", normalized.relevantFiles),
    formatSection("验证与结果", normalized.validationResults),
    formatSection("未决风险", normalized.openRisks),
  ].join("\n\n");

  return normalized;
}

const buildFallbackSummary = (transcript: string): StructuredCompactionSummary => {
  const historicalFacts = transcript
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-FALLBACK_SENTENCE_LIMIT)
    .map((line) => truncateText(line, 240));
  const relevantFiles = extractRelevantFiles(transcript);
  const validationResults = pickMatchingLines(transcript, VALIDATION_PATTERN, 6);
  const openRisks = pickMatchingLines(transcript, RISK_PATTERN, 6);

  return {
    historicalFacts,
    relevantFiles,
    validationResults,
    openRisks,
    renderedSummary: [
      formatSection("历史事实", historicalFacts),
      formatSection("相关文件", relevantFiles),
      formatSection("验证与结果", validationResults),
      formatSection("未决风险", openRisks),
    ].join("\n\n"),
  };
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
}): Promise<StructuredCompactionSummary> => {
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
  return parseStructuredSummary(content);
};

function buildWorkingMemoryTemplate(args: {
  requestContext: RequestContext;
  incomingText?: string;
  compaction: ThreadCompactionState | null;
}) {
  const workspaceRoot = getRequestContextString(args.requestContext, "workspaceRoot") ?? "";
  const projectLabel = workspaceRoot ? path.basename(workspaceRoot) || workspaceRoot : "unknown";
  const currentUserRequest = args.incomingText?.trim() || "unknown";
  const historicalFacts = args.compaction?.historicalFacts ?? [];
  const relevantFiles = args.compaction?.relevantFiles ?? [];
  const validationResults = args.compaction?.validationResults ?? [];
  const openRisks = args.compaction?.openRisks ?? [];

  return `# Session Context

- Current project: ${projectLabel}
- Current user request: ${currentUserRequest}
- Historical facts:
${formatWorkingMemoryList(historicalFacts)}
- Relevant files:
${formatWorkingMemoryList(relevantFiles)}
- Recent validation or results:
${formatWorkingMemoryList(validationResults)}
- Open risks:
${formatWorkingMemoryList(openRisks)}
- Constraints:
- Open questions:
- Suggested next step (only if the current user request clearly implies one):
`;
}

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
    let summary: StructuredCompactionSummary | null = null;
    let generatedBy: ThreadCompactionState["generatedBy"] = "fallback";

    try {
      summary = await generateSummaryWithAgent({
        agent: args.agent,
        requestContext: args.requestContext,
        transcript,
      });
      if (summary.renderedSummary.trim()) {
        generatedBy = "model";
      }
    } catch {
      summary = null;
    }

    if (!summary) {
      summary = buildFallbackSummary(transcript);
    }

    compaction = {
      historicalFacts: summary.historicalFacts,
      relevantFiles: summary.relevantFiles,
      validationResults: summary.validationResults,
      openRisks: summary.openRisks,
      renderedSummary: summary.renderedSummary,
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
        template: buildWorkingMemoryTemplate({
          requestContext: args.requestContext,
          incomingText: args.incomingText,
          compaction,
        }),
      },
    },
  };
}
