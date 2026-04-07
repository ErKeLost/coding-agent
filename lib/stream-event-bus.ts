"use client";

import type { Experimental_GeneratedImage, LanguageModelUsage } from "ai";
import type { ThreadContextWindowState } from "@/lib/context-window";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

export type ToolStep = {
  id: string;
  step: string;
  status: "start" | "done" | "error";
  runState?: "started" | "running" | "completed" | "failed" | "timed_out";
  message?: string;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  previewUrl?: string;
  sessionId?: string;
  createdAt: number;
};

export type PreviewLog = {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: Date;
};

export type ChatItem =
  | {
      id: string;
      type: "message";
      role: "user" | "assistant";
      content: string;
      messageKind?: "default" | "guide";
      images?: Experimental_GeneratedImage[];
      usage?: LanguageModelUsage;
      modelId?: string;
      usageCostUSD?: number;
    }
  | {
      id: string;
      type: "thinking";
      messageId: string;
      content: string;
      status: "pending" | "done";
    }
  | {
      id: string;
      type: "agent";
      agentId: string;
      name: string;
      status: "pending" | "done" | "error";
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
      content: string;
      thinking?: string;
    }
  | {
      id: string;
      type: "tool";
      name: string;
      status: "pending" | "done" | "error";
      args?: unknown;
      result?: unknown;
      errorText?: string;
      costUSD?: number;
      steps?: ToolStep[];
      agentId?: string;
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
    };

export type StreamPayload = {
  type?: string;
  event?: string;
  eventName?: string;
  data?: unknown;
  payload?: unknown;
  text?: string;
  delta?: string;
  content?: string | Array<{ type?: string; text?: string; content?: string; image?: Experimental_GeneratedImage }>;
  message?: {
    content?: string | Array<{ type?: string; text?: string; content?: string; image?: Experimental_GeneratedImage }>;
  };
  toolCallId?: string;
  toolCall?: { id?: string; name?: string; args?: unknown };
  toolResult?: { id?: string; name?: string; result?: unknown };
  name?: string;
  args?: unknown;
  result?: unknown;
  output?: { text?: string; images?: Experimental_GeneratedImage[] } | unknown;
  images?: Experimental_GeneratedImage[];
  error?: string;
  toolName?: string;
  step?: string;
  status?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
  previewUrl?: string;
  reason?: string;
  status?: "done" | "idle" | "error" | string;
  runState?: "started" | "running" | "completed" | "failed" | "timed_out";
  sessionId?: string;
  agentId?: string;
  parentToolCallId?: string;
  parentAgentId?: string;
  depth?: number;
  streamType?: "text" | "reasoning";
  targetId?: string;
  targetName?: string;
  targetType?: "agent" | "workflow" | "tool";
  usage?: LanguageModelUsage;
  stepResult?: { usage?: LanguageModelUsage };
  modelId?: string;
  costUSD?: number;
  providerMetadata?: {
    openrouter?: {
      usage?: {
        cost?: number;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
        promptTokensDetails?: { cachedTokens?: number };
        completionTokensDetails?: { reasoningTokens?: number };
      };
    };
  };
  contextWindow?: ThreadContextWindowState | null;
};

type StreamEventPayload =
  | (StreamPayload & {
      type: "stream.event";
      eventName:
        | "assistant.delta"
        | "assistant.reasoning.delta"
        | "tool.call.started"
        | "tool.call.progress"
        | "tool.call.completed"
        | "tool.call.failed"
        | "usage.updated"
        | "context.updated"
        | "session.updated"
        | "session.ended"
        | "agent.stream.delta"
        | "agent.handoff.started"
        | "agent.handoff.completed";
    });

type EventBusParams = {
  setItems: Dispatch<SetStateAction<ChatItem[]>>;
  setError: (value: string | null) => void;
  setStatus: (value: "submitted" | "streaming" | "ready" | "error") => void;
  setPreviewUrl: (value: string | null) => void;
  setStreamingMessageId: (value: string | null) => void;
  assistantIdRef: MutableRefObject<string | null>;
  itemsRef: MutableRefObject<ChatItem[]>;
  postToolPendingRef: MutableRefObject<boolean>;
  createId: () => string;
  appendPreviewLog?: (log: PreviewLog) => void;
  getModelId?: () => string | undefined;
  setContextWindow?: (value: ThreadContextWindowState | null) => void;
  setPlan?: (plan: {
    title: string;
    todos: Array<{ id: string; label: string; status: "pending" | "in_progress" | "completed" | "cancelled"; description?: string }>;
  } | null) => void;
};

type ToolTerminalState = {
  status: "pending" | "done" | "error";
  timer?: ReturnType<typeof setTimeout>;
};

type CachedToolResult = {
  toolName?: string;
  result: unknown;
  costUSD?: number;
};

const extractTextFromParts = (
  value: string | Array<{ type?: string; text?: string; content?: string }>
) => {
  if (typeof value === "string") return value;
  return value
    .map((part) => part.text ?? part.content ?? "")
    .filter(Boolean)
    .join("");
};

const extractText = (payload: StreamPayload | string) => {
  if (typeof payload === "string") return payload;
  if (payload.text) return payload.text;
  if (payload.delta) return payload.delta;
  if (payload.content) return extractTextFromParts(payload.content);
  if (payload.message?.content) return extractTextFromParts(payload.message.content);
  return "";
};

