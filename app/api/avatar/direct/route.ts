import { NextResponse } from "next/server";
import type { AvatarDirectorRequest } from "@/lib/avatar/types";
import { resolveAvatarDirective } from "@/lib/avatar/director";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as AvatarDirectorRequest | null;
  if (!payload?.threadId?.trim()) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }
  return NextResponse.json(await resolveAvatarDirective(payload));
}
