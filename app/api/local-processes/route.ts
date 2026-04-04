import { NextResponse } from "next/server";
import { listManagedProcesses } from "@/mastra/tools/local-process-manager";

export const runtime = "nodejs";

export async function GET() {
  try {
    const processes = listManagedProcesses();
    return NextResponse.json({ processes });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list local processes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