const extractImages = (payload: StreamPayload) => {
  const images: Experimental_GeneratedImage[] = [];
  const pushImage = (img?: Experimental_GeneratedImage) => {
    if (!img?.base64 || !img.mediaType) return;
    images.push(img);
  };

  if (payload.images?.length) {
    payload.images.forEach(pushImage);
  }

  const outputImages = (payload.output as { images?: Experimental_GeneratedImage[] })
    ?.images;
  if (outputImages?.length) {
    outputImages.forEach(pushImage);
  }

  const contentParts = Array.isArray(payload.content)
    ? payload.content
    : Array.isArray(payload.message?.content)
      ? payload.message?.content
      : [];

  contentParts.forEach((part) => {
    if (part?.type === "image" && part.image) {
      pushImage(part.image);
    }
  });

  return images;
};

const extractUsage = (payload: StreamPayload) => {
  const openrouterUsage = payload.providerMetadata?.openrouter?.usage;
  if (openrouterUsage) {
    return {
      inputTokens: openrouterUsage.promptTokens ?? 0,
      outputTokens: openrouterUsage.completionTokens ?? 0,
      totalTokens:
        openrouterUsage.totalTokens ??
        (openrouterUsage.promptTokens ?? 0) + (openrouterUsage.completionTokens ?? 0),
      reasoningTokens: openrouterUsage.completionTokensDetails?.reasoningTokens,
      cachedInputTokens: openrouterUsage.promptTokensDetails?.cachedTokens,
    };
  }
  if (payload.usage && typeof payload.usage === "object") return payload.usage;
  if (payload.stepResult?.usage) return payload.stepResult.usage;

  const nestedPayload = payload.payload as {
    usage?: LanguageModelUsage;
    stepResult?: { usage?: LanguageModelUsage };
    metadata?: {
      providerMetadata?: {
        openrouter?: {
          usage?: {
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
            promptTokensDetails?: { cachedTokens?: number };
            completionTokensDetails?: { reasoningTokens?: number };
            cost?: number;
          };
        };
      };
    };
    providerMetadata?: {
      openrouter?: {
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
          promptTokensDetails?: { cachedTokens?: number };
          completionTokensDetails?: { reasoningTokens?: number };
        };
      };
    };
  } | undefined;
  if (nestedPayload?.usage) return nestedPayload.usage;
  if (nestedPayload?.stepResult?.usage) return nestedPayload.stepResult.usage;
  if (nestedPayload?.metadata?.providerMetadata?.openrouter?.usage) {
    const usage = nestedPayload.metadata.providerMetadata.openrouter.usage;
    return {
      inputTokens: usage.promptTokens ?? 0,
      outputTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
      reasoningTokens: usage.completionTokensDetails?.reasoningTokens,
      cachedInputTokens: usage.promptTokensDetails?.cachedTokens,
    };
  }
  if (nestedPayload?.providerMetadata?.openrouter?.usage) {
    const usage = nestedPayload.providerMetadata.openrouter.usage;
    return {
      inputTokens: usage.promptTokens ?? 0,
      outputTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
      reasoningTokens: usage.completionTokensDetails?.reasoningTokens,
      cachedInputTokens: usage.promptTokensDetails?.cachedTokens,
    };
  }

  const nestedResult = payload.result as { usage?: LanguageModelUsage } | undefined;
  if (nestedResult?.usage) return nestedResult.usage;

  return undefined;
};

const isEmptyUsage = (usage?: LanguageModelUsage, costUSD?: number) => {
  if (!usage) return false;
  return (
    (usage.inputTokens ?? 0) === 0 &&
    (usage.outputTokens ?? 0) === 0 &&
    (usage.totalTokens ?? 0) === 0 &&
    (usage.reasoningTokens ?? 0) === 0 &&
    (usage.cachedInputTokens ?? 0) === 0 &&
    (costUSD ?? 0) === 0
  );
};

const extractCostUSD = (payload: StreamPayload) => {
  if (typeof payload.costUSD === "number") return payload.costUSD;
  const direct = payload.providerMetadata?.openrouter?.usage?.cost;
  if (typeof direct === "number") return direct;
  const nestedPayload = payload.payload as {
    providerMetadata?: { openrouter?: { usage?: { cost?: number } } };
    metadata?: { providerMetadata?: { openrouter?: { usage?: { cost?: number } } } };
  } | undefined;
  const nested =
    nestedPayload?.providerMetadata?.openrouter?.usage?.cost ??
    nestedPayload?.metadata?.providerMetadata?.openrouter?.usage?.cost;
  return typeof nested === "number" ? nested : undefined;
};

const normalizePayload = (payload: StreamPayload | string) => {
  if (typeof payload === "string") return payload;
  if (payload.data && typeof payload.data === "object") {
    return { ...payload, ...payload.data } as StreamPayload;
  }
  if (payload.payload && typeof payload.payload === "object") {
    return { ...payload, ...payload.payload } as StreamPayload;
  }
  if (payload.data && typeof payload.data === "string") {
    return payload.data;
  }
  return payload;
};

