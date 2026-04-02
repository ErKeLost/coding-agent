import type { ThreadSession, ThreadSessionState } from "@/lib/thread-session";

type ThreadLikeItem = {
  type?: unknown;
  role?: unknown;
  content?: unknown;
};

export type ExecutionStateSnapshot = {
  status: "idle" | "resumable";
  lastUserGoal?: string;
  pendingPlanTitle?: string;
  pendingPlanStep?: string;
  recentToolCount?: number;
  updatedAt?: number;
};

export type ContinuationContextSnapshot = ExecutionStateSnapshot & {
  isContinuation: boolean;
};

const normalizeText = (value: string) =>
  value.replace(/\s+/g, " ").trim().toLowerCase();

const normalizeComparable = (value: string) =>
  value.replace(/[\s，。、“”"'`~!！?？,.]+/g, "").trim().toLowerCase();

const toComparableContent = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;

  const text = value
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const typedPart = part as { text?: unknown; content?: unknown };
      return typeof typedPart.text === "string"
        ? typedPart.text
        : typeof typedPart.content === "string"
          ? typedPart.content
          : "";
    })
    .join("")
    .trim();

  return text || undefined;
};

export const extractCurrentInputText = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const entry = value[index];
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { role?: unknown; content?: unknown };
    if (record.role !== "user") continue;
    const text = toComparableContent(record.content);
    if (text) return text;
  }

  return undefined;
};

const getLastUserGoalFromItems = (
  items: unknown[] | undefined,
  currentInputText?: string
) => {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const currentComparable = currentInputText
    ? normalizeComparable(currentInputText)
    : undefined;

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || typeof item !== "object") continue;
    const record = item as ThreadLikeItem;
    if (record.type !== "message" || record.role !== "user") continue;
    const content = toComparableContent(record.content);
    if (!content) continue;
    if (currentComparable && normalizeComparable(content) === currentComparable) {
      continue;
    }
    return content;
  }

  return undefined;
};

const getPendingPlan = (state: ThreadSessionState) => {
  const plan = state.plan;
  if (!plan?.todos?.length) return undefined;
  const pendingStep = plan.todos.find(
    (todo) => todo.status !== "completed" && todo.status !== "cancelled"
  );
  if (!pendingStep) return undefined;
  return {
    title: plan.title,
    step: pendingStep.label,
  };
};

const countRecentToolItems = (items: unknown[] | undefined) => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items
    .slice(-12)
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as { type?: unknown };
      return record.type === "tool" || record.type === "agent" || record.type === "thinking";
    }).length;
};

const isLowInformationFollowup = (text?: string) => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 32) return false;
  if (trimmed.includes("\n") || trimmed.includes("```")) return false;
  if (/[?？]/.test(trimmed)) return false;

  const normalized = normalizeText(trimmed);
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 6) return false;

  return true;
};

export const inferExecutionState = (
  state: ThreadSessionState,
  currentInputText?: string
): ExecutionStateSnapshot => {
  const pendingPlan = getPendingPlan(state);
  const recentToolCount = countRecentToolItems(state.items);
  const hasWorkflowTrace = Boolean(state.graph?.steps?.length);
  const hasPreview = Boolean(state.previewUrl);
  const lastUserGoal = getLastUserGoalFromItems(state.items, currentInputText);
  const isResumable = Boolean(
    pendingPlan || recentToolCount > 0 || hasWorkflowTrace || hasPreview
  );

  return {
    status: isResumable ? "resumable" : "idle",
    lastUserGoal,
    pendingPlanTitle: pendingPlan?.title,
    pendingPlanStep: pendingPlan?.step,
    recentToolCount,
    updatedAt: Date.now(),
  };
};

export const inferContinuationContext = (
  session: ThreadSession | null,
  currentInputText?: string
): ContinuationContextSnapshot => {
  const execution = inferExecutionState(session?.state ?? {}, currentInputText);
  return {
    ...execution,
    isContinuation:
      execution.status === "resumable" && isLowInformationFollowup(currentInputText),
  };
};
