import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { findProcessRecord, removeMissingProcessState } from "@/mastra/tools/local-process-registry";

export const runtime = "nodejs";

function tailText(text: string, lines: number) {
  return text.split(/\r?\n/).slice(-lines).join("\n").trim();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ processId: string }> }
) {
  const { processId } = await params;
  const { searchParams } = new URL(req.url);
  const lines = Number(searchParams.get("lines") ?? "80");

  try {
    const record = findProcessRecord(processId);
    if (!record) {
      return NextResponse.json({ error: "Process not found" }, { status: 404 });
    }

    const current = removeMissingProcessState(record);
    const output = current.logPath
      ? tailText(readFileSync(current.logPath, "utf8"), Number.isFinite(lines) ? lines : 80)
      : "";

    return NextResponse.json({
      processId: current.id,
      status: current.status,
      logPath: current.logPath,
      output,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read local process logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
