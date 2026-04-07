"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import type { FileUIPart } from "ai";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  createStreamEventBus,
  type ChatItem,
  type PreviewLog,
  type StreamPayload,
} from "@/lib/stream-event-bus";
import type { ThreadRuntimeState } from "@/hooks/use-thread-session";
import type { ThreadContextWindowState } from "@/lib/context-window";

export type QueuedSubmission = {
  id: string;
  text: string;
  files: FileUIPart[];
};

export type SubmissionMode = "default" | "guide";
export type GuideState = "idle" | "queued" | "applied" | "error";

type ModelContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      mediaType: string;
      image: string;
    }
  | {
      type: "file";
      mediaType: string;
      filename?: string;
      data: string;
    };

type SerializablePlan = {
  title: string;
  todos: Array<{
    id: string;
    label: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    description?: string;
  }>;
};

type UseAgentStreamOptions = {
  params: ReadonlyURLSearchParams | Record<string, string | string[] | undefined> | null | undefined;
  model: string;
  selectedAgent: string;
  selectedModelName?: string;
  onGuideUsed?: (text: string) => void;
  threadId: string;
  workspaceRoot: string | null;
  setItems: (
    updater: ChatItem[] | ((previous: ChatItem[]) => ChatItem[]),
    targetThreadId?: string,
  ) => void;
  setPreviewUrl: (value: string | null, targetThreadId?: string) => void;
  setPreviewLogs: (
    updater: PreviewLog[] | ((previous: PreviewLog[]) => PreviewLog[]),
    targetThreadId?: string,
  ) => void;
  setPlan: (value: SerializablePlan | null, targetThreadId?: string) => void;
  setContextWindow: (
    value: ThreadContextWindowState | null,
    targetThreadId?: string,
  ) => void;
  getThreadRuntimeState: (threadId: string) => ThreadRuntimeState;
  createId: () => string;
  parseSseEvent: (raw: string) => { event?: string; data: string } | null;
  prepareAttachmentForModel: (file: FileUIPart) => Promise<{
    dataUrl: string;
    mediaType: string;
    filename?: string;
    previewImage?: NonNullable<ChatItem["images"]>[number];
  }>;
};

