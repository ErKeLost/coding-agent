import "server-only";

import { WebSocketServer, type WebSocket } from "ws";
import type { AvatarDirectorRequest, AvatarDirective } from "@/lib/avatar/types";
import { resolveAvatarDirective } from "@/lib/avatar/director";

const AVATAR_WS_PORT = Number(process.env.AVATAR_WS_PORT ?? 3457);

type AvatarClientMessage =
  | {
      type: "avatar.context";
      payload: AvatarDirectorRequest;
    }
  | {
      type: "avatar.ping";
    };

type AvatarServerMessage =
  | {
      type: "avatar.ready";
      port: number;
    }
  | {
      type: "avatar.directive";
      payload: AvatarDirective;
    }
  | {
      type: "avatar.error";
      message: string;
    }
  | {
      type: "avatar.pong";
    };

type SocketWithState = WebSocket & {
  __avatarThreadId?: string;
};

declare global {
  var __avatarWsServer:
    | {
        wss: WebSocketServer;
        port: number;
      }
    | undefined;
}

const send = (socket: WebSocket, payload: AvatarServerMessage) => {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

export function ensureAvatarWsServer() {
  if (globalThis.__avatarWsServer) {
    return globalThis.__avatarWsServer;
  }

  const wss = new WebSocketServer({ port: AVATAR_WS_PORT });

  wss.on("connection", (socket: SocketWithState) => {
    send(socket, { type: "avatar.ready", port: AVATAR_WS_PORT });

    socket.on("message", async (raw) => {
      let parsed: AvatarClientMessage | null = null;
      try {
        parsed = JSON.parse(String(raw)) as AvatarClientMessage;
      } catch {
        send(socket, {
          type: "avatar.error",
          message: "Invalid avatar websocket payload",
        });
        return;
      }

      if (!parsed) return;

      if (parsed.type === "avatar.ping") {
        send(socket, { type: "avatar.pong" });
        return;
      }

      if (parsed.type === "avatar.context") {
        socket.__avatarThreadId = parsed.payload.threadId;
        try {
          const directive = await resolveAvatarDirective(parsed.payload);
          send(socket, {
            type: "avatar.directive",
            payload: directive,
          });
        } catch {
          send(socket, {
            type: "avatar.error",
            message: "Failed to resolve avatar directive",
          });
        }
      }
    });
  });

  globalThis.__avatarWsServer = {
    wss,
    port: AVATAR_WS_PORT,
  };

  return globalThis.__avatarWsServer;
}
