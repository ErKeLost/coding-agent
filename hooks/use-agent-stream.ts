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
import type { ThreadRecord } from "@/lib/thread-session";

export type QueuedSubmission = {
  id: string;
  text: string;
  files: FileUIPart[];
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
  threadId: string;
  workspaceRoot: string | null;
  items: ChatItem[];
  setItems: React.Dispatch<React.SetStateAction<ChatItem[]>>;
  setRecentThreads: React.Dispatch<React.SetStateAction<ThreadRecord[]>>;
  setPreviewUrl: (value: string | null) => void;
  setPreviewLogs: React.Dispatch<React.SetStateAction<PreviewLog[]>>;
  setPlan: (value: SerializablePlan | null) => void;
  summarizeThreadTitle: (value?: string | null) => string;
  summarizeWorkspaceRoot: (value: string | null | undefined) => string;
  mergeRecentThreads: (nextRecord: ThreadRecord, current: ThreadRecord[]) => ThreadRecord[];
  createId: () => string;
  parseSseEvent: (raw: string) => { event?: string; data: string } | null;
  prepareAttachmentForModel: (file: FileUIPart) => Promise<{
    dataUrl: string;
    mediaType: string;
    filename?: string;
    previewImage?: NonNullable<ChatItem["images"]>[number];
  }>;
  modelSupportsImageInput: (modelId?: string) => boolean;
};

