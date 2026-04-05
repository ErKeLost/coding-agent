import { NextResponse } from "next/server";
import { ensureAvatarWsServer } from "@/lib/server/avatar-ws-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const server = ensureAvatarWsServer();
  const url = new URL(request.url);
  const host = url.hostname || "localhost";
  const protocol = url.protocol === "https:" ? "wss" : "ws";

  return NextResponse.json({
    url: `${protocol}://${host}:${server.port}`,
  });
}
