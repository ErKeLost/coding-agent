import { NextResponse } from "next/server";
import type { LanguageModelUsage } from "ai";
import { RequestContext } from "@mastra/core/request-context";
import { redactStreamChunk } from "@mastra/server/server-adapter";
import { mastra } from "@/mastra";
import { getModelTuning } from "@/lib/model-tuning";
import { extractCurrentInputText } from "@/lib/continuation";
import { getContextPressureStatus } from "@/lib/context-window";
import {
  upsertThreadSession,
} from "@/lib/server/thread-session-store";
import {
  buildAgentRequestContext,
} from "@/lib/server/agent-request-context";
import { consumeThreadSteers } from "@/lib/server/steer-queue";
import { renderTurnModeFeedback, resolveTurnModeState } from "@/lib/server/turn-mode";
import {
  currentTurnIncludesImageInput,
  normalizeAgentMessageInput,
} from "@/lib/server/agent-input";
import { prepareThreadContextWindow } from "@/lib/server/context-compaction";
import { buildAgentInstructions } from "@/mastra/agents/build-agent";
import { MULTI_AGENT_TEST_ID } from "@/mastra/agents/multi-agent-test";

export const runtime = "nodejs";
const BUILD_AGENT_ID = "build-agent";
const SUPPORTED_AGENT_IDS = new Set([BUILD_AGENT_ID, MULTI_AGENT_TEST_ID]);

type StreamEvent =
  | {
      type: "stream.event";
      eventName: "assistant.delta" | "assistant.reasoning.delta";
      text: string;
    }
  | {
      type: "stream.event";
      eventName: "tool.call.started";
      toolCallId: string;
      toolName: string;
      args?: unknown;
      agentId?: string;
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
    }
  | {
      type: "stream.event";
      eventName: "tool.call.progress";
      toolCallId?: string;
      toolName?: string;
      step?: string;
      status?: string;
      message?: string;
      stdout?: string;
      stderr?: string;
      durationMs?: number;
      runState?: string;
      previewUrl?: string;
      sessionId?: string;
      agentId?: string;
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
    }
  | {
      type: "stream.event";
      eventName: "tool.call.completed";
      toolCallId: string;
      toolName?: string;
      args?: unknown;
      result?: unknown;
      agentId?: string;
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
    }
  | {
      type: "stream.event";
      eventName: "tool.call.failed";
      toolCallId?: string;
      toolName?: string;
      error: string;
      agentId?: string;
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
    }
  | {
      type: "stream.event";
      eventName: "usage.updated";
      usage: LanguageModelUsage;
      modelId?: string;
      costUSD?: number;
    }
  | {
      type: "stream.event";
      eventName: "context.updated";
      contextWindow: unknown;
    }
  | {
      type: "stream.event";
      eventName: "session.updated";
      previewUrl?: string;
    }
  | {
      type: "stream.event";
      eventName: "session.ended";
      status: "done" | "idle" | "error";
      reason?: string;
    }
  | {
      type: "stream.event";
      eventName: "agent.stream.delta";
      agentId: string;
      text: string;
      streamType?: "text" | "reasoning";
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
    }
  | {
      type: "stream.event";
      eventName: "agent.handoff.started" | "agent.handoff.completed";
      agentId?: string;
      parentToolCallId?: string;
      parentAgentId?: string;
      depth?: number;
      sourceAgentId?: string;
      sourceAgentName?: string;
      targetType: "agent" | "workflow" | "tool";
      targetId: string;
      targetName?: string;
      iteration?: number;
      selectionReason?: string;
    }
  | {
      type: "stream.event";
      eventName: "guide.applied";
      text: string;
    };

type AgentStreamRequest = {
  message?: string;
  messages?: unknown;
  threadId?: string;
  model?: string;
  memory?: unknown;
  requestContext?: Record<string, unknown>;
};

type SystemLikeMessage = {
  role?: unknown;
  content?: unknown;
};

const isQwenModel = (modelId?: string) => {
  const normalized = modelId?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes("qwen");
};

const normalizeSystemMessageContent = (value: unknown) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const text = value
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }

      const typedPart = part as { type?: unknown; text?: unknown };
      if (typedPart.type === "text" && typeof typedPart.text === "string") {
        return typedPart.text;
      }

      return "";
    })
    .join("\n")
    .trim();

  return text || null;
};

