import { NextResponse } from "next/server";
import { readManagedProcessLogs } from "@/mastra/tools/local-process-manager";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { processId } = await params;
  const { searchParams } = new URL(req.url);
  const lines = Number(searchParams.get("lines") ?? "80");
  const waitForMs = Number(searchParams.get("waitForMs") ?? "0");

  try {
    const payload = await readManagedProcessLogs(processId, {
      lines: Number.isFinite(lines) ? lines : 80,
      waitForMs: Number.isFinite(waitForMs) ? waitForMs : 0,
    });
    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read local process logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
