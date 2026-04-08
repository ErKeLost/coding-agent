const LEGACY_CONTEXT_WINDOW_TOKENS = 300_000;

export const CONTEXT_WINDOW_TOKENS = LEGACY_CONTEXT_WINDOW_TOKENS;
export const CONTEXT_USAGE_RATIO = 0.6;
export const CONTEXT_LIMIT_TOKENS = Math.round(
  LEGACY_CONTEXT_WINDOW_TOKENS * CONTEXT_USAGE_RATIO,
);
export const CONTEXT_WARNING_RATIO = 0.72;
export const CONTEXT_COMPACT_RATIO = 0.82;
export const CONTEXT_CRITICAL_RATIO = 0.92;

export const CONTEXT_BASELINE_TOKENS = 12_000;
export const CONTEXT_TOOLS_RESERVE_TOKENS = 6_000;
export const CONTEXT_WORKING_MEMORY_RESERVE_TOKENS = 1_200;
export const CONTEXT_RECALL_RESERVE_TOKENS = 2_800;
export const CONTEXT_DEFAULT_RECENT_MESSAGES = 20;
export const CONTEXT_COMPACT_RECENT_MESSAGES = 8;
export const CONTEXT_CRITICAL_RECENT_MESSAGES = 6;

export type ContextPressureStatus =
  | "normal"
  | "warning"
  | "compact"
  | "critical";

export type ContextCompactionStrategy = "none" | "compact" | "critical";

export type ThreadCompactionState = {
  historicalFacts: string[];
  relevantFiles: string[];
  validationResults: string[];
  openRisks: string[];
  renderedSummary: string;
  sourceHash: string;
  sourceItemCount: number;
  preservedRecentMessages: number;
  updatedAt: number;
  strategy: Exclude<ContextCompactionStrategy, "none">;
  generatedBy: "model" | "fallback";
};

export type ContextBudgetConfig = {
  modelId?: string;
  profile:
    | "legacy"
    | "gpt-5-large"
    | "gpt-5-medium"
    | "claude-large"
    | "codex-large"
    | "qwen-large"
    | "gemini-large";
  rawWindowTokens: number;
  usableLimitTokens: number;
  warningThresholdTokens: number;
  compactThresholdTokens: number;
  criticalThresholdTokens: number;
  maxOutputTokens: number;
  safetyBufferTokens: number;
};

export type ThreadContextWindowState = {
  modelId?: string;
  budgetProfile: ContextBudgetConfig["profile"];
  rawWindowTokens: number;
  limitTokens: number;
  warningThresholdTokens: number;
  compactThresholdTokens: number;
  criticalThresholdTokens: number;
  estimatedPromptTokens: number;
  actualPromptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  percentage: number;
  status: ContextPressureStatus;
  source: "estimated" | "actual";
  updatedAt: number;
  baselineTokens: number;
  systemTokens: number;
  toolsTokens: number;
  workingMemoryTokens: number;
  recallReserveTokens: number;
  recentMessagesTokens: number;
  summaryTokens: number;
  currentInputTokens: number;
  summaryActive: boolean;
  preservedRecentMessages: number;
  compaction: ThreadCompactionState | null;
};

type ThreadLikeItem = {
  type?: unknown;
  role?: unknown;
  name?: unknown;
  status?: unknown;
  content?: unknown;
  args?: unknown;
  result?: unknown;
  errorText?: unknown;
  thinking?: unknown;
  steps?: Array<{
    step?: unknown;
    message?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  }> | unknown;
};

type BuildContextWindowStateArgs = {
  items?: unknown[];
  currentInputText?: string;
  systemPromptText?: string;
  compaction?: ThreadCompactionState | null;
  preservedRecentMessages?: number;
  actualPromptTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  modelId?: string;
};

const TOKEN_ESTIMATE_DIVISOR = 4;

const safeLower = (value?: string) => value?.trim().toLowerCase() ?? "";

const clampPercentage = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

export function estimateTokens(value: string | null | undefined): number {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / TOKEN_ESTIMATE_DIVISOR));
}