const normalizeQwenPrompt = <TMessage extends SystemLikeMessage>(args: {
  messages: TMessage[];
  systemMessages: TMessage[];
}) => {
  const extractedSystemContents: string[] = [];
  const nonSystemMessages: TMessage[] = [];

  for (const message of args.messages) {
    if (message?.role === "system") {
      const normalizedContent = normalizeSystemMessageContent(message.content);
      if (normalizedContent) {
        extractedSystemContents.push(normalizedContent);
      }
      continue;
    }

    nonSystemMessages.push(message);
  }

  const allSystemContents = [
    ...args.systemMessages
      .map((message) => normalizeSystemMessageContent(message?.content))
      .filter((value): value is string => Boolean(value)),
    ...extractedSystemContents,
  ];

  if (allSystemContents.length === 0) {
    return {
      messages: nonSystemMessages,
      systemMessages: [] as TMessage[],
    };
  }

  return {
    messages: nonSystemMessages,
    systemMessages: [
      {
        role: "system",
        content: allSystemContents.join("\n\n"),
      } as TMessage,
    ],
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const summarizeIncomingMessageInput = (input: unknown) => {
  if (!Array.isArray(input)) {
    return {
      mode: typeof input === 'string' ? 'string' : 'unknown',
      messageCount: 0,
      imageParts: 0,
      fileParts: 0,
      textParts: 0,
    };
  }

  let imageParts = 0;
  let fileParts = 0;
  let textParts = 0;

  for (const message of input) {
    if (!message || typeof message !== 'object') {
      continue;
    }

    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string') {
      textParts += 1;
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== 'object') {
        continue;
      }

      const type = (part as { type?: unknown }).type;
      if (type === 'image') imageParts += 1;
      else if (type === 'file') fileParts += 1;
      else if (type === 'text') textParts += 1;
    }
  }

  return {
    mode: 'messages',
    messageCount: input.length,
    imageParts,
    fileParts,
    textParts,
  };
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  let payload: AgentStreamRequest;

  try {
    payload = (await req.json()) as AgentStreamRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messageInput = payload.messages
    ? normalizeAgentMessageInput(payload.messages)
    : payload.message;
  if (!messageInput) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  const { requestContext, effectiveWorkspaceRoot, threadSession } =
    await buildAgentRequestContext(payload);
  console.info("[workspace-debug] stream-route", {
    threadId: payload.threadId ?? null,
    requestWorkspaceRoot:
      typeof payload.requestContext?.workspaceRoot === "string"
        ? payload.requestContext.workspaceRoot
        : null,
    effectiveWorkspaceRoot,
  });
  console.info('[mastra-debug] incoming-message-input', summarizeIncomingMessageInput(messageInput));
  const tuning = getModelTuning(payload.model);

  const { agentId } = await params;
  if (!SUPPORTED_AGENT_IDS.has(agentId)) {
    return NextResponse.json({ error: `Agent not found: ${agentId}` }, { status: 404 });
  }
  const agent = mastra.getAgentById(agentId);
  if (!agent) {
    return NextResponse.json({ error: `Agent not found: ${agentId}` }, { status: 404 });
  }
  const contextCompactionAgent = mastra.getAgentById("context-compaction-agent");
  if (!contextCompactionAgent) {
    return NextResponse.json({ error: "Context compaction agent not found" }, { status: 500 });
  }
  const currentInputText = extractCurrentInputText(messageInput);
  const systemPromptText =
    agentId === BUILD_AGENT_ID ? buildAgentInstructions({ requestContext }) : undefined;
  const preparedContext = await prepareThreadContextWindow({
    agent: contextCompactionAgent,
    requestContext,
    threadSession,
    incomingText: currentInputText,
    systemPromptText,
  });
  if (preparedContext.compaction?.renderedSummary) {
    requestContext.set("compactionSummary", preparedContext.compaction.renderedSummary);
  }
  const logger = mastra.getLogger();
  type AgentStreamInput = Parameters<typeof agent.stream>[0];
  type ActiveAgentContext = {
    agentId: string;
    agentName: string;
    parentToolCallId: string;
    parentAgentId?: string;
    depth: number;
  };
  const activeAgentStack: ActiveAgentContext[] = [];
  const getActiveAgentContext = () => activeAgentStack[activeAgentStack.length - 1];

  const enqueueJson = (controller: ReadableStreamDefaultController<Uint8Array>, value: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
  };

  const extractSessionUpdate = (value: unknown): StreamEvent | null => {
    if (!value || typeof value !== "object") return null;
    const source = value as {
      result?: { previewUrl?: unknown; deploymentUrl?: unknown; url?: unknown };
      toolResult?: { result?: { previewUrl?: unknown; deploymentUrl?: unknown; url?: unknown } };
      previewUrl?: unknown;
      deploymentUrl?: unknown;
      url?: unknown;
    };
    const result = source.toolResult?.result ?? source.result ?? source;
    const previewUrl =
      typeof result.previewUrl === "string"
        ? result.previewUrl
        : typeof result.deploymentUrl === "string"
          ? result.deploymentUrl
          : typeof result.url === "string"
            ? result.url
            : undefined;
    if (!previewUrl) return null;
    return {
      type: "stream.event",
      eventName: "session.updated",
      previewUrl,
    };
  };

  const mapChunkToStreamEvents = (value: unknown): StreamEvent[] => {
    if (!value || typeof value !== "object") return [];
    const rawRecord = value as {
      type?: string;
      payload?: Record<string, unknown>;
      error?: unknown;
      toolCallId?: string;
      toolCall?: { id?: string; name?: string; args?: unknown };
      toolResult?: { id?: string; name?: string; result?: unknown };
      toolName?: string;
      name?: string;
      args?: unknown;
      result?: unknown;
      status?: string;
      step?: string;
      message?: string;
      stdout?: string;
      stderr?: string;
      durationMs?: number;
      runState?: string;
      previewUrl?: string;
      sessionId?: string;
      text?: string;
      textDelta?: string;
    };
    const record = {
      ...rawRecord,
      ...(rawRecord.payload && typeof rawRecord.payload === "object" ? rawRecord.payload : {}),
    };
    const events: StreamEvent[] = [];
    let emittedStructuredToolResult = false;
    const chunkType = record.type?.toLowerCase();
    const isStructuredToolFailure = (resultValue: unknown) => {
      if (!resultValue || typeof resultValue !== "object") return false;
      const typed = resultValue as {
        success?: unknown;
        state?: unknown;
        metadata?: { state?: unknown; timedOut?: unknown };
      };
      if (typed.success === false) return true;
      const state =
        typeof typed.state === "string"
          ? typed.state.toLowerCase()
          : typeof typed.metadata?.state === "string"
            ? typed.metadata.state.toLowerCase()
            : "";
      if (state === "failed" || state === "timed_out") return true;
      if (typed.metadata?.timedOut === true) return true;
      return false;
    };
    const extractStructuredToolError = (resultValue: unknown) => {
      if (!resultValue || typeof resultValue !== "object") return undefined;
      const typed = resultValue as {
        error?: unknown;
        message?: unknown;
        stderr?: unknown;
        output?: unknown;
        metadata?: {
          stderr?: unknown;
          stdout?: unknown;
          message?: unknown;
        };
      };
      const direct =
        (typeof typed.error === "string" && typed.error.trim()) ||
        (typeof typed.message === "string" && typed.message.trim()) ||
        (typeof typed.stderr === "string" && typed.stderr.trim()) ||
        (typeof typed.output === "string" && typed.output.trim()) ||
        (typeof typed.metadata?.stderr === "string" && typed.metadata.stderr.trim()) ||
        (typeof typed.metadata?.message === "string" && typed.metadata.message.trim()) ||
        (typeof typed.metadata?.stdout === "string" && typed.metadata.stdout.trim()) ||
        undefined;
      return direct?.trim();
    };

    const emitStructuredToolEvents = ({
      phase,
      toolCallId,
      toolName,
      args,
      result,
      error,
      status,
      step,
      message,
      stdout,
      stderr,
      durationMs,
      runState,
      previewUrl,
      sessionId,
    }: {
      phase: "start" | "progress" | "completed" | "failed";
      toolCallId?: string;
      toolName?: string;
      args?: unknown;
      result?: unknown;
      error?: string;
      status?: string;
      step?: string;
      message?: string;
      stdout?: string;
      stderr?: string;
      durationMs?: number;
      runState?: string;
      previewUrl?: string;
      sessionId?: string;
    }) => {
      if (!toolCallId) return;
      const isAgentWrapperTool =
        typeof toolName === "string" && toolName.startsWith("agent-");

      if (phase === "start") {
        if (isAgentWrapperTool) {
          const parentAgent = getActiveAgentContext();
          const delegatedAgentId = toolName.slice("agent-".length);
          const delegatedAgentName = delegatedAgentId
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (value) => value.toUpperCase())
            .trim();
          const context: ActiveAgentContext = {
            agentId: delegatedAgentId,
            agentName: delegatedAgentName,
            parentToolCallId: toolCallId,
            parentAgentId: parentAgent?.agentId,
            depth: (parentAgent?.depth ?? 0) + 1,
          };
          activeAgentStack.push(context);
          events.push({
            type: "stream.event",
            eventName: "agent.handoff.started",
            agentId: context.agentId,
            parentToolCallId: context.parentToolCallId,
            parentAgentId: context.parentAgentId,
            depth: context.depth,
            sourceAgentId: parentAgent?.agentId ?? agentId,
            sourceAgentName: parentAgent?.agentName ?? agent.name,
            targetType: "agent",
            targetId: context.agentId,
            targetName: context.agentName,
          });
          return;
        }

        const activeAgent = getActiveAgentContext();
        events.push({
          type: "stream.event",
          eventName: "tool.call.started",
          toolCallId,
          toolName,
          args,
          agentId: activeAgent?.agentId,
          parentToolCallId: activeAgent?.parentToolCallId,
          parentAgentId: activeAgent?.parentAgentId,
          depth: activeAgent?.depth,
        });
        return;
      }

      if (phase === "progress") {
        const activeAgent = getActiveAgentContext();
        events.push({
          type: "stream.event",
          eventName: "tool.call.progress",
          toolCallId,
          toolName,
          step,
          status,
          message,
          stdout,
          stderr,
          durationMs,
          runState,
          previewUrl,
          sessionId,
          agentId: activeAgent?.agentId,
          parentToolCallId: activeAgent?.parentToolCallId,
          parentAgentId: activeAgent?.parentAgentId,
          depth: activeAgent?.depth,
        });
        return;
      }

      if (phase === "completed") {
        if (isAgentWrapperTool) {
          const stackIndex = [...activeAgentStack]
            .map((entry) => entry.parentToolCallId)
            .lastIndexOf(toolCallId);
          const context =
            stackIndex >= 0 ? activeAgentStack.splice(stackIndex, 1)[0] : undefined;
          if (context) {
            events.push({
              type: "stream.event",
              eventName: "agent.handoff.completed",
              agentId: context.agentId,
              parentToolCallId: context.parentToolCallId,
              parentAgentId: context.parentAgentId,
              depth: context.depth,
              sourceAgentId: context.parentAgentId ?? agentId,
              sourceAgentName: context.parentAgentId ? context.parentAgentId : agent.name,
              targetType: "agent",
              targetId: context.agentId,
              targetName: context.agentName,
            });
          }
          return;
        }

        const activeAgent = getActiveAgentContext();
        events.push({
          type: "stream.event",
          eventName: "tool.call.completed",
          toolCallId,
          toolName,
          args,
          result,
          agentId: activeAgent?.agentId,
          parentToolCallId: activeAgent?.parentToolCallId,
          parentAgentId: activeAgent?.parentAgentId,
          depth: activeAgent?.depth,
        });
        return;
      }

      const activeAgent = getActiveAgentContext();
      events.push({
        type: "stream.event",
        eventName: "tool.call.failed",
        toolCallId,
        toolName,
        error: error ?? "Tool failed",
        agentId: activeAgent?.agentId,
        parentToolCallId: activeAgent?.parentToolCallId,
        parentAgentId: activeAgent?.parentAgentId,
        depth: activeAgent?.depth,
      });
    };

    if (
      chunkType?.startsWith("agent-execution-event-") ||
      chunkType?.startsWith("workflow-execution-event-")
    ) {
      return mapChunkToStreamEvents(record.payload);
    }

    const nestedSteps = Array.isArray((record as { steps?: unknown }).steps)
      ? ((record as { steps: unknown[] }).steps ?? [])
      : [];
    if (nestedSteps.length > 0) {
      for (const step of nestedSteps) {
        events.push(...mapChunkToStreamEvents(step));
      }
    }

    if (chunkType === "routing-agent-text-delta") {
      const text =
        typeof record.payload?.text === "string"
          ? record.payload.text
          : typeof record.text === "string"
            ? record.text
            : typeof record.textDelta === "string"
              ? record.textDelta
              : "";
      if (text) {
        const activeAgent = getActiveAgentContext();
        if (activeAgent) {
          events.push({
            type: "stream.event",
            eventName: "agent.stream.delta",
            agentId: activeAgent.agentId,
            text,
            streamType: "reasoning",
            parentToolCallId: activeAgent.parentToolCallId,
            parentAgentId: activeAgent.parentAgentId,
            depth: activeAgent.depth,
          });
        } else {
          events.push({
            type: "stream.event",
            eventName: "assistant.reasoning.delta",
            text,
          });
        }
      }
      return events;
    }

    if (chunkType === "text-delta" || chunkType === "reasoning-text-delta") {
      const text =
        typeof record.text === "string"
          ? record.text
          : typeof record.textDelta === "string"
            ? record.textDelta
            : "";
      if (text) {
        const activeAgent = getActiveAgentContext();
        if (activeAgent) {
          events.push({
            type: "stream.event",
            eventName: "agent.stream.delta",
            agentId: activeAgent.agentId,
            text,
            streamType:
              chunkType === "reasoning-text-delta" ? "reasoning" : "text",
            parentToolCallId: activeAgent.parentToolCallId,
            parentAgentId: activeAgent.parentAgentId,
            depth: activeAgent.depth,
          });
        } else {
          events.push({
            type: "stream.event",
            eventName:
              chunkType === "reasoning-text-delta"
                ? "assistant.reasoning.delta"
                : "assistant.delta",
            text,
          });
        }
      }
      return events;
    }

    if (chunkType === "routing-agent-end") {
      const payload = record.payload as {
        primitiveId?: unknown;
        primitiveType?: unknown;
        selectionReason?: unknown;
        iteration?: unknown;
      };
      const primitiveType =
        payload?.primitiveType === "agent" ||
        payload?.primitiveType === "workflow" ||
        payload?.primitiveType === "tool"
          ? payload.primitiveType
          : undefined;
      const primitiveId =
        typeof payload?.primitiveId === "string" && payload.primitiveId.trim()
          ? payload.primitiveId.trim()
          : undefined;
      if (primitiveType && primitiveId) {
        events.push({
          type: "stream.event",
          eventName: "agent.handoff.started",
          sourceAgentId: agentId,
          sourceAgentName: agent.name,
          targetType: primitiveType,
          targetId: primitiveId,
          targetName: primitiveId,
          iteration:
            typeof payload.iteration === "number" ? payload.iteration : undefined,
          selectionReason:
            typeof payload.selectionReason === "string"
              ? payload.selectionReason
              : undefined,
        });
      }
      return events;
    }

    if (chunkType === "agent-execution-start") {
      const payload = record.payload as { agentId?: unknown };
      const delegatedAgentId =
        typeof payload?.agentId === "string" && payload.agentId.trim()
          ? payload.agentId.trim()
          : undefined;
      if (delegatedAgentId) {
        events.push({
          type: "stream.event",
          eventName: "agent.handoff.started",
          sourceAgentId: agentId,
          sourceAgentName: agent.name,
          targetType: "agent",
          targetId: delegatedAgentId,
          targetName: delegatedAgentId,
        });
      }
      return events;
    }

    if (chunkType === "agent-execution-end") {
      const payload = record.payload as { agentId?: unknown };
      const delegatedAgentId =
        typeof payload?.agentId === "string" && payload.agentId.trim()
          ? payload.agentId.trim()
          : undefined;
      if (delegatedAgentId) {
        events.push({
          type: "stream.event",
          eventName: "agent.handoff.completed",
          sourceAgentId: agentId,
          sourceAgentName: agent.name,
          targetType: "agent",
          targetId: delegatedAgentId,
          targetName: delegatedAgentId,
        });
      }
      return events;
    }

    if (chunkType === "workflow-execution-start" || chunkType === "workflow-execution-end") {
      const payload = record.payload as { workflowId?: unknown; name?: unknown };
      const workflowId =
        typeof payload?.workflowId === "string" && payload.workflowId.trim()
          ? payload.workflowId.trim()
          : typeof payload?.name === "string" && payload.name.trim()
            ? payload.name.trim()
            : undefined;
      if (workflowId) {
        events.push({
          type: "stream.event",
          eventName:
            chunkType === "workflow-execution-start"
              ? "agent.handoff.started"
              : "agent.handoff.completed",
          sourceAgentId: agentId,
          sourceAgentName: agent.name,
          targetType: "workflow",
          targetId: workflowId,
          targetName: typeof payload?.name === "string" ? payload.name : workflowId,
        });
      }
      return events;
    }

    const toolCallsArray = Array.isArray((record as { toolCalls?: unknown }).toolCalls)
      ? ((record as { toolCalls: Array<Record<string, unknown>> }).toolCalls ?? [])
      : [];
    for (const toolCall of toolCallsArray) {
      emitStructuredToolEvents({
        phase: "start",
        toolCallId:
          typeof toolCall.payload?.toolCallId === "string"
            ? toolCall.payload.toolCallId
            : typeof toolCall.toolCallId === "string"
              ? toolCall.toolCallId
              : undefined,
        toolName:
          typeof toolCall.payload?.toolName === "string"
            ? toolCall.payload.toolName
            : typeof toolCall.toolName === "string"
              ? toolCall.toolName
              : undefined,
        args: toolCall.payload?.args ?? toolCall.args,
      });
    }

    const toolResultsArray = Array.isArray((record as { toolResults?: unknown }).toolResults)
      ? ((record as { toolResults: Array<Record<string, unknown>> }).toolResults ?? [])
      : [];
    for (const toolResult of toolResultsArray) {
      const resultPayload =
        toolResult.payload && typeof toolResult.payload === "object"
          ? toolResult.payload
          : toolResult;
      const resultValue =
        resultPayload && typeof resultPayload === "object" && "result" in resultPayload
          ? (resultPayload as { result?: unknown }).result
          : undefined;
      const isFailedResult = isStructuredToolFailure(resultValue);
      emitStructuredToolEvents({
        phase: isFailedResult ? "failed" : "completed",
        toolCallId:
          typeof resultPayload.toolCallId === "string" ? resultPayload.toolCallId : undefined,
        toolName:
          typeof resultPayload.toolName === "string" ? resultPayload.toolName : undefined,
        args:
          resultPayload && typeof resultPayload === "object" && "args" in resultPayload
            ? (resultPayload as { args?: unknown }).args
            : undefined,
        result: resultValue,
        error:
          isFailedResult
            ? extractStructuredToolError(resultValue) ?? "Tool failed"
            : undefined,
      });
      if (typeof resultPayload.toolName === "string" && resultPayload.toolName === "apply_patch") {
        console.info("[apply-patch-debug] stream:toolResultsArray", {
          toolCallId:
            typeof resultPayload.toolCallId === "string"
              ? resultPayload.toolCallId
              : undefined,
          isFailedResult,
          hasArgs:
            resultPayload && typeof resultPayload === "object" && "args" in resultPayload,
          hasResult:
            resultPayload && typeof resultPayload === "object" && "result" in resultPayload,
        });
      }
      emittedStructuredToolResult = true;
    }

    if (
      !emittedStructuredToolResult &&
      typeof record.error === "string" &&
      record.error.trim()
    ) {
      const activeAgent = getActiveAgentContext();
      events.push({
        type: "stream.event",
        eventName: "tool.call.failed",
        toolCallId: record.toolCallId,
        toolName: record.toolName ?? record.name ?? record.toolCall?.name,
        error: record.error,
        agentId: activeAgent?.agentId,
        parentToolCallId: activeAgent?.parentToolCallId,
        parentAgentId: activeAgent?.parentAgentId,
        depth: activeAgent?.depth,
      });
    }

    const toolCallId = record.toolCall?.id ?? record.toolCallId;
    const toolName = record.toolCall?.name ?? record.toolName ?? record.name;
    const isToolCall =
      chunkType?.startsWith("tool-call") ||
      chunkType?.startsWith("tool-call-input") ||
      chunkType?.startsWith("tool-call-delta") ||
      Boolean(record.toolCall);
    if (isToolCall && toolCallId && toolName) {
      emitStructuredToolEvents({
        phase: "start",
        toolCallId,
        toolName,
        args: record.toolCall?.args ?? record.args,
      });
    }

    const isToolProgress = chunkType === "data-tool-progress" || chunkType === "tool-step";
    if (isToolProgress) {
      emitStructuredToolEvents({
        phase: "progress",
        toolCallId,
        toolName,
        step: record.step,
        status: record.status,
        message: record.message,
        stdout: record.stdout,
        stderr: record.stderr,
        durationMs: record.durationMs,
        runState: record.runState,
        previewUrl: record.previewUrl,
        sessionId: record.sessionId,
      });
    }

    const isToolResult = chunkType?.includes("tool-result") || Boolean(record.toolResult);
    if (isToolResult && toolCallId && toolName) {
      const resultValue = record.toolResult?.result ?? record.result;
      const isFailedResult = isStructuredToolFailure(resultValue);
      if (toolName === "apply_patch") {
        console.info("[apply-patch-debug] stream:isToolResult", {
          toolCallId,
          chunkType,
          isFailedResult,
          hasToolResult: Boolean(record.toolResult),
          hasResult: typeof record.result !== "undefined",
        });
      }
      emitStructuredToolEvents({
        phase: isFailedResult ? "failed" : "completed",
        toolCallId,
        toolName,
        args: record.toolCall?.args ?? record.args,
        result: resultValue,
        error:
          isFailedResult
            ? extractStructuredToolError(resultValue)
            : undefined,
      });
      emittedStructuredToolResult = true;
    }

    const sessionUpdate = extractSessionUpdate(record);
    if (sessionUpdate) {
      events.push(sessionUpdate);
    }

    return events;
  };

  const encoder = new TextEncoder();
  const emittedToolStarts = new Set<string>();
  const emittedToolCompletions = new Set<string>();
  const startedToolMeta = new Map<string, { toolName?: string; args?: unknown }>();
  let lastSessionStateKey: string | undefined;
  let lastUsageKey: string | undefined;
  let lastContextWindowKey: string | undefined;
  let latestPreviewUrl: string | undefined;
  let latestContextWindow = preparedContext.contextWindow;
  let streamOutcome: "idle" | "streaming" | "done" | "error" = "idle";
  let streamTerminalErrorText: string | undefined;
  let activeAgentLabel: string | undefined = agent.name;
  const pendingAppliedSteers: string[] = [];
  const defaultMemory =
    payload.threadId &&
    !currentTurnIncludesImageInput(
      typeof messageInput === "string" ? null : messageInput,
    )
      ? {
          thread: { id: payload.threadId },
          resource: "web",
        }
      : undefined;
  const memory =
    isRecord(payload.memory)
      ? {
          ...payload.memory,
          options: {
            ...(isRecord(payload.memory.options) ? payload.memory.options : {}),
            ...preparedContext.memoryOptions,
          },
        }
      : defaultMemory
        ? {
            ...defaultMemory,
            options: preparedContext.memoryOptions,
          }
        : undefined;
  const shouldNormalizeQwenPrompt = isQwenModel(payload.model);

  const startAgentStream = async (requestContextForAttempt: RequestContext) => {
    const streamResult = await agent.stream(messageInput as AgentStreamInput, {
      requestContext: requestContextForAttempt,
      modelSettings: tuning.modelSettings,
      providerOptions: tuning.providerOptions,
      memory,
      abortSignal: req.signal,
      prepareStep: shouldNormalizeQwenPrompt
        ? ({ messages, systemMessages }) => normalizeQwenPrompt({ messages, systemMessages })
        : undefined,
      onIterationComplete: () => {
        if (!payload.threadId) return;
        const pendingSteers = consumeThreadSteers(payload.threadId);
        if (!pendingSteers.length) return;

        const steerText = pendingSteers.map((entry) => entry.text).join("\n\n");
        pendingAppliedSteers.push(...pendingSteers.map((entry) => entry.text));
        const steerRequestContext = cloneRequestContext(requestContext);
        steerRequestContext.set("turnMode", "steer_active_turn");

        return {
          feedback: renderTurnModeFeedback(
            resolveTurnModeState(steerRequestContext),
            `User steer for the current task:\n${steerText}`,
          ),
        };
      },
    });
    return streamResult.fullStream.getReader();
  };

  const extractUsage = (value: unknown): LanguageModelUsage | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const obj = value as {
      usage?: LanguageModelUsage;
      stepResult?: { usage?: LanguageModelUsage };
      payload?: {
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
      };
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
      response?: {
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
    };

    const openrouterUsage =
      obj.providerMetadata?.openrouter?.usage ??
      obj.response?.providerMetadata?.openrouter?.usage ??
      obj.payload?.metadata?.providerMetadata?.openrouter?.usage;
    if (openrouterUsage) {
      return {
        inputTokens: openrouterUsage.promptTokens ?? 0,
        outputTokens: openrouterUsage.completionTokens ?? 0,
        totalTokens:
          openrouterUsage.totalTokens ??
          (openrouterUsage.promptTokens ?? 0) +
          (openrouterUsage.completionTokens ?? 0),
        reasoningTokens: openrouterUsage.completionTokensDetails?.reasoningTokens,
        cachedInputTokens: openrouterUsage.promptTokensDetails?.cachedTokens,
      };
    }

    return (
      obj.usage ??
      obj.stepResult?.usage ??
      obj.payload?.usage ??
      obj.payload?.stepResult?.usage
    );
  };

  const extractCostUSD = (value: unknown): number | undefined => {
    if (!value || typeof value !== "object") return undefined;
    const obj = value as {
      providerMetadata?: {
        openrouter?: { usage?: { cost?: number } };
      };
      response?: {
        providerMetadata?: {
          openrouter?: { usage?: { cost?: number } };
        };
      };
      payload?: {
        metadata?: {
          providerMetadata?: {
            openrouter?: { usage?: { cost?: number } };
          };
        };
      };
    };
    return (
      obj.providerMetadata?.openrouter?.usage?.cost ??
      obj.response?.providerMetadata?.openrouter?.usage?.cost ??
      obj.payload?.metadata?.providerMetadata?.openrouter?.usage?.cost
    );
  };

  const applyStreamEvent = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: StreamEvent
  ) => {
    if (event.eventName === "tool.call.started") {
      if (emittedToolStarts.has(event.toolCallId)) return false;
      emittedToolStarts.add(event.toolCallId);
      startedToolMeta.set(event.toolCallId, {
        toolName: event.toolName,
        args: event.args,
      });
    }
    if (event.eventName === "tool.call.completed") {
      if (emittedToolCompletions.has(event.toolCallId)) return false;
      emittedToolCompletions.add(event.toolCallId);
    }
    if (event.eventName === "tool.call.failed" && event.toolCallId) {
      emittedToolCompletions.add(event.toolCallId);
    }
    if (event.eventName === "session.updated") {
      const sessionStateKey = `${event.previewUrl ?? ""}`;
      if (sessionStateKey === lastSessionStateKey) return false;
      lastSessionStateKey = sessionStateKey;
      latestPreviewUrl = event.previewUrl ?? latestPreviewUrl;
    }
    if (event.eventName === "agent.handoff.started") {
      activeAgentLabel =
        event.targetType === "agent"
          ? event.targetName ?? event.targetId
          : activeAgentLabel;
    }

    if (
      (event.eventName === "tool.call.started" ||
        event.eventName === "tool.call.completed" ||
        event.eventName === "tool.call.failed") &&
      event.toolName === "apply_patch"
    ) {
      console.info("[apply-patch-debug] stream:event", {
        eventName: event.eventName,
        toolCallId: event.toolCallId,
        hasArgs:
          "args" in event &&
          typeof event.args !== "undefined",
        hasResult:
          "result" in event &&
          typeof event.result !== "undefined",
        error:
          "error" in event && typeof event.error === "string"
            ? event.error
            : undefined,
      });
    }

    enqueueJson(controller, event);
    return true;
  };

  const emitUsageIfNeeded = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    chunk: unknown
  ) => {
    const usage = extractUsage(chunk);
    const costUSD = extractCostUSD(chunk);
    const usageKey = usage
      ? JSON.stringify({
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          reasoningTokens: usage.reasoningTokens ?? 0,
          cachedInputTokens: usage.cachedInputTokens ?? 0,
          costUSD: costUSD ?? null,
        })
      : undefined;
    if (usage && usageKey && usageKey !== lastUsageKey) {
      lastUsageKey = usageKey;
      const usagePayload: StreamEvent = {
        type: "stream.event",
        eventName: "usage.updated",
        usage,
        modelId: payload.model,
        costUSD,
      };
      enqueueJson(controller, usagePayload);
      const nextContextWindow = {
        ...preparedContext.contextWindow,
        actualPromptTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        percentage: Math.min(
          1,
          (usage.inputTokens ?? 0) / preparedContext.contextWindow.limitTokens,
        ),
        status: getContextPressureStatus(usage.inputTokens ?? 0, payload.model),
        source: "actual" as const,
        updatedAt: Date.now(),
      };
      const contextWindowKey = JSON.stringify(nextContextWindow);
      if (contextWindowKey !== lastContextWindowKey) {
        lastContextWindowKey = contextWindowKey;
        latestContextWindow = nextContextWindow;
        enqueueJson(controller, {
          type: "stream.event",
          eventName: "context.updated",
          contextWindow: nextContextWindow,
        } satisfies StreamEvent);
      }
    }
  };

  const cloneRequestContext = (source: RequestContext) => {
    const clone = new RequestContext();
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

  const getToolEventSummary = (event: StreamEvent) => {
    switch (event.eventName) {
      case "tool.call.started":
        return {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          agentId: event.agentId,
          depth: event.depth,
        };
      case "tool.call.progress":
        return {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          status: event.status,
          step: event.step,
          message: event.message,
          runState: event.runState,
          hasStdout: Boolean(event.stdout),
          hasStderr: Boolean(event.stderr),
          durationMs: event.durationMs,
          agentId: event.agentId,
          depth: event.depth,
        };
      case "tool.call.completed": {
        const resultRecord =
          typeof event.result === "object" && event.result !== null
            ? (event.result as Record<string, unknown>)
            : null;
        return {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          agentId: event.agentId,
          depth: event.depth,
          previewUrl:
            typeof resultRecord?.previewUrl === "string"
              ? resultRecord.previewUrl
              : typeof resultRecord?.deploymentUrl === "string"
                ? resultRecord.deploymentUrl
                : typeof resultRecord?.url === "string"
                  ? resultRecord.url
                  : undefined,
        };
      }
      case "tool.call.failed":
        return {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          error: event.error,
          agentId: event.agentId,
          depth: event.depth,
        };
      default:
        return null;
    }
  };

  const logStreamEvent = (event: StreamEvent) => {
    if (!logger) return;

    if (event.eventName === "tool.call.started") {
      logger.info("Mastra tool started", getToolEventSummary(event) ?? {});
      return;
    }

    if (event.eventName === "tool.call.completed") {
      logger.info("Mastra tool completed", getToolEventSummary(event) ?? {});
      return;
    }

    if (event.eventName === "tool.call.failed") {
      logger.error("Mastra tool failed", getToolEventSummary(event) ?? {});
      return;
    }

    if (event.eventName === "tool.call.progress") {
      if (event.stderr) {
        logger.warn("Mastra tool progress", getToolEventSummary(event) ?? {});
        return;
      }
      if (event.stdout || event.message || event.status === "running") {
        logger.info("Mastra tool progress", getToolEventSummary(event) ?? {});
      }
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        logger?.info("Mastra stream started", {
          routeAgentId: agentId,
          threadId: payload.threadId ?? null,
          model: payload.model ?? null,
          workspaceRoot: effectiveWorkspaceRoot ?? null,
        });
        enqueueJson(controller, {
          type: "stream.event",
          eventName: "context.updated",
          contextWindow: preparedContext.contextWindow,
        } satisfies StreamEvent);

        if (payload.threadId) {
          await upsertThreadSession({
            threadId: payload.threadId,
            subtitle: payload.model,
          });
        }

        const streamReader = await startAgentStream(cloneRequestContext(requestContext));

        while (true) {
          const { value, done } = await streamReader.read();
          if (done) break;

          const chunk = redactStreamChunk(value);
          const streamEvents = mapChunkToStreamEvents(chunk);
          for (const event of streamEvents) {
            const emitted = applyStreamEvent(controller, event);
            if (emitted) {
              logStreamEvent(event);
            }
          }
          while (pendingAppliedSteers.length > 0) {
            const steerText = pendingAppliedSteers.shift();
            if (!steerText) continue;
            enqueueJson(controller, {
              type: "stream.event",
              eventName: "guide.applied",
              text: steerText,
            } satisfies StreamEvent);
          }
          emitUsageIfNeeded(controller, chunk);
        }
      } catch (error) {
        streamOutcome = "error";
        const errorName =
          error instanceof Error && error.name ? error.name : undefined;
        const errorMessage =
          error instanceof Error && error.message ? error.message : undefined;
        streamTerminalErrorText =
          errorName === "ResponseAborted"
            ? "Tool execution was interrupted because the model response was aborted (tripwire)."
            : errorMessage || errorName || "Stream error";
        logger?.error("Mastra stream failed", {
          routeAgentId: agentId,
          threadId: payload.threadId ?? null,
          model: payload.model ?? null,
          workspaceRoot: effectiveWorkspaceRoot ?? null,
          error: errorMessage ?? "Stream error",
          errorName: errorName ?? null,
        });
        const errorPayload = {
          type: "stream.event",
          eventName: "tool.call.failed",
          error: streamTerminalErrorText,
        };
        enqueueJson(controller, errorPayload);
      } finally {
        for (const toolCallId of emittedToolStarts) {
          if (emittedToolCompletions.has(toolCallId)) continue;
          const meta = startedToolMeta.get(toolCallId);
          if (meta?.toolName === "apply_patch") {
            console.error("[apply-patch-debug] stream:orphaned", {
              toolCallId,
              toolName: meta.toolName,
              streamTerminalErrorText,
            });
          }
          const orphanedToolEvent: StreamEvent = {
            type: "stream.event",
            eventName: "tool.call.failed",
            toolCallId,
            toolName: meta?.toolName,
            error:
              streamTerminalErrorText ??
              "Tool started but the stream ended before a result was received.",
          };
          enqueueJson(controller, orphanedToolEvent);
        }
        const finalStatus =
          streamOutcome === "error"
            ? "error"
            : emittedToolCompletions.size > 0 || latestPreviewUrl
              ? "done"
              : "idle";
        if (payload.threadId) {
          await upsertThreadSession({
            threadId: payload.threadId,
            state: {
              contextWindow: latestContextWindow,
            },
          }).catch(() => {
            // Ignore terminal context persistence failures.
          });
        }
        const endedEvent: StreamEvent = {
          type: "stream.event",
          eventName: "session.ended",
          status: finalStatus,
          reason: streamTerminalErrorText,
        };
        enqueueJson(controller, endedEvent);
        logger?.info("Mastra stream finished", {
          routeAgentId: agentId,
          threadId: payload.threadId ?? null,
          model: payload.model ?? null,
          workspaceRoot: effectiveWorkspaceRoot ?? null,
          status: finalStatus,
          toolCalls: emittedToolStarts.size,
          previewUrl: latestPreviewUrl ?? null,
        });
        if (payload.threadId) {
          try {
            await upsertThreadSession({
              threadId: payload.threadId,
              subtitle: payload.model,
              state: {
                previewUrl: latestPreviewUrl,
              },
            });
          } catch {
            // Ignore thread session persistence failures at stream teardown.
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