export function useAgentStream({
  params,
  model,
  selectedAgent,
  selectedModelName,
  threadId,
  workspaceRoot,
  items,
  setItems,
  setRecentThreads,
  setPreviewUrl,
  setPreviewLogs,
  setPlan,
  summarizeThreadTitle,
  summarizeWorkspaceRoot,
  mergeRecentThreads,
  createId,
  parseSseEvent,
  prepareAttachmentForModel,
  modelSupportsImageInput,
}: UseAgentStreamOptions) {
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready");
  const [error, setError] = useState<string | null>(null);
  const [queuedSubmissions, setQueuedSubmissions] = useState<QueuedSubmission[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const [, setStreamingMessageId] = useState<string | null>(null);
  const itemsRef = useRef<ChatItem[]>(items);
  const postToolPendingRef = useRef(false);
  const dequeuingSubmissionRef = useRef(false);

  itemsRef.current = items;

  const streamBus = useMemo(
    () =>
      createStreamEventBus({
        setItems,
        setError,
        setStatus,
        setPreviewUrl,
        setStreamingMessageId,
        assistantIdRef,
        itemsRef: itemsRef as MutableRefObject<ChatItem[]>,
        postToolPendingRef,
        createId,
        appendPreviewLog: (log) =>
          setPreviewLogs((prev) => [...prev.slice(-200), log]),
        getModelId: () => model,
        setPlan,
        setWorkflowGraph: () => {},
      }),
    [createId, model, setItems, setPlan, setPreviewLogs, setPreviewUrl],
  );

  const processSubmission = useCallback(async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    const attachments = message.files ?? [];
    if (!text && attachments.length === 0) return;

    const containsImageAttachment = attachments.some((file) =>
      file.mediaType.startsWith("image/"),
    );
    if (containsImageAttachment && !modelSupportsImageInput(model)) {
      setError(
        `当前模型 ${selectedModelName ?? model} 不支持图片输入。请切换到支持多模态的模型后再上传图片。`,
      );
      setStatus("ready");
      return;
    }

    setPlan(null);
    setPreviewUrl(null);
    setStatus("submitted");
    setError(null);

    const threadTitleInput =
      text || attachments.find((file) => file.filename)?.filename || "Image request";
    const userImages: NonNullable<ChatItem["images"]> = [];

    const userMessage: ChatItem = {
      id: createId(),
      type: "message",
      role: "user",
      content: text,
      images: userImages,
    };

    const assistantId = createId();
    assistantIdRef.current = assistantId;

    const assistantMessage: ChatItem = {
      id: assistantId,
      type: "message",
      role: "assistant",
      content: "",
      images: [],
      modelId: model,
    };

    const optimisticThinking: ChatItem = {
      id: `thinking:${assistantId}:optimistic`,
      type: "thinking",
      messageId: assistantId,
      content: "",
      status: "pending",
    };

    setItems((prev) => [...prev, userMessage, assistantMessage, optimisticThinking]);

    if (threadId) {
      setRecentThreads((prev) =>
        mergeRecentThreads(
          {
            id: threadId,
            title: summarizeThreadTitle(threadTitleInput),
            subtitle: summarizeWorkspaceRoot(workspaceRoot),
            workspaceRoot,
            updatedAt: Date.now(),
          },
          prev,
        ),
      );
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingMessageId(assistantId);
    setStatus("submitted");

    try {
      const preparedAttachments = attachments.length
        ? await Promise.all(attachments.map((file) => prepareAttachmentForModel(file)))
        : [];
      userMessage.images = preparedAttachments
        .map((file) => file.previewImage ?? null)
        .filter((image): image is NonNullable<typeof image> => Boolean(image));

      const rawId = "id" in (params ?? {}) ? (params as { id?: string | string[] }).id : undefined;
      const routeId = Array.isArray(rawId) ? rawId[0] : rawId;
      const effectiveThreadId =
        threadId || (typeof routeId === "string" ? routeId : undefined);

      const response = await fetch(`/api/agents/${selectedAgent}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(preparedAttachments.length
            ? {
                messages: [
                  {
                    role: "user",
                    content: [
                      ...(text ? [{ type: "text" as const, text }] : []),
                      ...preparedAttachments.map((file) => ({
                        type: "file" as const,
                        mediaType: file.mediaType,
                        filename: file.filename,
                        data: file.dataUrl,
                      })),
                    ],
                  },
                ],
              }
            : { message: text }),
          threadId: effectiveThreadId,
          model,
          requestContext: {
            workspaceRoot,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || "Mastra stream failed");
      }

      setStatus("streaming");
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
          streamBus.handlePayload(data);
        }
      }

      setStatus("ready");
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "未知错误";
      const message = rawMessage.includes("No endpoints found that support image input")
        ? `当前模型 ${selectedModelName ?? model} 不支持图片输入。请切换到支持多模态的模型后再试。`
        : rawMessage;
      const aborted =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        /aborted|aborterror|signal is aborted/i.test(rawMessage);
      if (aborted) {
        setError(null);
        setStatus("ready");
      } else {
        setError(message);
        setStatus("error");
      }
    } finally {
      const finalAssistantId = assistantIdRef.current ?? assistantId;
      if (finalAssistantId) {
        setItems((prev) =>
          prev.map((item) =>
            item.type === "thinking" && item.messageId === finalAssistantId
              ? { ...item, status: "done" }
              : item,
          ),
        );
      }
      abortRef.current = null;
      assistantIdRef.current = null;
      postToolPendingRef.current = false;
      setStreamingMessageId(null);
    }
  }, [
    createId,
    mergeRecentThreads,
    model,
    modelSupportsImageInput,
    params,
    parseSseEvent,
    prepareAttachmentForModel,
    selectedAgent,
    selectedModelName,
    setItems,
    setPlan,
    setPreviewUrl,
    setRecentThreads,
    streamBus,
    summarizeThreadTitle,
    summarizeWorkspaceRoot,
    threadId,
    workspaceRoot,
  ]);

  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    const attachments = message.files ?? [];
    if (!text && attachments.length === 0) return;

    if (status === "submitted" || status === "streaming") {
      setQueuedSubmissions((previous) => [
        ...previous,
        {
          id: createId(),
          text: text ?? "",
          files: attachments,
        },
      ]);
      return;
    }

    await processSubmission(message);
  }, [createId, processSubmission, status]);

  const drainSubmissionQueue = useCallback(async () => {
    if (status !== "ready") return;
    if (dequeuingSubmissionRef.current) return;
    const nextSubmission = queuedSubmissions[0];
    if (!nextSubmission) return;

    dequeuingSubmissionRef.current = true;
    setQueuedSubmissions((previous) => previous.slice(1));

    await processSubmission({
      text: nextSubmission.text,
      files: nextSubmission.files,
    }).finally(() => {
      dequeuingSubmissionRef.current = false;
    });
  }, [processSubmission, queuedSubmissions, status]);

  const handleStop = useCallback(() => {
    const currentAssistantId = assistantIdRef.current;
    if (currentAssistantId) {
      setItems((prev) =>
        prev.map((item) =>
          item.type === "thinking" && item.messageId === currentAssistantId
            ? { ...item, status: "done" }
            : item,
        ),
      );
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
    postToolPendingRef.current = false;
    setStreamingMessageId(null);
  }, [setItems]);

  const queuedSubmissionPreview = queuedSubmissions[0] ?? null;

  return {
    status,
    setStatus,
    error,
    setError,
    queuedSubmissions,
    queuedSubmissionPreview,
    handleSubmit,
    handleStop,
    drainSubmissionQueue,
  };
}