const isToolCall = (payload: StreamPayload) => {
  const type = payload.type?.toLowerCase();
  return (
    type?.startsWith("tool-call") ||
    type?.startsWith("tool-call-input") ||
    type?.startsWith("tool-call-delta") ||
    Boolean(payload.toolCall) ||
    Boolean(payload.toolCallId && (payload.toolCall || payload.args))
  );
};

const isToolResult = (payload: StreamPayload) => {
  const type = payload.type?.toLowerCase();
  return type?.includes("tool-result") || Boolean(payload.toolResult);
};

const isToolStep = (payload: StreamPayload) => {
  const type = payload.type?.toLowerCase();
  return type === "data-tool-progress" || type === "tool-step";
};

const mapRunStateToStepStatus = (
  runState?: StreamPayload["runState"]
): ToolStep["status"] | undefined => {
  if (!runState) return undefined;
  if (runState === "completed") return "done";
  if (runState === "failed" || runState === "timed_out") return "error";
  return "start";
};

const isReasoning = (payload: StreamPayload) => {
  const type = payload.type?.toLowerCase();
  return type?.includes("reasoning");
};

const GENERIC_TOOL_NAMES = new Set([
  "tool",
  "dynamic-tool",
  "unknown",
  "unnamed",
  "unnamed tool",
]);

