"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  createStreamEventBus,
  type ChatItem,
  type PreviewLog,
  type StreamPayload,
} from "@/lib/stream-event-bus";
import { cn } from "@/lib/utils";

const TEST_AGENT_ID = "multi-agent-supervisor";

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createThreadId = () => `multi-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type ParsedEvent = {
  event?: string;
  data: string;
};

type RawStreamEvent = {
  id: string;
  label: string;
  payload: string;
};

const parseSseEvent = (raw: string): ParsedEvent | null => {
  const lines = raw.split("\n");
  const dataLines: string[] = [];
  let event: string | undefined;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;

  return { event, data: dataLines.join("\n") };
};

const PRESET_PROMPTS = [
  "分析这个项目里 multi-agent 的流式实现，重点回答：subagent 的输出能不能在同一个 stream 里看到？请同时检查本地代码和 Mastra supervisor 的行为。",
  "做一个 deep research：解释 Codex 这个项目里 agent.stream.delta、agent.handoff.started、tool.call.* 是怎么串起来的，并判断前端是否已经能消费 subagent 输出。",
  "请以测试视角审计这套多 agent 流：分别说明 supervisor、repo researcher、web researcher 的输出是否能在单条 SSE 中被区分。",
] as const;

const stringifyPayload = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const itemStatusTone = (status?: string) => {
  if (status === "error") return "destructive" as const;
  if (status === "pending") return "secondary" as const;
  return "outline" as const;
};

export default function MultiAgentTestPage() {
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0]);
  const [model, setModel] = useState("openrouter/openai/gpt-5.4-mini");
  const [workspaceRoot, setWorkspaceRoot] = useState("/Users/work/coding-agent");
  const [, setThreadId] = useState("multi-agent-pending");
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [rawEvents, setRawEvents] = useState<RawStreamEvent[]>([]);
  const [previewLogs, setPreviewLogs] = useState<PreviewLog[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [contextWindow, setContextWindow] = useState<StreamPayload["contextWindow"] | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const itemsRef = useRef<ChatItem[]>([]);
  const assistantIdRef = useRef<string | null>(null);
  const postToolPendingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const updateItems = (updater: ChatItem[] | ((previous: ChatItem[]) => ChatItem[])) => {
    setItems((previous) => {
      const next =
        typeof updater === "function"
          ? (updater as (previous: ChatItem[]) => ChatItem[])(previous)
          : updater;
      itemsRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const eventBus = useMemo(
    () =>
      createStreamEventBus({
        setItems: updateItems,
        setError,
        setStatus,
        setPreviewUrl,
        setStreamingMessageId,
        assistantIdRef,
        itemsRef,
        postToolPendingRef,
        createId,
        appendPreviewLog: (log) =>
          setPreviewLogs((previous) => [...previous.slice(-199), log]),
        getModelId: () => model,
        setContextWindow,
        setPlan: () => {},
      }),
    [model],
  );

  const pushRawEvent = (data: StreamPayload | string, fallbackLabel?: string) => {
    const label =
      typeof data === "string"
        ? fallbackLabel ?? "text"
        : data.eventName ?? data.type ?? fallbackLabel ?? "event";
    setRawEvents((previous) => [
      ...previous.slice(-199),
      {
        id: createId(),
        label,
        payload: stringifyPayload(data),
      },
    ]);
  };

  const resetRunState = (nextThreadId: string) => {
    setThreadId(nextThreadId);
    itemsRef.current = [];
    setItems([]);
    setRawEvents([]);
    setPreviewLogs([]);
    setPreviewUrl(null);
    setContextWindow(null);
    setStreamingMessageId(null);
    assistantIdRef.current = null;
    postToolPendingRef.current = false;
  };

  const handleSubmit = async () => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt || status === "submitted" || status === "streaming") return;

    const nextThreadId = createThreadId();
    resetRunState(nextThreadId);
    setError(null);
    setStatus("submitted");

    const userMessage: ChatItem = {
      id: createId(),
      type: "message",
      role: "user",
      content: nextPrompt,
    };
    const assistantId = createId();
    assistantIdRef.current = assistantId;

    const initialItems: ChatItem[] = [
      userMessage,
      {
        id: assistantId,
        type: "message",
        role: "assistant",
        content: "",
        images: [],
        modelId: model,
      },
      {
        id: `thinking:${assistantId}:optimistic`,
        type: "thinking",
        messageId: assistantId,
        content: "",
        status: "pending",
      },
    ];
    itemsRef.current = initialItems;
    setItems(initialItems);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/agents/${TEST_AGENT_ID}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: nextPrompt,
          threadId: nextThreadId,
          model,
          requestContext: {
            workspaceRoot: workspaceRoot.trim() || undefined,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const responseText = await response.text();
        throw new Error(responseText || "Multi-agent stream failed");
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
            // Leave non-JSON payloads as-is for debugging.
          }
          pushRawEvent(data, parsed.event);
          eventBus.handlePayload(data);
        }
      }

      eventBus.finalize();
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown stream error";
      const aborted =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        /aborted|aborterror|signal is aborted/i.test(message);

      if (aborted) {
        eventBus.finalize({
          errorText: "The multi-agent test stream was manually stopped.",
        });
        setError(null);
        setStatus("ready");
      } else {
        eventBus.finalize({ errorText: message });
        setError(message);
        setStatus("error");
      }
    } finally {
      const finalAssistantId = assistantIdRef.current;
      if (finalAssistantId) {
        updateItems((previous) =>
          previous.map((item) =>
            item.type === "thinking" && item.messageId === finalAssistantId
              ? { ...item, status: "done" }
              : item,
          ),
        );
      }
      abortRef.current = null;
      assistantIdRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#0b0d12] px-6 py-8 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-16">
        <div className="flex flex-col gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Multi-Agent Stream Test
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-white/65">
              这个页面专门用来测试 Mastra supervisor 多 agent。它会同时展示最终回答、
              subagent 聚合视图和原始 SSE 事件，方便确认每个 agent 的输出是否进入同一条流。
            </p>
          </div>
        </div>

        <Card className="border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/20">
          <CardHeader>
            <CardTitle className="text-white">Run Config</CardTitle>
            <CardDescription className="text-white/62">
              这是独立测试入口，不影响现有 coding agent 页面。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pb-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Model
                </div>
                <Input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="border-white/10 bg-black/25 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Workspace Root
                </div>
                <Input
                  value={workspaceRoot}
                  onChange={(event) => setWorkspaceRoot(event.target.value)}
                  className="border-white/10 bg-black/25 text-white placeholder:text-white/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                Prompt
              </div>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-40 border-white/10 bg-black/20 text-sm text-white"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESET_PROMPTS.map((preset) => (
                <Button
                  key={preset}
                  variant="outline"
                  size="sm"
                  onClick={() => setPrompt(preset)}
                  className="border-white/10 bg-transparent text-white/80 hover:bg-white/8 hover:text-white"
                >
                  Use preset
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleSubmit}
                disabled={status === "submitted" || status === "streaming"}
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                Run Multi-Agent Test
              </Button>
              <Button
                variant="outline"
                onClick={handleStop}
                disabled={status !== "submitted" && status !== "streaming"}
                className="border-white/10 bg-transparent text-white hover:bg-white/8"
              >
                Stop
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const nextThreadId = createThreadId();
                  resetRunState(nextThreadId);
                  setError(null);
                  setStatus("ready");
                }}
                className="text-white/75 hover:bg-white/8 hover:text-white"
              >
                Clear
              </Button>
              {streamingMessageId ? (
                <span className="text-xs text-white/45">
                  streaming message: {streamingMessageId}
                </span>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1.15fr_0.9fr]">
          <Card className="min-h-[640px] border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/20">
            <CardHeader>
              <CardTitle className="text-white">Aggregated Conversation</CardTitle>
              <CardDescription className="text-white/62">
                这是经过现有 stream event bus 聚合后的 UI 视图。
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <ScrollArea className="h-[540px] pr-4">
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">
                      运行一次测试后，这里会出现 assistant、thinking、agent、tool 等聚合结果。
                    </div>
                  ) : (
                    items.map((item) => {
                      if (item.type === "message") {
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "rounded-xl border px-4 py-3",
                              item.role === "user"
                                ? "border-cyan-500/20 bg-cyan-500/8"
                                : "border-white/10 bg-black/20",
                            )}
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="outline">{item.role}</Badge>
                              {item.modelId ? <Badge variant="secondary">{item.modelId}</Badge> : null}
                            </div>
                            <pre className="whitespace-pre-wrap break-words text-sm text-white/88">
                              {item.content || "(empty)"}
                            </pre>
                          </div>
                        );
                      }

                      if (item.type === "thinking") {
                        return (
                          <div key={item.id} className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="secondary">thinking</Badge>
                              <Badge variant={itemStatusTone(item.status)}>{item.status}</Badge>
                            </div>
                            <pre className="whitespace-pre-wrap break-words text-sm text-white/72">
                              {item.content || "(no reasoning text)"}
                            </pre>
                          </div>
                        );
                      }

                      if (item.type === "agent") {
                        return (
                          <div key={item.id} className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/8 px-4 py-3">
                            <div className="mb-2 flex items-center gap-2">
                              <Badge variant="outline">agent</Badge>
                              <Badge variant={itemStatusTone(item.status)}>{item.status}</Badge>
                              <span className="text-sm text-white/88">{item.name}</span>
                              {typeof item.depth === "number" ? (
                                <span className="text-xs text-white/45">depth {item.depth}</span>
                              ) : null}
                            </div>
                            {item.thinking ? (
                              <pre className="mb-3 whitespace-pre-wrap break-words rounded-lg bg-black/20 px-3 py-2 text-xs text-white/55">
                                {item.thinking}
                              </pre>
                            ) : null}
                            <pre className="whitespace-pre-wrap break-words text-sm text-white/88">
                              {item.content || "(no visible text delta yet)"}
                            </pre>
                          </div>
                        );
                      }

                      return (
                        <div key={item.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant="outline">tool</Badge>
                            <Badge variant={itemStatusTone(item.status)}>{item.status}</Badge>
                            <span className="text-sm text-white/88">{item.name}</span>
                            {item.agentId ? (
                              <span className="text-xs text-white/45">agent: {item.agentId}</span>
                            ) : null}
                          </div>
                          {item.errorText ? (
                            <div className="mb-2 text-xs text-rose-200">{item.errorText}</div>
                          ) : null}
                          {item.steps?.length ? (
                            <div className="mb-2 space-y-1">
                              {item.steps.map((step) => (
                                <div key={step.id} className="rounded-md bg-black/20 px-2 py-1 text-xs text-white/62">
                                  {step.step}
                                  {step.message ? `: ${step.message}` : ""}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {item.result ? (
                            <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/20 px-3 py-2 text-xs text-white/62">
                              {stringifyPayload(item.result)}
                            </pre>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="min-h-[640px] border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/20">
            <CardHeader>
              <CardTitle className="text-white">Raw Stream Events</CardTitle>
              <CardDescription className="text-white/62">
                这里显示服务端实际推过来的 SSE payload，最适合确认 subagent 事件是否进入同一条流。
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-6">
              <ScrollArea className="h-[540px] pr-4">
                <div className="space-y-3">
                  {rawEvents.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-sm text-white/45">
                      还没有收到任何 stream event。
                    </div>
                  ) : (
                    rawEvents.map((event) => (
                      <div key={event.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="secondary">{event.label}</Badge>
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-xs text-white/65">
                          {event.payload}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="flex min-h-[640px] flex-col gap-6">
            <Card className="border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/20">
              <CardHeader>
                <CardTitle className="text-white">Stream Summary</CardTitle>
                <CardDescription className="text-white/62">快速判断这次测试有没有跑出子 agent 输出。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pb-6 text-sm text-white/74">
                <div>assistant messages: {items.filter((item) => item.type === "message" && item.role === "assistant").length}</div>
                <div>agent cards: {items.filter((item) => item.type === "agent").length}</div>
                <div>tool cards: {items.filter((item) => item.type === "tool").length}</div>
                <div>raw events: {rawEvents.length}</div>
                <div>
                  stream verdict:{" "}
                  {items.some((item) => item.type === "agent" && (item.content.trim() || item.thinking?.trim()))
                    ? "subagent output observed in shared stream"
                    : "no subagent text observed yet"}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/20">
              <CardHeader>
                <CardTitle className="text-white">Context Window</CardTitle>
                <CardDescription className="text-white/62">来自现有流式接口的 context.updated 事件。</CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/20 px-3 py-3 text-xs text-white/62">
                  {stringifyPayload(contextWindow ?? "No context window event yet")}
                </pre>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/20">
              <CardHeader>
                <CardTitle className="text-white">Preview / Logs</CardTitle>
                <CardDescription className="text-white/62">保留现有 event bus 里能拿到的预览和工具日志。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pb-6">
                <div className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65">
                  previewUrl: {previewUrl ?? "(none)"}
                </div>
                <ScrollArea className="h-[180px] pr-3">
                  <div className="space-y-2">
                    {previewLogs.length === 0 ? (
                      <div className="text-xs text-white/45">No preview logs yet.</div>
                    ) : (
                      previewLogs.map((log, index) => (
                        <div key={`${log.timestamp.toISOString()}-${index}`} className="rounded-md bg-black/20 px-3 py-2 text-xs text-white/62">
                          [{log.level}] {log.message}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
