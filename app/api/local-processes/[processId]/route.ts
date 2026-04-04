import { NextResponse } from "next/server";
import { stopManagedProcess } from "@/mastra/tools/local-process-manager";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { processId } = await params;

  try {
    const payload = await stopManagedProcess(processId);
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop local process";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
