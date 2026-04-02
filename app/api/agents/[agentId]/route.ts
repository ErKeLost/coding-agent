import { NextResponse } from "next/server";
import { RequestContext } from "@mastra/core/request-context";
import { mastra } from "@/mastra";
import { getModelTuning } from "@/lib/model-tuning";

export const runtime = "nodejs";
const BUILD_AGENT_ID = "build-agent";

type AgentGenerateRequest = {
  message?: string;
  messages?: unknown;
  threadId?: string;
  model?: string;
  memory?: unknown;
  requestContext?: Record<string, unknown>;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  let payload: AgentGenerateRequest;

  try {
    payload = (await req.json()) as AgentGenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messageInput = payload.messages ?? payload.message;
  if (!messageInput) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const requestContext = new RequestContext();
  if (payload.requestContext && typeof payload.requestContext === "object") {
    for (const [key, value] of Object.entries(payload.requestContext)) {
      requestContext.set(key, value);
    }
  }
  if (payload.model) {
    requestContext.set("model", payload.model);
  }
  const tuning = getModelTuning(payload.model);

  const { agentId } = await params;
  if (agentId !== BUILD_AGENT_ID) {
    return NextResponse.json({ error: `Agent not found: ${agentId}` }, { status: 404 });
  }
  const agent = mastra.getAgentById(agentId);
  if (!agent) {
    return NextResponse.json({ error: `Agent not found: ${agentId}` }, { status: 404 });
  }
  type AgentGenerateInput = Parameters<typeof agent.generate>[0];
  try {
    const result = await agent.generate(messageInput as AgentGenerateInput, {
      requestContext,
      modelSettings: tuning.modelSettings,
      providerOptions: tuning.providerOptions,
      memory:
        payload.memory ??
        (payload.threadId
          ? {
              thread: { id: payload.threadId },
              resource: "web",
            }
          : undefined),
      abortSignal: req.signal,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mastra generate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
