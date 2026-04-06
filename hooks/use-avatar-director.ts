"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatItem } from "@/lib/stream-event-bus";
import type {
  AvatarContextItem,
  AvatarDirective,
  AvatarDirectorRequest,
} from "@/lib/avatar/types";

type UseAvatarDirectorArgs = {
  threadId: string;
  threadTitle?: string | null;
  workspaceLabel?: string | null;
  model?: string | null;
  avatarName?: string | null;
  avatarDescription?: string | null;
  avatarPersonalityPrompt?: string | null;
  avatarSystemPrompt?: string | null;
  avatarCapabilitiesSummary?: string | null;
  userBehaviorSummary?: string | null;
  streamStatus: "submitted" | "streaming" | "ready" | "error";
  items: ChatItem[];
};

const EMPTY_DIRECTIVE: AvatarDirective = {
  bubble: "",
  speak: false,
  action: "idle",
  emotion: "neutral",
  lookAt: "thread_center",
  moveTo: "left",
  locomotion: "idle",
  priority: "low",
  bubbleTheme: {
    borderColor: "#d9e4ff",
    textColor: "#1f2937",
    backgroundFrom: "#f8fbff",
    backgroundTo: "#eef4ff",
    glowColor: "rgba(94, 151, 255, 0.28)",
  },
  source: "heuristic",
};

const toAvatarItem = (item: ChatItem): AvatarContextItem => {
  if (item.type === "message") {
    return {
      type: "message",
      role: item.role,
      content: item.content,
    };
  }

  if (item.type === "tool") {
    return {
      type: "tool",
      name: item.name,
      status: item.status,
      errorText: item.errorText,
    };
  }

  if (item.type === "thinking") {
    return {
      type: "thinking",
      status: item.status,
      content: item.content,
    };
  }

  return {
    type: "agent",
    name: item.name,
    status: item.status,
    content: item.content,
  };
};

const buildSignature = (request: AvatarDirectorRequest) =>
  JSON.stringify({
    threadId: request.threadId,
    streamStatus: request.streamStatus,
    items: request.recentItems,
  });

export function useAvatarDirector({
  threadId,
  threadTitle,
  workspaceLabel,
  model,
  avatarName,
  avatarDescription,
  avatarPersonalityPrompt,
  avatarSystemPrompt,
  avatarCapabilitiesSummary,
  userBehaviorSummary,
  streamStatus,
  items,
}: UseAvatarDirectorArgs) {
  const [directive, setDirective] = useState<AvatarDirective>(EMPTY_DIRECTIVE);
  const [thinking, setThinking] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const lastPublishedSignatureRef = useRef("");
  const lastDirectiveSignatureRef = useRef("");
  const lastPublishedAtRef = useRef(0);

  const recentItems = useMemo(
    () => items.slice(-16).map(toAvatarItem),
    [items],
  );

  useEffect(() => {
    if (!threadId) return;

    let cancelled = false;
    let socket: WebSocket | null = null;

    const connect = async () => {
      try {
        const response = await fetch("/api/avatar/socket", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { url?: string };
        if (!payload.url || cancelled) return;

        socket = new WebSocket(payload.url);
        socketRef.current = socket;

        socket.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data) as
              | { type: "avatar.directive"; payload: AvatarDirective }
              | { type: "avatar.ready" }
              | { type: "avatar.error"; message: string }
              | { type: "avatar.pong" };
            if (packet.type !== "avatar.directive") return;
            const nextDirective = packet.payload;
            const directiveSignature = JSON.stringify({
              bubble: nextDirective.bubble,
              action: nextDirective.action,
              emotion: nextDirective.emotion,
              lookAt: nextDirective.lookAt,
              moveTo: nextDirective.moveTo,
              locomotion: nextDirective.locomotion,
              priority: nextDirective.priority,
              bubbleTheme: nextDirective.bubbleTheme,
            });
            if (directiveSignature === lastDirectiveSignatureRef.current) {
              return;
            }
            lastDirectiveSignatureRef.current = directiveSignature;
            setDirective(nextDirective);
          } catch {
            // Ignore malformed sidecar packets.
          }
        };
      } catch {
        // Keep the main chat usable if Avatar websocket boot fails.
      }
    };

    void connect();

    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;

    const request: AvatarDirectorRequest = {
      threadId,
      threadTitle,
      workspaceLabel,
      model,
      avatarName,
      avatarDescription,
      avatarPersonalityPrompt,
      avatarSystemPrompt,
      avatarCapabilitiesSummary,
      userBehaviorSummary,
      streamStatus,
      recentItems,
    };

    const signature = buildSignature(request);
    if (signature === lastPublishedSignatureRef.current) {
      return;
    }

    const now = Date.now();
    const minInterval =
      streamStatus === "submitted" || streamStatus === "streaming" ? 2200 : 6000;
    if (now - lastPublishedAtRef.current < minInterval) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setThinking(true);
      try {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: "avatar.context",
              payload: request,
            }),
          );
        }
        lastPublishedSignatureRef.current = signature;
        lastPublishedAtRef.current = Date.now();
      } catch {
        // Avatar websocket failures should not affect the main chat flow.
      } finally {
        setThinking(false);
      }
    }, streamStatus === "submitted" || streamStatus === "streaming" ? 180 : 520);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    avatarDescription,
    avatarCapabilitiesSummary,
    avatarName,
    avatarPersonalityPrompt,
    avatarSystemPrompt,
    userBehaviorSummary,
    model,
    recentItems,
    streamStatus,
    threadId,
    threadTitle,
    workspaceLabel,
  ]);

  return { directive, thinking };
}
