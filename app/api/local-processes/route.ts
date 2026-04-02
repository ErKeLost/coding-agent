import { NextResponse } from "next/server";
import { readProcessRegistry, removeMissingProcessState } from "@/mastra/tools/local-process-registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const processes = readProcessRegistry().map(removeMissingProcessState);
    return NextResponse.json({ processes });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list local processes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
