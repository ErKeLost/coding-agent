import { NextResponse } from "next/server";
import { enqueueThreadSteer, peekThreadSteers } from "@/lib/server/steer-queue";

export const runtime = "nodejs";
const BUILD_AGENT_ID = "build-agent";

type SteerRequest = {
  threadId?: string;
  text?: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  let payload: SteerRequest;

  try {
    payload = (await req.json()) as SteerRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId } = await params;
  if (agentId !== BUILD_AGENT_ID) {
    return NextResponse.json({ error: `Agent not found: ${agentId}` }, { status: 404 });
  }

  const threadId = payload.threadId?.trim();
  const text = payload.text?.trim();
  if (!threadId || !text) {
    return NextResponse.json(
      { error: "threadId and text are required" },
      { status: 400 },
    );
  }

  const entry = enqueueThreadSteer(threadId, text);
  if (!entry) {
    return NextResponse.json(
      { error: "Failed to queue steer" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    steer: entry,
    pendingCount: peekThreadSteers(threadId).length,
  });
}