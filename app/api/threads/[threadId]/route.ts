import { NextResponse } from "next/server";
import { bindWorkspaceRootToThread } from "@/mastra/workspace/local-workspace";
import {
  deleteThreadSession,
  getThreadSession,
  upsertThreadSession,
} from "@/lib/server/thread-session-store";
import type { ThreadSessionState } from "@/lib/thread-session";

export const runtime = "nodejs";

type ThreadPatchRequest = {
  title?: string;
  subtitle?: string;
  state?: ThreadSessionState;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  try {
    const thread = await getThreadSession(threadId);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get thread session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  let payload: ThreadPatchRequest;
  try {
    payload = (await req.json()) as ThreadPatchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const thread = await upsertThreadSession({
      threadId,
      title: payload.title,
      subtitle: payload.subtitle,
      state: payload.state,
    });
    const persistedWorkspaceRoot =
      typeof thread?.state.workspaceRoot === "string" && thread.state.workspaceRoot.trim()
        ? thread.state.workspaceRoot.trim()
        : null;
    if (persistedWorkspaceRoot) {
      bindWorkspaceRootToThread(threadId, persistedWorkspaceRoot);
    }
    return NextResponse.json({ thread });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update thread session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;

  try {
    await deleteThreadSession(threadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete thread session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
