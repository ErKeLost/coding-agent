import "server-only";

import type { RequestContext } from "@mastra/core/request-context";
import type { TurnModeState } from "@/lib/server/turn-mode";

export type ExecutionPhase =
  | "planning"
  | "discovery"
  | "implementation"
  | "verification";

export type ExecutionPhaseSource =
  | "explicit_request_context"
  | "turn_mode_plan_only"
  | "turn_mode_image_analysis"
  | "verification_intent"
  | "discovery_intent"
  | "implementation_intent"
  | "fallback_implementation";

export type ExecutionPhaseState = {
  phase: ExecutionPhase;
  source: ExecutionPhaseSource;
  priority: number;
  reason: string;
};

type ExecutionPhaseCandidate = ExecutionPhaseState;

function getRequestContextString(requestContext: RequestContext, key: string) {
  const value = requestContext.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePhase(value: string | undefined): ExecutionPhase | null {
  if (!value) return null;
  switch (value.trim().toLowerCase()) {
    case "planning":
    case "plan":
      return "planning";
    case "discovery":
    case "discover":
    case "analysis":
      return "discovery";
    case "implementation":
    case "implement":
    case "build":
      return "implementation";
    case "verification":
    case "verify":
    case "validation":
      return "verification";
    default:
      return null;
  }
}

const matchesAny = (text: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(text));

function inferIntentPhase(currentInputText: string | undefined) {
  if (!currentInputText) return null;
  const text = currentInputText.trim().toLowerCase();
  if (!text) return null;

  if (
    matchesAny(text, [
      /\b(test|tests|lint|build|verify|verification|validate|validation|compile|compiles?)\b/,
      /\b为什么报错\b/,
      /\b跑一下\b/,
      /\b检查一下\b.*\b(报错|错误|构建|编译|测试|lint)\b/,
    ])
  ) {
    return {
      phase: "verification" as const,
      source: "verification_intent" as const,
      priority: 700,
      reason: "The current user turn explicitly asks for validation, checking, or error investigation.",
    };
  }

  if (
    matchesAny(text, [
      /\b(why|how|what|explain|analyze|analysis|compare|review)\b/,
      /[\u4e00-\u9fa5].*(为什么|怎么|分析|解释|对比|评审|看看)/,
    ]) &&
    !matchesAny(text, [
      /\b(create|build|implement|fix|add|update|rewrite|refactor|ship)\b/,
      /[\u4e00-\u9fa5].*(实现|修改|修复|新增|重构|改成|开始|优化)/,
    ])
  ) {
    return {
      phase: "discovery" as const,
      source: "discovery_intent" as const,
      priority: 500,
      reason: "The current user turn asks for explanation or analysis rather than direct implementation.",
    };
  }

  if (
    matchesAny(text, [
      /\b(create|build|implement|fix|add|update|rewrite|refactor|ship|code|patch)\b/,
      /[\u4e00-\u9fa5].*(实现|修改|修复|新增|重构|改成|开始|优化|直接做|落地)/,
    ])
  ) {
    return {
      phase: "implementation" as const,
      source: "implementation_intent" as const,
      priority: 600,
      reason: "The current user turn asks for concrete code changes or implementation work.",
    };
  }

  return null;
}

export function resolveExecutionPhaseState(args: {
  requestContext: RequestContext;
  turnModeState: TurnModeState;
}) {
  const { requestContext, turnModeState } = args;
  const candidates: ExecutionPhaseCandidate[] = [];

  const explicitPhase = normalizePhase(
    getRequestContextString(requestContext, "executionPhase"),
  );
  if (explicitPhase) {
    candidates.push({
      phase: explicitPhase,
      source: "explicit_request_context",
      priority: 1000,
      reason: "An explicit executionPhase was provided in request context.",
    });
  }

  if (turnModeState.mode === "plan_only") {
    candidates.push({
      phase: "planning",
      source: "turn_mode_plan_only",
      priority: 900,
      reason: "Turn mode is plan_only, so the execution phase must remain planning.",
    });
  }

  if (turnModeState.mode === "image_analysis") {
    candidates.push({
      phase: "discovery",
      source: "turn_mode_image_analysis",
      priority: 800,
      reason: "Image analysis starts in discovery because the first job is understanding the input.",
    });
  }

  const currentInputText = getRequestContextString(requestContext, "currentInputText");
  const intentPhase = inferIntentPhase(currentInputText);
  if (intentPhase) {
    candidates.push(intentPhase);
  }

  candidates.push({
    phase: "implementation",
    source: "fallback_implementation",
    priority: 0,
    reason: "This coding agent defaults to implementation bias when no higher-priority phase condition matched.",
  });

  candidates.sort((left, right) => right.priority - left.priority);
  return candidates[0]!;
}

export function renderExecutionPhasePolicy(state: ExecutionPhaseState) {
  const header = [
    `Execution phase: ${state.phase}`,
    `- Source: ${state.source}`,
    `- Priority: ${state.priority}`,
    `- Phase reason: ${state.reason}`,
  ];

  switch (state.phase) {
    case "planning":
      return `${header.join("\n")}
- Stay in planning mode.
- Do not implement or mutate files in this phase.
- Produce a concrete plan or decision-ready guidance.`.trim();
    case "discovery":
      return `${header.join("\n")}
- Focus on understanding the codebase, the request, or the error state.
- Keep exploration purposeful and concise.
- Switch to implementation once the target files and intended changes are clear.`.trim();
    case "verification":
      return `${header.join("\n")}
- Prioritize validation, reproduction, or error investigation.
- Run the smallest useful checks first, then broaden only if needed.
- If a fix is clearly required, keep the validation context in mind while implementing it.`.trim();
    case "implementation":
    default:
      return `${header.join("\n")}
- This turn is implementation-biased.
- Do brief discovery only as needed to identify the target files or constraints.
- Once the target is clear, move directly into edits and then verification.
- Do not keep re-opening the discovery phase unless new evidence requires it.`.trim();
  }
}
