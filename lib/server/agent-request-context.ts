import "server-only";

import { RequestContext } from "@mastra/core/request-context";
import { bindWorkspaceRootToThread, setActiveWorkspaceRoot } from "@/mastra/workspace/local-workspace";
import { getThreadSession, upsertThreadSession } from "@/lib/server/thread-session-store";
import { extractCurrentInputText, inferContinuationContext } from "@/lib/continuation";
import type { ThreadSession } from "@/lib/thread-session";

type AgentRequestPayload = {
  threadId?: string;
  model?: string;
  messages?: unknown;
  message?: string;
  requestContext?: Record<string, unknown>;
};

export type BuiltAgentRequestContext = {
  requestContext: RequestContext;
  effectiveWorkspaceRoot: string | null;
  threadSession: ThreadSession | null;
};

const summarizeWorkspaceRoot = (value: string) => {
  const normalized = value.trim().replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
};

export async function buildAgentRequestContext(
  payload: AgentRequestPayload,
): Promise<BuiltAgentRequestContext> {
  const requestContext = new RequestContext();
  if (payload.requestContext && typeof payload.requestContext === "object") {
    for (const [key, value] of Object.entries(payload.requestContext)) {
      requestContext.set(key, value);
    }
  }

  if (payload.model) {
    requestContext.set("model", payload.model);
  }

  let threadSession: ThreadSession | null = null;
  if (payload.threadId) {
    requestContext.set("threadId", payload.threadId);
    requestContext.set("resourceId", "web");
    threadSession = await getThreadSession(payload.threadId);
  }

  if (payload.threadId && !requestContext.get("workspaceRoot")) {
    const persistedWorkspaceRoot =
      typeof threadSession?.state.workspaceRoot === "string" &&
      threadSession.state.workspaceRoot.trim()
        ? threadSession.state.workspaceRoot.trim()
        : undefined;
    if (persistedWorkspaceRoot) {
      requestContext.set("workspaceRoot", persistedWorkspaceRoot);
    }
  }

  const effectiveWorkspaceRoot =
    typeof requestContext.get("workspaceRoot") === "string"
      ? String(requestContext.get("workspaceRoot"))
      : null;

  if (payload.threadId && effectiveWorkspaceRoot) {
    await upsertThreadSession({
      threadId: payload.threadId,
      subtitle: summarizeWorkspaceRoot(effectiveWorkspaceRoot),
      state: {
        workspaceRoot: effectiveWorkspaceRoot,
      },
    });
    bindWorkspaceRootToThread(payload.threadId, effectiveWorkspaceRoot);
    setActiveWorkspaceRoot(effectiveWorkspaceRoot);
  }

  const currentMessageText = extractCurrentInputText(payload.messages ?? payload.message);
  const continuationContext = inferContinuationContext(threadSession, currentMessageText);
  if (continuationContext.isContinuation) {
    requestContext.set("continuationMode", "resume");
    if (continuationContext.lastUserGoal) {
      requestContext.set("continuationLastUserGoal", continuationContext.lastUserGoal);
    }
    if (continuationContext.pendingPlanTitle) {
      requestContext.set("continuationPlanTitle", continuationContext.pendingPlanTitle);
    }
    if (continuationContext.pendingPlanStep) {
      requestContext.set("continuationPlanStep", continuationContext.pendingPlanStep);
    }
  }

  return {
    requestContext,
    effectiveWorkspaceRoot,
    threadSession,
  };
}
