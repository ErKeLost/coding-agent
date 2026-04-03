import { NextResponse } from 'next/server';
import { getThreadSession, upsertThreadSession } from '@/lib/server/thread-session-store';

export const runtime = 'nodejs';

type ThreadSkillsPatchRequest = {
  enabledSkillIds?: string[];
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  try {
    const thread = await getThreadSession(threadId);
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json({
      enabledSkillIds: thread.state.extensions?.enabledSkillIds ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load thread skills';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const { threadId } = await params;

  let payload: ThreadSkillsPatchRequest;
  try {
    payload = (await req.json()) as ThreadSkillsPatchRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const enabledSkillIds = Array.isArray(payload.enabledSkillIds)
    ? payload.enabledSkillIds.filter((entry): entry is string => typeof entry === 'string')
    : [];

  try {
    const thread = await upsertThreadSession({
      threadId,
      state: {
        extensions: {
          enabledSkillIds,
        },
      },
    });
    return NextResponse.json({
      enabledSkillIds: thread?.state.extensions?.enabledSkillIds ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update thread skills';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}