import "server-only";

import type { RequestContext } from "@mastra/core/request-context";

export type TurnMode =
  | "default"
  | "image_analysis"
  | "retry_after_empty_turn"
  | "steer_active_turn"
  | "plan_only";

export type TurnModeSource =
  | "explicit_request_context"
  | "legacy_guide_mode"
  | "legacy_empty_turn_retry"
  | "image_input"
  | "fallback_default";

export type TurnModeState = {
  mode: TurnMode;
  source: TurnModeSource;
  priority: number;
  allowsExecution: boolean;
  allowsMutation: boolean;
  reason: string;
};

type TurnModeCandidate = {
  mode: TurnMode;
  source: TurnModeSource;
  priority: number;
  reason: string;
};

function getRequestContextString(requestContext: RequestContext, key: string) {
  const value = requestContext.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeTurnMode(value: string | undefined): TurnMode | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "default":
      return "default";
    case "image_analysis":
    case "image-analysis":
      return "image_analysis";
    case "retry_after_empty_turn":
    case "retry-after-empty-turn":
      return "retry_after_empty_turn";
    case "steer_active_turn":
    case "steer-active-turn":
    case "steer":
      return "steer_active_turn";
    case "plan_only":
    case "plan-only":
    case "plan":
      return "plan_only";
    default:
      return null;
  }
}

function buildTurnModeState(candidate: TurnModeCandidate): TurnModeState {
  switch (candidate.mode) {
    case "plan_only":
      return {
        ...candidate,
        allowsExecution: false,
        allowsMutation: false,
      };
    case "image_analysis":
      return {
        ...candidate,
        allowsExecution: true,
        allowsMutation: false,
      };
    case "retry_after_empty_turn":
      return {
        ...candidate,
        allowsExecution: true,
        allowsMutation: true,
      };
    case "steer_active_turn":
      return {
        ...candidate,
        allowsExecution: true,
        allowsMutation: true,
      };
    case "default":
    default:
      return {
        ...candidate,
        allowsExecution: true,
        allowsMutation: true,
      };
  }
}

export function resolveTurnModeState(requestContext: RequestContext): TurnModeState {
  const candidates: TurnModeCandidate[] = [];

  const explicitMode = normalizeTurnMode(getRequestContextString(requestContext, "turnMode"));
  if (explicitMode) {
    candidates.push({
      mode: explicitMode,
      source: "explicit_request_context",
      priority: 1000,
      reason: "An explicit turnMode was provided in request context.",
    });
  }

  const legacyGuideMode = getRequestContextString(requestContext, "guideMode");
  if (legacyGuideMode === "steer") {
    candidates.push({
      mode: "steer_active_turn",
      source: "legacy_guide_mode",
      priority: 800,
      reason: "Legacy guideMode=steer indicates explicit guidance for an active task.",
    });
  }

  const emptyTurnRetry = getRequestContextString(requestContext, "emptyTurnRetry");
  if (emptyTurnRetry === "1") {
    candidates.push({
      mode: "retry_after_empty_turn",
      source: "legacy_empty_turn_retry",
      priority: 600,
      reason: "Legacy emptyTurnRetry=1 indicates the previous attempt ended without useful progress.",
    });
  }

  const inputMode = getRequestContextString(requestContext, "inputMode");
  const currentTurnIncludesImages = getRequestContextString(
    requestContext,
    "currentTurnIncludesImages",
  );
  if (inputMode === "image-analysis" || currentTurnIncludesImages === "1") {
    candidates.push({
      mode: "image_analysis",
      source: "image_input",
      priority: 400,
      reason: "The current user turn includes image input and should begin in image analysis mode.",
    });
  }

  candidates.push({
    mode: "default",
    source: "fallback_default",
    priority: 0,
    reason: "No higher-priority mode condition matched, so the turn uses default request handling.",
  });

  candidates.sort((left, right) => right.priority - left.priority);
  return buildTurnModeState(candidates[0]!);
}

export function resolveTurnMode(requestContext: RequestContext): TurnMode {
  return resolveTurnModeState(requestContext).mode;
}

export function renderTurnModePolicy(args: {
  state: TurnModeState;
  guideText?: string;
}) {
  const header = [
    `Turn mode: ${args.state.mode}`,
    `- Source: ${args.state.source}`,
    `- Priority: ${args.state.priority}`,
    `- Allows execution: ${args.state.allowsExecution ? "yes" : "no"}`,
    `- Allows mutation: ${args.state.allowsMutation ? "yes" : "no"}`,
    `- Mode reason: ${args.state.reason}`,
  ];

  switch (args.state.mode) {
    case "steer_active_turn":
      return `${header.join("\n")}
- This input is explicit guidance for an already active task.
- Apply it immediately as a correction, preference, or constraint on the in-flight work.
- Keep the active task, but adjust its execution using the user's guidance.
- Do not reinterpret this as a brand new unrelated request.
${args.guideText ? `- Active guidance: ${args.guideText}` : ""}`.trim();
    case "retry_after_empty_turn":
      return `${header.join("\n")}
- The previous attempt stopped without concrete progress.
- This retry must begin with action, not acknowledgement or meta commentary.`.trim();
    case "image_analysis":
      return `${header.join("\n")}
- The current user turn includes one or more uploaded images.
- The primary task for this turn is to analyze the uploaded image, not the workspace.
- Resolve phrases like "this image", "this picture", or "analyze it" against the uploaded attachment.
- Treat the latest uploaded attachment in the current turn as the source of truth.
- Ignore earlier image discussions from the thread unless the user explicitly asks for comparison.
- Do not switch to repository, workspace, or project analysis unless the user explicitly asks for that.`.trim();
    case "plan_only":
      return `${header.join("\n")}
- This turn is in planning mode.
- Do not execute commands that mutate the project.
- Do not edit files or make stateful changes.
- Focus on analysis, planning, and decision-complete guidance only.`.trim();
    case "default":
    default:
      return `${header.join("\n")}
- Treat the current user message as the authoritative request for this turn.
- Use thread history as background context, not as the default task to continue.`.trim();
  }
}

export function renderTurnModeFeedback(state: TurnModeState, text: string) {
  return [
    `Turn mode feedback: ${state.mode}`,
    `- Source: ${state.source}`,
    `- Reason: ${state.reason}`,
    "",
    text.trim(),
  ].join("\n");
}