const stringifyUnknown = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyUnknown(entry)).filter(Boolean).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const normalized = stringifyUnknown(entry);
        return normalized ? `${key}: ${normalized}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const summarizeItem = (item: ThreadLikeItem): string => {
  const type = typeof item.type === "string" ? item.type : "unknown";
  if (type === "message") {
    const role = typeof item.role === "string" ? item.role : "unknown";
    return `${role}: ${stringifyUnknown(item.content)}`.trim();
  }
  if (type === "thinking") {
    return `thinking: ${stringifyUnknown(item.content)}`.trim();
  }
  if (type === "agent") {
    const name = typeof item.name === "string" ? item.name : "agent";
    const body = [stringifyUnknown(item.content), stringifyUnknown(item.thinking)]
      .filter(Boolean)
      .join("\n");
    return `${name}: ${body}`.trim();
  }
  if (type === "tool") {
    const name = typeof item.name === "string" ? item.name : "tool";
    const parts = [
      `tool ${name}`,
      stringifyUnknown(item.args),
      stringifyUnknown(item.result),
      stringifyUnknown(item.errorText),
      Array.isArray(item.steps)
        ? item.steps
            .map((step) =>
              [
                stringifyUnknown(step?.step),
                stringifyUnknown(step?.message),
                stringifyUnknown(step?.stdout),
                stringifyUnknown(step?.stderr),
              ]
                .filter(Boolean)
                .join("\n"),
            )
            .filter(Boolean)
            .join("\n")
        : "",
    ].filter(Boolean);
    return parts.join("\n").trim();
  }
  return stringifyUnknown(item);
};

export function estimateThreadItemsTokens(items: unknown[] | null | undefined): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((total, item) => total + estimateTokens(summarizeItem((item ?? {}) as ThreadLikeItem)), 0);
}

export function summarizeItemsTranscript(items: unknown[] | null | undefined): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) => summarizeItem((item ?? {}) as ThreadLikeItem).trim())
    .filter(Boolean)
    .join("\n\n");
}

const createBudget = (
  modelId: string | undefined,
  profile: ContextBudgetConfig["profile"],
  rawWindowTokens: number,
  usableLimitTokens: number,
  compactThresholdTokens: number,
  criticalThresholdTokens: number,
  maxOutputTokens: number,
): ContextBudgetConfig => {
  const warningThresholdTokens = Math.min(
    compactThresholdTokens - 1,
    Math.round(usableLimitTokens * 0.76),
  );
  return {
    modelId,
    profile,
    rawWindowTokens,
    usableLimitTokens,
    warningThresholdTokens,
    compactThresholdTokens,
    criticalThresholdTokens,
    maxOutputTokens,
    safetyBufferTokens: Math.max(8_000, rawWindowTokens - usableLimitTokens - maxOutputTokens),
  };
};

export function getContextBudgetConfig(modelId?: string): ContextBudgetConfig {
  const id = safeLower(modelId);

  if (id.includes("gpt-5.4-pro") || id.includes("gpt-5-pro")) {
    return createBudget(modelId, "gpt-5-large", 1_050_000, 820_000, 720_000, 790_000, 128_000);
  }

  if (
    id.includes("gpt-5.4") ||
    id.includes("gpt-5") ||
    id.includes("o3") ||
    id.includes("o4")
  ) {
    if (id.includes("nano")) {
      return createBudget(modelId, "gpt-5-medium", 400_000, 340_000, 280_000, 320_000, 64_000);
    }
    if (id.includes("mini")) {
      return createBudget(modelId, "gpt-5-medium", 400_000, 320_000, 250_000, 300_000, 64_000);
    }
    return createBudget(modelId, "gpt-5-large", 1_050_000, 780_000, 680_000, 750_000, 128_000);
  }

  if (id.includes("codex")) {
    return createBudget(modelId, "codex-large", 256_000, 196_000, 160_000, 184_000, 32_000);
  }

  if (id.includes("claude")) {
    return createBudget(modelId, "claude-large", 200_000, 160_000, 132_000, 148_000, 24_000);
  }

  if (id.includes("gemini")) {
    return createBudget(modelId, "gemini-large", 1_000_000, 700_000, 580_000, 650_000, 64_000);
  }

  if (id.includes("qwen")) {
    return createBudget(modelId, "qwen-large", 256_000, 180_000, 148_000, 166_000, 24_000);
  }

  return createBudget(
    modelId,
    "legacy",
    CONTEXT_WINDOW_TOKENS,
    CONTEXT_LIMIT_TOKENS,
    Math.round(CONTEXT_LIMIT_TOKENS * CONTEXT_COMPACT_RATIO),
    Math.round(CONTEXT_LIMIT_TOKENS * CONTEXT_CRITICAL_RATIO),
    24_000,
  );
}

const resolveStatusFromBudget = (
  promptTokens: number,
  budget: ContextBudgetConfig,
): ContextPressureStatus => {
  if (promptTokens >= budget.criticalThresholdTokens) return "critical";
  if (promptTokens >= budget.compactThresholdTokens) return "compact";
  if (promptTokens >= budget.warningThresholdTokens) return "warning";
  return "normal";
};

export function getContextPressureStatus(
  promptTokens: number,
  modelId?: string,
): ContextPressureStatus {
  return resolveStatusFromBudget(promptTokens, getContextBudgetConfig(modelId));
}

export function getCompactionStrategy(
  promptTokens: number,
  modelId?: string,
): ContextCompactionStrategy {
  const status = getContextPressureStatus(promptTokens, modelId);
  if (status === "critical") return "critical";
  if (status === "compact") return "compact";
  return "none";
}

export function buildContextWindowState(
  args: BuildContextWindowStateArgs,
): ThreadContextWindowState {
  const budget = getContextBudgetConfig(args.modelId);
  const summaryText = args.compaction?.renderedSummary ?? "";
  const summaryActive = Boolean(summaryText.trim());
  const preservedRecentMessages =
    args.preservedRecentMessages ??
    args.compaction?.preservedRecentMessages ??
    CONTEXT_DEFAULT_RECENT_MESSAGES;
  const items = Array.isArray(args.items) ? args.items : [];
  const recentItems =
    preservedRecentMessages > 0 ? items.slice(-preservedRecentMessages) : items;
  const recentMessagesTokens = estimateThreadItemsTokens(recentItems);
  const systemTokens = estimateTokens(args.systemPromptText);
  const currentInputTokens = estimateTokens(args.currentInputText);
  const summaryTokens = summaryActive ? estimateTokens(summaryText) : 0;

  const estimatedPromptTokens =
    CONTEXT_BASELINE_TOKENS +
    systemTokens +
    CONTEXT_TOOLS_RESERVE_TOKENS +
    CONTEXT_WORKING_MEMORY_RESERVE_TOKENS +
    CONTEXT_RECALL_RESERVE_TOKENS +
    recentMessagesTokens +
    summaryTokens +
    currentInputTokens;

  const actualPromptTokens =
    typeof args.actualPromptTokens === "number" && Number.isFinite(args.actualPromptTokens)
      ? Math.max(0, Math.round(args.actualPromptTokens))
      : undefined;
  const effectivePromptTokens = actualPromptTokens ?? estimatedPromptTokens;

  return {
    modelId: args.modelId,
    budgetProfile: budget.profile,
    rawWindowTokens: budget.rawWindowTokens,
    limitTokens: budget.usableLimitTokens,
    warningThresholdTokens: budget.warningThresholdTokens,
    compactThresholdTokens: budget.compactThresholdTokens,
    criticalThresholdTokens: budget.criticalThresholdTokens,
    estimatedPromptTokens,
    actualPromptTokens,
    outputTokens: args.outputTokens,
    totalTokens: args.totalTokens,
    percentage: clampPercentage(effectivePromptTokens / budget.usableLimitTokens),
    status: resolveStatusFromBudget(effectivePromptTokens, budget),
    source: actualPromptTokens !== undefined ? "actual" : "estimated",
    updatedAt: Date.now(),
    baselineTokens: CONTEXT_BASELINE_TOKENS,
    systemTokens,
    toolsTokens: CONTEXT_TOOLS_RESERVE_TOKENS,
    workingMemoryTokens: CONTEXT_WORKING_MEMORY_RESERVE_TOKENS,
    recallReserveTokens: CONTEXT_RECALL_RESERVE_TOKENS,
    recentMessagesTokens,
    summaryTokens,
    currentInputTokens,
    summaryActive,
    preservedRecentMessages,
    compaction: args.compaction ?? null,
  };
}

export function hashTranscript(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return `ctx_${Math.abs(hash).toString(36)}`;
}