export function useAgentStream({
  params,
  model,
  selectedAgent,
  selectedModelName,
  onGuideUsed,
  threadId,
  workspaceRoot,
  setItems,
  setPreviewUrl,
  setPreviewLogs,
  setPlan,
  setContextWindow,
  getThreadRuntimeState,
  createId,
  parseSseEvent,
  prepareAttachmentForModel,
}: UseAgentStreamOptions) {
  const [statusByThread, setStatusByThread] = useState<
    Record<string, "submitted" | "streaming" | "ready" | "error">
  >({});
  const [errorByThread, setErrorByThread] = useState<Record<string, string | null>>(
    {},
  );
  const [queuedSubmissionsByThread, setQueuedSubmissionsByThread] = useState<
    Record<string, QueuedSubmission[]>
  >({});
  const [guideStateByThread, setGuideStateByThread] = useState<
    Record<string, GuideState>
  >({});
  const [guideTextByThread, setGuideTextByThread] = useState<
    Record<string, string | null>
  >({});

  const abortRef = useRef<Record<string, AbortController | null>>({});
  const assistantIdRef = useRef<Record<string, string | null>>({});
  const dequeuingSubmissionRef = useRef<Record<string, boolean>>({});
  const streamingMessageIdRef = useRef<Record<string, string | null>>({});

  const activeStatus =
    (threadId && statusByThread[threadId]) || "ready";
  const activeError = (threadId && errorByThread[threadId]) || null;
  const activeQueuedSubmissions = useMemo(
    () => (threadId && queuedSubmissionsByThread[threadId]) || [],
    [queuedSubmissionsByThread, threadId],
  );
  const activeGuideState =
    (threadId && guideStateByThread[threadId]) || "idle";
  const activeGuideText = (threadId && guideTextByThread[threadId]) || null;

  const setThreadStatus = useCallback((
    targetThreadId: string,
    nextStatus: "submitted" | "streaming" | "ready" | "error",
  ) => {
    if (!targetThreadId) return;
    setStatusByThread((previous) =>
      previous[targetThreadId] === nextStatus
        ? previous
        : {
            ...previous,
            [targetThreadId]: nextStatus,
          },
    );
  }, []);

  const setThreadError = useCallback((targetThreadId: string, value: string | null) => {
    if (!targetThreadId) return;
    setErrorByThread((previous) =>
      previous[targetThreadId] === value
        ? previous
        : {
            ...previous,
            [targetThreadId]: value,
          },
    );
  }, []);

  const createScopedStreamBus = useCallback((targetThreadId: string, targetModel: string) => {
    const scopedAssistantIdRef = {
      get current() {
        return assistantIdRef.current[targetThreadId] ?? null;
      },
      set current(value: string | null) {
        assistantIdRef.current[targetThreadId] = value;
      },
    } as MutableRefObject<string | null>;
    const scopedItemsRef = {
      get current() {
        return getThreadRuntimeState(targetThreadId).items;
      },
      set current(_value: ChatItem[]) {
        // no-op
      },
    } as MutableRefObject<ChatItem[]>;
    const scopedPostToolPendingRef = {
      current: false,
    };

    return createStreamEventBus({
      setItems: (updater) => setItems(updater, targetThreadId),
      setError: (value) => setThreadError(targetThreadId, value),
      setStatus: (value) => setThreadStatus(targetThreadId, value),
      setPreviewUrl: (value) => setPreviewUrl(value, targetThreadId),
      setStreamingMessageId: (value) => {
        streamingMessageIdRef.current[targetThreadId] = value;
      },
      assistantIdRef: scopedAssistantIdRef,
      itemsRef: scopedItemsRef,
      postToolPendingRef: scopedPostToolPendingRef,
      createId,
      appendPreviewLog: (log) =>
        setPreviewLogs(
          (previous) => [...previous.slice(-200), log],
          targetThreadId,
        ),
      getModelId: () => targetModel,
      setContextWindow: (value) => setContextWindow(value, targetThreadId),
      setPlan: (value) => setPlan(value, targetThreadId),
    });
  }, [
    createId,
    getThreadRuntimeState,
    setItems,
    setContextWindow,
    setPlan,
    setPreviewLogs,
    setPreviewUrl,
    setThreadError,
    setThreadStatus,
  ]);

  const processSubmission = useCallback(async (
    message: PromptInputMessage,
    options?: { mode?: SubmissionMode; targetThreadId?: string; targetWorkspaceRoot?: string | null; targetModel?: string },
  ) => {
    const text = message.text?.trim();
    const attachments = message.files ?? [];
    if (!text && attachments.length === 0) return;
    const mode = options?.mode ?? "default";
    const isGuide = mode === "guide";
    const targetThreadId =
      options?.targetThreadId ??
      threadId ??
      (typeof ("id" in (params ?? {}) ? (params as { id?: string | string[] }).id : undefined) ===
      "string"
        ? (params as { id?: string }).id
        : undefined);

    if (!targetThreadId) return;

    const targetModel = options?.targetModel ?? model;
    const targetWorkspaceRoot =
      options?.targetWorkspaceRoot ?? getThreadRuntimeState(targetThreadId).workspaceRoot ?? workspaceRoot;

    if (!isGuide) {
      setPlan(null, targetThreadId);
      setPreviewUrl(null, targetThreadId);
    }
    setThreadStatus(targetThreadId, "submitted");
    setThreadError(targetThreadId, null);

    const userImages: NonNullable<ChatItem["images"]> = [];

    const userMessage: ChatItem = {
      id: createId(),
      type: "message",
      role: "user",
      content: text,
      messageKind: isGuide ? "guide" : "default",
      images: userImages,
    };

    const assistantId = createId();
    assistantIdRef.current[targetThreadId] = assistantId;

    const assistantMessage: ChatItem = {
      id: assistantId,
      type: "message",
      role: "assistant",
      content: "",
      images: [],
      modelId: targetModel,
    };

    const optimisticThinking: ChatItem = {
      id: `thinking:${assistantId}:optimistic`,
      type: "thinking",
      messageId: assistantId,
      content: "",
      status: "pending",
    };

    setItems((previous) => [...previous, userMessage, assistantMessage, optimisticThinking], targetThreadId);

    const controller = new AbortController();
    abortRef.current[targetThreadId] = controller;
    streamingMessageIdRef.current[targetThreadId] = assistantId;
    const streamBus = createScopedStreamBus(targetThreadId, targetModel);

    try {
      const preparedAttachments = attachments.length
        ? await Promise.all(attachments.map((file) => prepareAttachmentForModel(file)))
        : [];
      userMessage.images = preparedAttachments
        .map((file) => file.previewImage ?? null)
        .filter((image): image is NonNullable<typeof image> => Boolean(image));

      const content: ModelContentPart[] = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...preparedAttachments.map((file) =>
          file.mediaType.startsWith("image/")
            ? {
                type: "image" as const,
                mediaType: file.mediaType,
                image: file.dataUrl,
              }
            : {
                type: "file" as const,
                mediaType: file.mediaType,
                filename: file.filename,
                data: file.dataUrl,
              },
        ),
      ];

      const response = await fetch(`/api/agents/${selectedAgent}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(preparedAttachments.length
            ? {
                messages: [
                  {
                    role: "user",
                    content,
                  },
                ],
              }
            : { message: text }),
          threadId: targetThreadId,
          model: targetModel,
          requestContext: {
            workspaceRoot: targetWorkspaceRoot,
            ...(isGuide
              ? {
                  guideMode: "steer",
                  guideText: text ?? "",
                }
              : {}),
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const responseText = await response.text();
        throw new Error(responseText || "Mastra stream failed");
      }

      setThreadStatus(targetThreadId, "streaming");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const parsed = parseSseEvent(part);
          if (!parsed) continue;
          let data: StreamPayload | string = parsed.data;
          try {
            data = JSON.parse(parsed.data) as StreamPayload;
          } catch {
            // keep raw string
          }
          if (
            typeof data !== "string" &&
            data.type === "stream.event" &&
            data.eventName === "guide.applied"
          ) {
            setGuideStateByThread((previous) => ({
              ...previous,
              [targetThreadId]: "applied",
            }));
            setGuideTextByThread((previous) => ({
              ...previous,
              [targetThreadId]: typeof data.text === "string" ? data.text : null,
            }));
          }
          streamBus.handlePayload(data);
        }
      }

      streamBus.finalize();
      setThreadStatus(targetThreadId, "ready");
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "未知错误";
      const message = rawMessage.includes("No endpoints found that support image input")
        ? `当前模型 ${selectedModelName ?? targetModel} 返回了图片输入不支持错误。`
        : rawMessage;
      const aborted =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        /aborted|aborterror|signal is aborted/i.test(rawMessage);
      if (aborted) {
        streamBus.finalize({
          errorText:
            "Tool execution was interrupted because the model response was aborted (tripwire).",
        });
        setThreadError(targetThreadId, null);
        setThreadStatus(targetThreadId, "ready");
      } else {
        streamBus.finalize({ errorText: message });
        setThreadError(targetThreadId, message);
        setThreadStatus(targetThreadId, "error");
      }
    } finally {
      const finalAssistantId = assistantIdRef.current[targetThreadId] ?? assistantId;
      if (finalAssistantId) {
        setItems(
          (previous) =>
            previous.map((item) =>
              item.type === "thinking" && item.messageId === finalAssistantId
                ? { ...item, status: "done" }
                : item,
            ),
          targetThreadId,
        );
      }
      abortRef.current[targetThreadId] = null;
      assistantIdRef.current[targetThreadId] = null;
      streamingMessageIdRef.current[targetThreadId] = null;
    }
  }, [
    createId,
    createScopedStreamBus,
    getThreadRuntimeState,
    model,
    params,
    parseSseEvent,
    prepareAttachmentForModel,
    selectedAgent,
    selectedModelName,
    setItems,
    setPlan,
    setPreviewUrl,
    setThreadError,
    setThreadStatus,
    threadId,
    workspaceRoot,
  ]);

  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    const targetThreadId = threadId;
    if (!targetThreadId) return;
    const text = message.text?.trim();
    const attachments = message.files ?? [];
    if (!text && attachments.length === 0) return;

    if (activeStatus === "submitted" || activeStatus === "streaming") {
      setQueuedSubmissionsByThread((previous) => ({
        ...previous,
        [targetThreadId]: [
          ...(previous[targetThreadId] ?? []),
          {
            id: createId(),
            text: text ?? "",
            files: attachments,
          },
        ],
      }));
      return;
    }

    await processSubmission(message, { targetThreadId });
  }, [activeStatus, createId, processSubmission, threadId]);

  const handleGuideSubmit = useCallback(async (message: PromptInputMessage) => {
    const targetThreadId = threadId;
    if (!targetThreadId) return;
    const text = message.text?.trim();
    const attachments = message.files ?? [];
    if (!text && attachments.length === 0) return;
    const hasRunningSubmission =
      activeStatus === "submitted" || activeStatus === "streaming";

    if (attachments.length > 0) {
      setGuideStateByThread((previous) => ({
        ...previous,
        [targetThreadId]: "error",
      }));
      setGuideTextByThread((previous) => ({
        ...previous,
        [targetThreadId]:
          "引导暂不支持直接附加文件，请先用 @ 文件引用或发送纯文本引导。",
      }));
      return;
    }

    if (hasRunningSubmission) {
      if (text) {
        onGuideUsed?.(text);
      }
      setGuideStateByThread((previous) => ({
        ...previous,
        [targetThreadId]: "queued",
      }));
      setGuideTextByThread((previous) => ({
        ...previous,
        [targetThreadId]: text ?? null,
      }));

      try {
        const response = await fetch(`/api/agents/${selectedAgent}/steer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: targetThreadId,
            text,
          }),
        });

        if (!response.ok) {
          const responseText = await response.text();
          throw new Error(responseText || "Failed to queue guide");
        }
        return;
      } catch (err) {
        setGuideStateByThread((previous) => ({
          ...previous,
          [targetThreadId]: "error",
        }));
        setGuideTextByThread((previous) => ({
          ...previous,
          [targetThreadId]:
            err instanceof Error ? err.message : "Failed to queue guide",
        }));
        return;
      }
    }

    if (text) {
      onGuideUsed?.(text);
    }
    await processSubmission(message, { mode: "guide", targetThreadId });
    setGuideStateByThread((previous) => ({
      ...previous,
      [targetThreadId]: "idle",
    }));
    setGuideTextByThread((previous) => ({
      ...previous,
      [targetThreadId]: null,
    }));
  }, [activeStatus, onGuideUsed, processSubmission, selectedAgent, threadId]);

  const promoteQueuedSubmissionToGuide = useCallback(async () => {
    if (!threadId) return;
    const nextSubmission = activeQueuedSubmissions[0];
    if (!nextSubmission) return;

    setQueuedSubmissionsByThread((previous) => ({
      ...previous,
      [threadId]: (previous[threadId] ?? []).slice(1),
    }));
    await handleGuideSubmit({
      text: nextSubmission.text,
      files: nextSubmission.files,
    });
  }, [activeQueuedSubmissions, handleGuideSubmit, threadId]);

  const drainSubmissionQueue = useCallback(async () => {
    if (!threadId) return;
    if (activeStatus !== "ready") return;
    if (dequeuingSubmissionRef.current[threadId]) return;
    const nextSubmission = activeQueuedSubmissions[0];
    if (!nextSubmission) return;

    dequeuingSubmissionRef.current[threadId] = true;
    setQueuedSubmissionsByThread((previous) => ({
      ...previous,
      [threadId]: (previous[threadId] ?? []).slice(1),
    }));

    await processSubmission(
      {
        text: nextSubmission.text,
        files: nextSubmission.files,
      },
      { targetThreadId: threadId },
    ).finally(() => {
      dequeuingSubmissionRef.current[threadId] = false;
    });
  }, [activeQueuedSubmissions, activeStatus, processSubmission, threadId]);

  const handleStop = useCallback(() => {
    if (!threadId) return;
    const currentAssistantId = assistantIdRef.current[threadId];
    if (currentAssistantId) {
      setItems(
        (previous) =>
          previous.map((item) =>
            item.type === "thinking" && item.messageId === currentAssistantId
              ? { ...item, status: "done" }
              : item,
          ),
        threadId,
      );
    }
    abortRef.current[threadId]?.abort();
    abortRef.current[threadId] = null;
    setThreadStatus(threadId, "ready");
    streamingMessageIdRef.current[threadId] = null;
  }, [setItems, setThreadStatus, threadId]);

  const queuedSubmissionPreview = activeQueuedSubmissions[0] ?? null;

  return {
    status: activeStatus,
    setStatus: (value: "submitted" | "streaming" | "ready" | "error") =>
      threadId ? setThreadStatus(threadId, value) : undefined,
    error: activeError,
    setError: (value: string | null) =>
      threadId ? setThreadError(threadId, value) : undefined,
    guideState: activeGuideState,
    guideText: activeGuideText,
    queuedSubmissions: activeQueuedSubmissions,
    queuedSubmissionPreview,
    handleSubmit,
    handleGuideSubmit,
    promoteQueuedSubmissionToGuide,
    handleStop,
    drainSubmissionQueue,
  };
}
