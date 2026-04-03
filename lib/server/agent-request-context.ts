import "server-only";

import { RequestContext } from "@mastra/core/request-context";
import {
  discoverSkills,
  loadMentionedSkills,
  renderEnabledSkillsInstructions,
  renderMentionedSkillsInstructions,
  renderSkillsInstructions,
  selectSkillsByMentionText,
  selectSkillsByIds,
} from "@/mastra/skills";
import {
  bindWorkspaceRootToThread,
  setActiveWorkspaceRoot,
} from "@/mastra/workspace/thread-workspace-root";
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

const currentTurnIncludesImageInput = (input: unknown) => {
  if (!Array.isArray(input)) {
    return false;
  }

  return input.some((message) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return false;
    }

    return content.some((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }

      const typedPart = part as {
        type?: unknown;
        mediaType?: unknown;
      };

      return (
        typedPart.type === "image" ||
        (typedPart.type === "file" &&
          typeof typedPart.mediaType === "string" &&
          typedPart.mediaType.startsWith("image/"))
      );
    });
  });
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

  if (effectiveWorkspaceRoot) {
    const discovery = await discoverSkills({
      workspaceRoot: effectiveWorkspaceRoot,
    });
    const skillsInstructions = renderSkillsInstructions(discovery.skills);
    if (skillsInstructions) {
      requestContext.set("skillsInstructions", skillsInstructions);
    }
    if (discovery.errors.length > 0) {
      requestContext.set("skillsLoadErrors", JSON.stringify(discovery.errors));
    }

    const enabledSkillIds = Array.isArray(threadSession?.state.extensions?.enabledSkillIds)
      ? threadSession?.state.extensions?.enabledSkillIds
      : [];
    const enabledSkills = selectSkillsByIds(discovery.skills, enabledSkillIds);
    const enabledSkillsInstructions = renderEnabledSkillsInstructions(enabledSkills);
    if (enabledSkillsInstructions) {
      requestContext.set("enabledSkillsInstructions", enabledSkillsInstructions);
      requestContext.set("enabledSkillIds", JSON.stringify(enabledSkillIds));
    }

    const currentInputText = extractCurrentInputText(payload.messages ?? payload.message);
    if (currentInputText) {
      const mentionedSkillMetadata = selectSkillsByMentionText(
        discovery.skills,
        currentInputText,
      );
      if (mentionedSkillMetadata.length > 0) {
        const mentionedSkills = await loadMentionedSkills(mentionedSkillMetadata);
        const mentionedSkillsInstructions = renderMentionedSkillsInstructions(
          mentionedSkills.loaded,
        );
        if (mentionedSkillsInstructions) {
          requestContext.set("mentionedSkillsInstructions", mentionedSkillsInstructions);
          requestContext.set(
            "mentionedSkillIds",
            JSON.stringify(mentionedSkillMetadata.map((skill) => skill.id)),
          );
        }
        if (mentionedSkills.errors.length > 0) {
          requestContext.set(
            "mentionedSkillsLoadErrors",
            JSON.stringify(mentionedSkills.errors),
          );
        }
      }
    }
  }

  const currentMessageText = extractCurrentInputText(payload.messages ?? payload.message);
  if (currentTurnIncludesImageInput(payload.messages)) {
    requestContext.set("currentTurnIncludesImages", "1");
  }
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