const normalizeToolName = (value?: string | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const isGenericToolName = (value?: string | null) => {
  const normalized = normalizeToolName(value)?.toLowerCase();
  return normalized ? GENERIC_TOOL_NAMES.has(normalized) : false;
};

const pickPreferredToolName = (...candidates: Array<string | undefined>) => {
  const normalizedCandidates = candidates
    .map((candidate) => normalizeToolName(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));

  const specificCandidate = normalizedCandidates.find(
    (candidate) => !isGenericToolName(candidate)
  );
  return specificCandidate ?? normalizedCandidates[0];
};

const getToolFailureMessage = (result: unknown) => {
  if (!result || typeof result !== "object") return undefined;
  const record = result as {
    message?: unknown;
    error?: unknown;
    success?: unknown;
    state?: unknown;
    exitCode?: unknown;
    metadata?: {
      state?: unknown;
      exit?: unknown;
      exitCode?: unknown;
      stderr?: unknown;
      stdout?: unknown;
      timedOut?: unknown;
    };
    validationErrors?: unknown;
  };
  const topLevelState =
    typeof record.state === "string" ? record.state.trim().toLowerCase() : "";
  const metadataState =
    typeof record.metadata?.state === "string"
      ? record.metadata.state.trim().toLowerCase()
      : "";
  const state = topLevelState || metadataState;
  const timedOut =
    state === "timed_out" || record.metadata?.timedOut === true;

  const exitCode =
    typeof record.exitCode === "number"
      ? record.exitCode
      : typeof record.metadata?.exitCode === "number"
        ? record.metadata.exitCode
        : typeof record.metadata?.exit === "number"
          ? record.metadata.exit
          : undefined;
  const stderr =
    typeof record.metadata?.stderr === "string" && record.metadata.stderr.trim()
      ? record.metadata.stderr.trim()
      : undefined;
  const stdout =
    typeof record.metadata?.stdout === "string" && record.metadata.stdout.trim()
      ? record.metadata.stdout.trim()
      : undefined;

  if (
    record.validationErrors &&
    typeof record.message === "string" &&
    record.message.trim()
  ) {
    return record.message.trim();
  }
  if (typeof record.error === "string" && record.error.trim()) {
    return record.error.trim();
  }
  if (record.success === false || state === "failed" || timedOut) {
    const detail = stderr ?? stdout;
    const detailLine = detail?.split("\n")[0]?.trim();
    if (timedOut) {
      return detailLine
        ? `Command timed out: ${detailLine}`
        : "Command timed out";
    }
    if (detailLine) return detailLine;
    if (exitCode !== undefined) return `Command failed with exit code ${exitCode}`;
    return "Command failed";
  }
  if (typeof record.message === "string" && /validation failed|invalid input/i.test(record.message)) {
    return record.message.trim();
  }
  return undefined;
};

export const createStreamEventBus = ({
  setItems,
  setError,
  setStatus,
  setPreviewUrl,
  setStreamingMessageId,
  assistantIdRef,
  itemsRef,
  postToolPendingRef,
  createId,
  appendPreviewLog,
  getModelId,
  setContextWindow,
  setPlan,
}: EventBusParams) => {
  const toolTerminalState = new Map<string, ToolTerminalState>();
  const rawResultCache = new Map<string, CachedToolResult>();
  let streamTerminalToolErrorText: string | undefined;

  const clearToolTimer = (toolCallId: string) => {
    const state = toolTerminalState.get(toolCallId);
    if (state?.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
  };

  const finalizeToolStates = (errorText?: string) => {
    const terminalError = errorText?.trim() || streamTerminalToolErrorText;
    for (const [toolCallId, state] of toolTerminalState.entries()) {
      const cached = rawResultCache.get(toolCallId);
      if (cached) {
        clearToolTimer(toolCallId);
        toolTerminalState.set(toolCallId, { status: "done" });
        upsertTool({
          id: toolCallId,
          name:
            pickPreferredToolName(
              cached.toolName,
              findToolNameById(toolCallId)
            ) ?? "未命名工具",
          status: "done",
          result: cached.result,
          costUSD: cached.costUSD,
        });
        continue;
      }
      if (state.status !== "done") {
        clearToolTimer(toolCallId);
        toolTerminalState.set(toolCallId, { status: "error" });
          upsertTool({
            id: toolCallId,
            name: pickPreferredToolName(findToolNameById(toolCallId)) ?? "未命名工具",
            status: "error",
            errorText: terminalError,
          });
        }
      }
  };
  const findToolNameById = (toolCallId?: string) => {
    if (!toolCallId) return undefined;
    const found = [...itemsRef.current]
      .reverse()
      .find(
        (item) =>
          item.type === "tool" &&
          item.id === toolCallId &&
          typeof item.name === "string" &&
          item.name.trim().length > 0
      ) as Extract<ChatItem, { type: "tool" }> | undefined;
    return found?.name;
  };

  const appendAssistantText = (text: string) => {
    if (!text) return;
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;
    markAssistantThinkingDone();
    setItems((prev) =>
      prev.map((item) =>
        item.type === "message" && item.id === assistantId
          ? { ...item, content: item.content + text }
          : item
      )
    );
  };

  const appendAssistantThinking = (text: string) => {
    if (!text) return;
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;
    setItems((prev) => {
      let index = -1;
      for (let i = prev.length - 1; i >= 0; i -= 1) {
        const item = prev[i];
        if (
          item.type === "thinking" &&
          item.messageId === assistantId &&
          item.status === "pending"
        ) {
          index = i;
          break;
        }
      }
      if (index < 0) {
        const nextId = `thinking:${assistantId}:${createId()}`;
        return [
          ...prev,
          {
            id: nextId,
            type: "thinking",
            messageId: assistantId,
            content: text,
            status: "pending",
          },
        ];
      }
      const next = [...prev];
      const current = next[index] as Extract<ChatItem, { type: "thinking" }>;
      next[index] = {
        ...current,
        content: `${current.content}${text}`,
        status: "pending",
      };
      return next;
    });
  };

  const markAssistantThinkingDone = () => {
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.type === "thinking" &&
        item.messageId === assistantId &&
        item.status === "pending"
          ? { ...item, status: "done" }
          : item
      )
    );
  };

  const appendAssistantImages = (images: Experimental_GeneratedImage[]) => {
    if (!images.length) return;
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;
    setItems((prev) =>
      prev.map((item) =>
        item.type === "message" && item.id === assistantId
          ? { ...item, images: [...(item.images ?? []), ...images] }
          : item
      )
    );
  };

  const attachAssistantUsage = (usage: LanguageModelUsage, costUSD?: number) => {
    if (!usage) return;
    const assistantId = assistantIdRef.current;
    setItems((prev) => {
      const targetId =
        assistantId ??
        [...prev]
          .reverse()
          .find((item) => item.type === "message" && item.role === "assistant")?.id;
      if (!targetId) return prev;
      let changed = false;
      const next = prev.map((item) => {
        if (item.type !== "message" || item.id !== targetId) return item;

        const sameUsage =
          item.usage?.inputTokens === usage.inputTokens &&
          item.usage?.outputTokens === usage.outputTokens &&
          item.usage?.totalTokens === usage.totalTokens &&
          item.usage?.reasoningTokens === usage.reasoningTokens &&
          item.usage?.cachedInputTokens === usage.cachedInputTokens;
        const nextCost = costUSD ?? item.usageCostUSD;
        const sameCost = item.usageCostUSD === nextCost;
        const nextModelId = item.modelId ?? getModelId?.();
        const sameModel = item.modelId === nextModelId;

        if (sameUsage && sameCost && sameModel) {
          return item;
        }

        changed = true;
        return {
          ...item,
          usage,
          modelId: nextModelId,
          usageCostUSD: nextCost,
        };
      });

      return changed ? next : prev;
    });
  };

  const upsertAgent = (agent: {
    id: string;
    agentId: string;
    name: string;
    status: "pending" | "done" | "error";
    parentToolCallId?: string;
    parentAgentId?: string;
    depth?: number;
  }) => {
    setItems((prev) => {
      const index = prev.findIndex(
        (item) => item.type === "agent" && item.id === agent.id
      );
      if (index === -1) {
        return [
          ...prev,
          {
            type: "agent",
            ...agent,
            content: "",
          },
        ];
      }
      const updated = [...prev];
      const existing = updated[index] as Extract<ChatItem, { type: "agent" }>;
      updated[index] = { ...existing, ...agent };
      return updated;
    });
  };

  const appendAgentStream = (payload: {
    agentId: string;
    parentToolCallId?: string;
    parentAgentId?: string;
    depth?: number;
    text: string;
    streamType?: "text" | "reasoning";
  }) => {
    if (!payload.text) return;
    const candidateIds = [
      payload.parentToolCallId ? `agent:${payload.parentToolCallId}` : null,
      `agent:${payload.agentId}`,
    ].filter((value): value is string => Boolean(value));

    setItems((prev) => {
      const updated = [...prev];
      let targetIndex = -1;
      for (const candidateId of candidateIds) {
        targetIndex = updated.findIndex(
          (item) => item.type === "agent" && item.id === candidateId
        );
        if (targetIndex !== -1) break;
      }
      if (targetIndex === -1) {
        updated.push({
          id: payload.parentToolCallId ? `agent:${payload.parentToolCallId}` : `agent:${payload.agentId}`,
          type: "agent",
          agentId: payload.agentId,
          name: payload.agentId,
          status: "pending",
          parentToolCallId: payload.parentToolCallId,
          parentAgentId: payload.parentAgentId,
          depth: payload.depth,
          content: payload.streamType === "reasoning" ? "" : payload.text,
          thinking: payload.streamType === "reasoning" ? payload.text : undefined,
        });
        return updated;
      }
      const agent = updated[targetIndex] as Extract<ChatItem, { type: "agent" }>;
      updated[targetIndex] = {
        ...agent,
        content:
          payload.streamType === "reasoning"
            ? agent.content
            : `${agent.content}${payload.text}`,
        thinking:
          payload.streamType === "reasoning"
            ? `${agent.thinking ?? ""}${payload.text}`
            : agent.thinking,
      };
      return updated;
    });
  };

  const upsertTool = (tool: {
    id: string;
    name: string;
    status: "pending" | "done" | "error";
    args?: unknown;
    result?: unknown;
    errorText?: string;
    costUSD?: number;
    agentId?: string;
    parentToolCallId?: string;
    parentAgentId?: string;
    depth?: number;
  }) => {
    setItems((prev) => {
      const index = prev.findIndex(
        (item) => item.type === "tool" && item.id === tool.id
      );
      if (index === -1) {
        return [
          ...prev,
          {
            type: "tool",
            ...tool,
            name: pickPreferredToolName(tool.name) ?? "未命名工具",
          },
        ];
      }
      const updated = [...prev];
      const existing = updated[index] as Extract<ChatItem, { type: "tool" }>;
      const nextStatus =
        existing.status === "done"
          ? "done"
          : existing.status === "error" && tool.status === "pending"
          ? existing.status
          : tool.status;
      updated[index] = {
        ...existing,
        ...tool,
        args: tool.args ?? existing.args,
        result: tool.result ?? existing.result,
        errorText: tool.errorText ?? existing.errorText,
        costUSD: tool.costUSD ?? existing.costUSD,
        name: pickPreferredToolName(tool.name, existing.name) ?? existing.name,
      };
      updated[index].status = nextStatus;
      return updated;
    });
  };

  const markToolDone = (toolCallId: string) => {
    clearToolTimer(toolCallId);
    toolTerminalState.set(toolCallId, { status: "done" });
  };

  const markToolPending = (toolCallId: string) => {
    clearToolTimer(toolCallId);
    toolTerminalState.set(toolCallId, { status: "pending" });
  };

  const cacheToolResult = (payload: {
    toolCallId: string;
    toolName?: string;
    result: unknown;
    costUSD?: number;
  }) => {
    rawResultCache.set(payload.toolCallId, {
      toolName: payload.toolName,
      result: payload.result,
      costUSD: payload.costUSD,
    });
  };

  const isPlanTool = (toolName?: string) => {
    const name = (toolName ?? "").toLowerCase();
    return name === "todowrite" || name === "todoread" || name.includes("plan");
  };

  const updatePlanFromResult = (toolName: string | undefined, result: unknown) => {
    if (!setPlan || !isPlanTool(toolName)) return false;
    if (!result || typeof result !== "object") return false;
    const record = result as { metadata?: { todos?: Array<{ id: string; title?: string; label?: string; status: string; description?: string }> } };
    const todos = record.metadata?.todos;
    if (!Array.isArray(todos) || todos.length === 0) return false;
    setPlan({
      title: `${todos.filter((todo) => todo.status !== "completed").length} todos`,
      todos: todos.map((todo, index) => ({
        id: todo.id ?? `${index}`,
        label: todo.title ?? todo.label ?? `Todo ${index + 1}`,
        status: (todo.status as "pending" | "in_progress" | "completed" | "cancelled") ?? "pending",
        description: todo.description,
      })),
    });
    return true;
  };

  const addToolStep = (payload: {
    toolCallId?: string;
    toolName?: string;
    step: string;
    status: "start" | "done" | "error";
    runState?: "started" | "running" | "completed" | "failed" | "timed_out";
    message?: string;
    stdout?: string;
    stderr?: string;
    durationMs?: number;
    previewUrl?: string;
    sessionId?: string;
  }) => {
    setItems((prev) => {
      const findById = payload.toolCallId
        ? prev.findIndex(
            (item) => item.type === "tool" && item.id === payload.toolCallId
          )
        : -1;
      const findByName =
        findById === -1 && payload.toolName
          ? [...prev]
              .reverse()
              .findIndex(
                (item) => item.type === "tool" && item.name === payload.toolName
              )
          : -1;
      const index =
        findById !== -1
          ? findById
          : findByName !== -1
            ? prev.length - 1 - findByName
            : -1;
      if (index === -1) {
        return prev;
      }
      const updated = [...prev];
      const item = updated[index] as Extract<ChatItem, { type: "tool" }>;
      const nextStep: ToolStep = {
        id: `${payload.step}-${Date.now()}`,
        step: payload.step,
        status: payload.status,
        message: payload.message,
        stdout: payload.stdout,
        stderr: payload.stderr,
        durationMs: payload.durationMs,
        previewUrl: payload.previewUrl,
        runState: payload.runState,
        sessionId: payload.sessionId,
        createdAt: Date.now(),
      };
      const existingSteps = [...(item.steps ?? [])];
      const shouldMerge =
        payload.step !== "log" &&
        existingSteps.length > 0;
      const mergeIndex = shouldMerge
        ? (() => {
            for (let i = existingSteps.length - 1; i >= 0; i -= 1) {
              const step = existingSteps[i];
              if (step.step === payload.step && step.status === "start") {
                return i;
              }
            }
            return -1;
          })()
        : -1;
      const shouldMarkDone =
        Boolean(payload.previewUrl) ||
        payload.step === "preview" ||
        payload.step === "done" ||
        payload.step === "complete" ||
        payload.runState === "completed";
      const shouldMarkError =
        payload.status === "error" ||
        payload.runState === "failed" ||
        payload.runState === "timed_out";
      updated[index] = {
        ...item,
        name: pickPreferredToolName(payload.toolName, item.name) ?? item.name,
        status: shouldMarkError ? "error" : shouldMarkDone ? "done" : item.status,
        steps:
          mergeIndex >= 0
            ? (() => {
                existingSteps[mergeIndex] = {
                  ...existingSteps[mergeIndex],
                  ...nextStep,
                  id: existingSteps[mergeIndex].id,
                  createdAt: existingSteps[mergeIndex].createdAt,
                };
                return existingSteps;
              })()
            : [...existingSteps, nextStep],
      };
      return updated;
    });

    if (payload.previewUrl) {
      setPreviewUrl(payload.previewUrl);
    }
  };

  const startPostToolAssistant = () => {
    markAssistantThinkingDone();
    const previousId = assistantIdRef.current;
    const nextId = createId();
    setItems((prev) => {
      let next = prev;
      if (previousId) {
        const idx = prev.findIndex(
          (item) => item.type === "message" && item.id === previousId
        );
        if (idx !== -1) {
          const target = prev[idx];
          const hasThinking = prev.some(
            (item) =>
              item.type === "thinking" &&
              item.messageId === previousId &&
              item.content.trim().length > 0
          );
          if (
            target.type === "message" &&
            target.role === "assistant" &&
            !target.content &&
            !hasThinking &&
            !(target.images?.length ?? 0)
          ) {
            next = [...prev];
            next.splice(idx, 1);
          }
        }
      }
      return [
        ...next,
        {
          id: nextId,
          type: "message",
          role: "assistant",
          content: "",
          images: [],
          modelId: getModelId?.(),
        },
      ];
    });
    assistantIdRef.current = nextId;
    setStreamingMessageId(nextId);
  };

  const handlePayload = (payload: StreamPayload | string) => {
    if (payload === "[DONE]") {
      finalizeToolStates();
      return;
    }

    const normalized = normalizePayload(payload);

    if (typeof normalized === "string") {
      if (postToolPendingRef.current) {
        postToolPendingRef.current = false;
        startPostToolAssistant();
      }
      appendAssistantText(normalized);
      return;
    }

    const isStructuredStreamEvent =
      typeof normalized === "object" &&
      normalized !== null &&
      normalized.type === "stream.event" &&
      typeof normalized.eventName === "string";

    if (normalized.error && !isStructuredStreamEvent) {
      markAssistantThinkingDone();
      const message =
        typeof normalized.error === "string"
          ? normalized.error
          : normalized.error instanceof Error
            ? normalized.error.message
            : JSON.stringify(normalized.error);
      if (message.trim()) {
        streamTerminalToolErrorText = message.trim();
      }
      setError(message);
      setStatus("error");
      return;
    }

    if (
      normalized.type === "stream.event" &&
      typeof normalized.eventName === "string"
    ) {
      const codexEvent = normalized as StreamEventPayload;
      if (codexEvent.eventName === "assistant.delta") {
        if (postToolPendingRef.current) {
          postToolPendingRef.current = false;
          startPostToolAssistant();
        }
        appendAssistantText(extractText(codexEvent));
        return;
      }
      if (codexEvent.eventName === "assistant.reasoning.delta") {
        if (postToolPendingRef.current) {
          postToolPendingRef.current = false;
          startPostToolAssistant();
        }
        appendAssistantThinking(extractText(codexEvent));
        return;
      }
      if (codexEvent.eventName === "agent.stream.delta") {
        if (!codexEvent.agentId) return;
        appendAgentStream({
          agentId: codexEvent.agentId,
          parentToolCallId: codexEvent.parentToolCallId,
          parentAgentId: codexEvent.parentAgentId,
          depth: codexEvent.depth,
          text: extractText(codexEvent),
          streamType: codexEvent.streamType,
        });
        return;
      }
      if (codexEvent.eventName === "tool.call.started") {
        if (!codexEvent.toolCallId) return;
        markToolPending(codexEvent.toolCallId);
        const toolName =
          pickPreferredToolName(
            codexEvent.toolName,
            normalized.name,
            findToolNameById(codexEvent.toolCallId)
          ) ?? "未命名工具";
        markAssistantThinkingDone();
        upsertTool({
          id: codexEvent.toolCallId,
          name: toolName,
          status: "pending",
          args: codexEvent.args,
          agentId: codexEvent.agentId,
          parentToolCallId: codexEvent.parentToolCallId,
          parentAgentId: codexEvent.parentAgentId,
          depth: codexEvent.depth,
        });
        postToolPendingRef.current = true;
        return;
      }
      if (codexEvent.eventName === "tool.call.progress") {
        addToolStep({
          toolCallId: codexEvent.toolCallId,
          toolName: codexEvent.toolName ?? normalized.name,
          step: codexEvent.step ?? "step",
          status:
            (codexEvent.status as ToolStep["status"]) ??
            mapRunStateToStepStatus(codexEvent.runState) ??
            "start",
          runState: codexEvent.runState,
          message: codexEvent.message,
          stdout: codexEvent.stdout,
          stderr: codexEvent.stderr,
          durationMs: codexEvent.durationMs,
          previewUrl: codexEvent.previewUrl,
          sessionId: codexEvent.sessionId,
        });
        return;
      }
      if (codexEvent.eventName === "tool.call.completed") {
        if (!codexEvent.toolCallId) return;
        markToolDone(codexEvent.toolCallId);
        cacheToolResult({
          toolCallId: codexEvent.toolCallId,
          toolName: codexEvent.toolName,
          result: codexEvent.result,
          costUSD: extractCostUSD(codexEvent),
        });
        const toolName =
          pickPreferredToolName(
            codexEvent.toolName,
            normalized.name,
            findToolNameById(codexEvent.toolCallId)
          ) ?? "未命名工具";
        if (updatePlanFromResult(toolName, codexEvent.result)) {
          postToolPendingRef.current = true;
          return;
        }
        const failureMessage = getToolFailureMessage(codexEvent.result);
        upsertTool({
          id: codexEvent.toolCallId,
          name: toolName,
          status: failureMessage ? "error" : "done",
          args: codexEvent.args,
          result: codexEvent.result,
          errorText: failureMessage,
          costUSD: extractCostUSD(codexEvent),
          agentId: codexEvent.agentId,
          parentToolCallId: codexEvent.parentToolCallId,
          parentAgentId: codexEvent.parentAgentId,
          depth: codexEvent.depth,
        });
        if (codexEvent.result && typeof codexEvent.result === "object") {
          const possibleUrl =
            (codexEvent.result as { previewUrl?: string }).previewUrl ??
            (codexEvent.result as { deploymentUrl?: string }).deploymentUrl ??
            (codexEvent.result as { url?: string }).url;
          if (possibleUrl) {
            setPreviewUrl(possibleUrl);
          }
        }
        postToolPendingRef.current = true;
        return;
      }
      if (codexEvent.eventName === "tool.call.failed") {
        const hasCallId =
          typeof codexEvent.toolCallId === "string" &&
          codexEvent.toolCallId.trim().length > 0;
        const failureText =
          typeof codexEvent.error === "string" && codexEvent.error.trim()
            ? codexEvent.error.trim()
            : undefined;
        if (!hasCallId) {
          if (failureText) {
            streamTerminalToolErrorText = failureText;
          }
          return;
        }
        const toolId = codexEvent.toolCallId as string;
        clearToolTimer(toolId);
        toolTerminalState.set(toolId, { status: "error" });
        upsertTool({
          id: toolId,
          name:
            pickPreferredToolName(
              codexEvent.toolName,
              normalized.name,
              findToolNameById(toolId)
            ) ?? "未命名工具",
          status: "error",
          errorText: failureText ?? "Tool failed",
          costUSD: extractCostUSD(codexEvent),
          agentId: codexEvent.agentId,
          parentToolCallId: codexEvent.parentToolCallId,
          parentAgentId: codexEvent.parentAgentId,
          depth: codexEvent.depth,
        });
        return;
      }
      if (codexEvent.eventName === "usage.updated") {
        attachAssistantUsage(codexEvent.usage, codexEvent.costUSD);
        return;
      }
      if (codexEvent.eventName === "context.updated") {
        if (
          codexEvent.contextWindow &&
          typeof codexEvent.contextWindow === "object" &&
          setContextWindow
        ) {
          setContextWindow(codexEvent.contextWindow as ThreadContextWindowState);
        }
        return;
      }
      if (codexEvent.eventName === "session.updated") {
        if (typeof codexEvent.previewUrl === "string" && codexEvent.previewUrl) {
          setPreviewUrl(codexEvent.previewUrl);
        }
        return;
      }
      if (codexEvent.eventName === "session.ended") {
        if (typeof codexEvent.reason === "string" && codexEvent.reason.trim()) {
          streamTerminalToolErrorText = codexEvent.reason.trim();
        }
        return;
      }
      if (
        codexEvent.eventName === "agent.handoff.started" ||
        codexEvent.eventName === "agent.handoff.completed"
      ) {
        if (!codexEvent.targetId) return;
        upsertAgent({
          id: codexEvent.parentToolCallId
            ? `agent:${codexEvent.parentToolCallId}`
            : `agent:${codexEvent.targetId}`,
          agentId: codexEvent.targetId,
          name: codexEvent.targetName ?? codexEvent.targetId,
          status:
            codexEvent.eventName === "agent.handoff.completed"
              ? "done"
              : "pending",
          parentToolCallId: codexEvent.parentToolCallId,
          parentAgentId: codexEvent.parentAgentId,
          depth: codexEvent.depth,
        });
        return;
      }
    }

    const images = extractImages(normalized);
    if (images.length) {
      appendAssistantImages(images);
    }

    const usage = extractUsage(normalized);
    const costUSD = extractCostUSD(normalized);
    if (usage || typeof costUSD === "number") {
      if (usage && !isEmptyUsage(usage, costUSD)) {
        attachAssistantUsage(usage, costUSD);
      } else if (typeof costUSD === "number") {
        // attach cost alone to the latest assistant message if usage was emitted separately
        const assistantId = assistantIdRef.current;
        setItems((prev) => {
          const targetId =
            assistantId ??
            [...prev]
              .reverse()
              .find((item) => item.type === "message" && item.role === "assistant")
              ?.id;
          if (!targetId) return prev;
          return prev.map((item) =>
            item.type === "message" && item.id === targetId
              ? { ...item, usageCostUSD: costUSD }
              : item
          );
        });
      }
    }

    if (isReasoning(normalized)) {
      if (postToolPendingRef.current) {
        postToolPendingRef.current = false;
        startPostToolAssistant();
      }
      const text = extractText(normalized);
      appendAssistantThinking(text);
      return;
    }

    if (isToolResult(normalized)) {
      const toolId =
        normalized.toolResult?.id ??
        normalized.toolCallId ??
        normalized.toolCall?.id;
      if (!toolId) return;
      const toolName =
        pickPreferredToolName(
          normalized.toolResult?.name,
          normalized.toolCall?.name,
          normalized.toolName,
          normalized.name
        ) ?? "未命名工具";
      const result = normalized.toolResult?.result ?? normalized.result;
      cacheToolResult({
        toolCallId: toolId,
        toolName,
        result,
        costUSD,
      });
      markToolDone(toolId);
      if (updatePlanFromResult(toolName, result)) {
        postToolPendingRef.current = true;
        return;
      }
      upsertTool({
        id: toolId,
        name: toolName,
        status: "done",
        result,
        costUSD,
      });
      if (result && typeof result === "object") {
        const possibleUrl =
          (result as { previewUrl?: string }).previewUrl ??
          (result as { deploymentUrl?: string }).deploymentUrl ??
          (result as { url?: string }).url;
        if (possibleUrl) {
          setPreviewUrl(possibleUrl);
        }
      }
      postToolPendingRef.current = true;
      return;
    }

    if (isToolStep(normalized)) {
      const appendLog = (level: PreviewLog["level"], message: string) => {
        if (!message || !appendPreviewLog) return;
        appendPreviewLog({
          level,
          message,
          timestamp: new Date(),
        });
      };
      addToolStep({
        toolCallId: normalized.toolCallId,
        toolName: normalized.toolName ?? normalized.name,
        step: normalized.step ?? "step",
        status:
          (normalized.status as ToolStep["status"]) ??
          mapRunStateToStepStatus(normalized.runState) ??
          "start",
        runState: normalized.runState,
        message: normalized.message,
        stdout: normalized.stdout,
        stderr: normalized.stderr,
        durationMs: normalized.durationMs,
        previewUrl: normalized.previewUrl,
        sessionId: normalized.sessionId,
      });
      if (normalized.step === "log" && normalized.message) {
        appendLog("log", normalized.message);
      }
      if (normalized.stdout) {
        appendLog("log", normalized.stdout);
      }
      if (normalized.stderr) {
        appendLog("error", normalized.stderr);
      }
      return;
    }

    if (isToolCall(normalized)) {
      const toolId =
        normalized.toolCall?.id ?? normalized.toolCallId ?? createId();
      const toolName =
        pickPreferredToolName(
          normalized.toolCall?.name,
          normalized.toolName,
          normalized.name
        ) ?? "未命名工具";
      markAssistantThinkingDone();
      if (isPlanTool(toolName)) {
        postToolPendingRef.current = true;
        return;
      }
      upsertTool({
        id: toolId,
        name: toolName,
        status: "pending",
        args: normalized.toolCall?.args ?? normalized.args,
      });
      postToolPendingRef.current = true;
      return;
    }

    if (normalized.output && typeof normalized.output === "object") {
      const outputText = (normalized.output as { text?: string }).text;
      const assistantId = assistantIdRef.current;
      const current = itemsRef.current.find(
        (item) => item.type === "message" && item.id === assistantId
      ) as Extract<ChatItem, { type: "message" }> | undefined;
      if (outputText && current && !current.content) {
        appendAssistantText(outputText);
        return;
      }
    }

    const text = extractText(normalized);
    if (text && postToolPendingRef.current) {
      postToolPendingRef.current = false;
      startPostToolAssistant();
    }
    appendAssistantText(text);
  };

  return {
    handlePayload,
    finalize: (options?: { errorText?: string }) => {
      finalizeToolStates(options?.errorText);
    },
  };
};
