import { NextResponse } from "next/server";
import { findProcessRecord, removeMissingProcessState, updateProcessRecord } from "@/mastra/tools/local-process-registry";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { processId } = await params;

  try {
    const record = findProcessRecord(processId);
    if (!record) {
      return NextResponse.json({ error: "Process not found" }, { status: 404 });
    }

    const current = removeMissingProcessState(record);
    if (current.pid) {
      try {
        process.kill(current.pid, "SIGTERM");
      } catch {
        // Ignore missing process errors and still mark it stopped.
      }
    }

    const processRecord = updateProcessRecord(processId, { status: "stopped" }) ?? {
      ...current,
      status: "stopped" as const,
    };

    return NextResponse.json({ process: processRecord });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop local process";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
