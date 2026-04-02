import { NextResponse } from "next/server";
import { listThreadSessions } from "@/lib/server/thread-session-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "24");

  try {
    const threads = await listThreadSessions(Number.isFinite(limit) ? limit : 24);
    return NextResponse.json({ threads });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list thread sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
