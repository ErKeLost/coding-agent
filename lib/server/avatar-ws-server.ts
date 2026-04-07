import "server-only";

import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import type { AvatarDirectorRequest, AvatarDirective } from "@/lib/avatar/types";
import { resolveAvatarDirective } from "@/lib/avatar/director";

const DEFAULT_AVATAR_WS_PORT =
  process.env.NODE_ENV === "production" ? 3457 : 0;
const AVATAR_WS_PORT = Number(process.env.AVATAR_WS_PORT ?? DEFAULT_AVATAR_WS_PORT);

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
        wss: WebSocketServer | null;
        httpServer: HttpServer | null;
        port: number;
        external?: boolean;
      }
    | undefined;
  var __avatarWsCleanupRegistered: boolean | undefined;
}

const send = (socket: WebSocket, payload: AvatarServerMessage) => {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

const getBoundPort = (server: HttpServer | null) => {
  const address = server?.address();
  if (address && typeof address === "object") {
    return (address as AddressInfo).port;
  }
  return AVATAR_WS_PORT || 3457;
};

const cleanupAvatarWsServer = () => {
  const server = globalThis.__avatarWsServer;
  if (!server) return;
  try {
    server.wss?.close();
    server.httpServer?.close();
  } catch {
    // Ignore cleanup failures during shutdown.
  } finally {
    globalThis.__avatarWsServer = undefined;
  }
};

const registerCleanupHandlers = () => {
  if (globalThis.__avatarWsCleanupRegistered) return;
  globalThis.__avatarWsCleanupRegistered = true;

  process.once("exit", cleanupAvatarWsServer);
  process.once("SIGINT", () => {
    cleanupAvatarWsServer();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    cleanupAvatarWsServer();
    process.exit(0);
  });
};

export function ensureAvatarWsServer() {
  if (globalThis.__avatarWsServer) {
    return globalThis.__avatarWsServer;
  }

  let httpServer: HttpServer | null = null;
  let wss: WebSocketServer | null = null;
  try {
    httpServer = createServer();
    wss = new WebSocketServer({ noServer: true });

    httpServer.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.warn(
          `[avatar-ws] Port ${AVATAR_WS_PORT} already in use, reusing existing websocket server.`,
        );
        globalThis.__avatarWsServer = {
          wss: null,
          httpServer: null,
          port: AVATAR_WS_PORT,
          external: true,
        };
        return;
      }
      console.error("[avatar-ws] failed to start server", error);
    });

    httpServer.on("upgrade", (request, socket, head) => {
      if (!wss) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (client) => {
        wss?.emit("connection", client, request);
      });
    });

    httpServer.listen(AVATAR_WS_PORT);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EADDRINUSE"
    ) {
      console.warn(
        `[avatar-ws] Port ${AVATAR_WS_PORT} already in use, reusing existing websocket server.`,
      );
      globalThis.__avatarWsServer = {
        wss: null,
        httpServer: null,
        port: AVATAR_WS_PORT,
        external: true,
      };
      return globalThis.__avatarWsServer;
    } else {
      throw error;
    }
  }

  registerCleanupHandlers();
  const resolvedPort = getBoundPort(httpServer);

  wss.on("connection", (socket: SocketWithState) => {
    send(socket, { type: "avatar.ready", port: resolvedPort });

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
          console.log(directive, "Resolved avatar directive");
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
    httpServer,
    port: resolvedPort,
  };

  return globalThis.__avatarWsServer;
}
