"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getUsage } from "tokenlens";
import type { LanguageModelUsage } from "ai";
import type { FileUIPart } from "ai";
import { useParams, useRouter } from "next/navigation";
import { Icon } from "@iconify/react";

import {
  Conversation,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Image } from "@/components/ai-elements/image";
import { AppSidebar } from "@/components/app-sidebar";
import { BottomTerminalPanel } from "@/components/rovix/bottom-terminal-panel";
import { DiffFilePreview } from "@/components/rovix/diff-file-preview";
import { FileMentionTextarea } from "@/components/rovix/file-mention-textarea";
import { GitChangesDialog } from "@/components/rovix/git-changes-dialog";
import { ShikiFilePreview } from "@/components/rovix/shiki-file-preview";
import { WorkspaceSearchDialog } from "@/components/rovix/workspace-search-dialog";
import { WorkspaceHeaderBar } from "@/components/rovix/workspace/workspace-header-bar";
import { WorkspaceConversationPanel } from "@/components/rovix/workspace/workspace-conversation-panel";
import { WorkspaceComposerShell } from "@/components/rovix/workspace/workspace-composer-shell";
import { WorkspaceModelTerminalControls } from "@/components/rovix/workspace/workspace-model-terminal-controls";
import { WorkspacePageLayout } from "@/components/rovix/workspace/workspace-page-layout";
import { WorkspacePromptAttachments } from "@/components/rovix/workspace/workspace-prompt-attachments";
import { AvatarCornerWidget } from "@/components/avatar/avatar-corner-widget";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useWorkspaceShellStore } from "@/app/[id]/_stores/workspace-shell-store";
import {
  type DesktopWorkspaceNode,
  setStoredWorkspaceRoot,
} from "@/lib/desktop-workspace";
import { gooeyToast } from "goey-toast";

import { type ChatItem, type ToolStep } from "@/lib/stream-event-bus";
import { useDesktopWorkspace } from "@/hooks/use-desktop-workspace";
import { useThreadSession } from "@/hooks/use-thread-session";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { useAvatarDirector } from "@/hooks/use-avatar-director";

const formatRelativeUpdatedAt = (updatedAt: number) => {
  if (!updatedAt) return "workspace";
  const diffMs = Date.now() - updatedAt;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const summarizeQueuedSubmission = (submission: {
  text?: string;
  files?: Array<{ filename?: string | null } | null>;
}) => {
  if (submission.text?.trim()) return submission.text.trim();
  const firstFilename = submission.files?.find(
    (file) => file?.filename,
  )?.filename;
  if (firstFilename) return firstFilename;
  return "待发送消息";
};

const summarizeWorkspaceRoot = (value: string | null | undefined) => {
  if (typeof value !== "string" || !value.trim()) return "未选择目录";
  const normalized = value.trim().replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
};

const summarizeThreadTitle = (value?: string | null) => {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled thread";
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
};

const ThreadHistoryLoadingState = () => (
  <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-8">
    <Icon
      icon="solar:refresh-linear"
      className="size-5 animate-spin text-muted-foreground/70"
      aria-hidden="true"
    />
  </div>
);

const isPlanRecord = (
  value: unknown,
): value is {
  title: string;
  todos: Array<{
    id: string;
    label: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    description?: string;
  }>;
} => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.title === "string" && Array.isArray(record.todos);
};

const models = [
  {
    id: "openrouter/qwen/qwen3.6-plus:free",
    name: "Qwen 3.6 Plus (Free)",
    chef: "Qwen",
    chefSlug: "qwen",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/z-ai/glm-5v-turbo",
    name: "GLM-5V Turbo",
    chef: "Z.AI",
    chefSlug: "zai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/openai/gpt-5.4-mini",
    name: "GPT-5.4 mini",
    chef: "OpenAI",
    chefSlug: "openai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/openai/gpt-5.4-nano",
    name: "GPT-5.4 nano",
    chef: "OpenAI",
    chefSlug: "openai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/minimax/minimax-m2.7",
    name: "MiniMax 2.7",
    chef: "MiniMax",
    chefSlug: "minimax",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/google/gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash Lite (Preview)",
    chef: "Google",
    chefSlug: "google",
    providers: ["openrouter"],
  },
] as const;

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createThreadId = () =>
  `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_AGENT_ID = "build-agent";

type ParsedEvent = {
  event?: string;
  data: string;
};

const parseSseEvent = (raw: string): ParsedEvent | null => {
  const lines = raw.split("\n");
  const dataLines: string[] = [];
  let event: string | undefined;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) return null;

  return { event, data: dataLines.join("\n") };
};

const summarizeUiError = (value: string) => {
  try {
    const parsed = JSON.parse(value) as { message?: string; error?: string };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    // fall through
  }
  return value.split("\n")[0]?.trim() || "Request failed";
};

const getStepTone = (status: ToolStep["status"]) => {
  if (status === "done") return "text-emerald-700/80 dark:text-emerald-300/80";
  if (status === "error") return "text-destructive/80";
  return "text-amber-700/80 dark:text-amber-300/80";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown) =>
  typeof value === "string" ? value : undefined;

const getNumber = (value: unknown) =>
  typeof value === "number" ? value : undefined;

const toDisplayPath = (value: string) => value.replace(/^\/workspace\//, "");

const toDisplayLeaf = (value: string) => {
  const normalized = toDisplayPath(value).replace(/\/+$/, "");
  if (!normalized) return value;
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
};

const truncateText = (value: string, max = 80) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value;

const formatList = (items: string[], max = 3) => {
  if (items.length === 0) return "";
  const shown = items.slice(0, max).join(", ");
  const rest = items.length - max;
  return rest > 0 ? `${shown} +${rest}` : shown;
};

const extractPatchFiles = (patchText: string) => {
  const files = new Set<string>();
  const lines = patchText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("*** Update File: ") ||
      trimmed.startsWith("*** Add File: ") ||
      trimmed.startsWith("*** Delete File: ") ||
      trimmed.startsWith("*** Move to: ")
    ) {
      const raw = trimmed.replace(/^\*\*\* (Update File|Add File|Delete File|Move to):\s*/, "").trim();
      if (raw && raw !== "/dev/null") {
        files.add(raw.replace(/^[ab]\//, ""));
      }
      continue;
    }
    if (!trimmed.startsWith("+++ ") && !trimmed.startsWith("--- ")) continue;
    const raw = trimmed.slice(4).trim();
    if (!raw || raw === "/dev/null") continue;
    const cleaned = raw.replace(/^[ab]\//, "");
    files.add(cleaned);
  }
  return Array.from(files);
};

const getToolRawTextArg = (value: unknown, keys: string[]) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (!isRecord(value)) return undefined;

  for (const key of keys) {
    const direct = getString(value[key])?.trim();
    if (direct) return direct;
  }

  if (isRecord(value.input)) {
    for (const key of keys) {
      const nested = getString(value.input[key])?.trim();
      if (nested) return nested;
    }
  }

  if (isRecord(value.payload)) {
    for (const key of keys) {
      const nested = getString(value.payload[key])?.trim();
      if (nested) return nested;
    }
    if (isRecord(value.payload.input)) {
      for (const key of keys) {
        const nested = getString(value.payload.input[key])?.trim();
        if (nested) return nested;
      }
    }
  }

  return undefined;
};

const getPatchTextFromArgs = (value: unknown) =>
  getToolRawTextArg(value, ["patchText", "patch", "input", "text"]);

const getCommandTextFromArgs = (value: unknown) =>
  getToolRawTextArg(value, ["command", "cmd", "script"]);

const getPatchLineStats = (patchText: string) => {
  let additions = 0;
  let deletions = 0;

  for (const line of patchText.split("\n")) {
    if (
      !line ||
      line.startsWith("+++ ") ||
      line.startsWith("--- ") ||
      line.startsWith("@@") ||
      line.startsWith("*** ")
    ) {
      continue;
    }
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
};

const normalizeInlineText = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const getResultFileList = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const files = value
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!isRecord(entry)) return undefined;
      return (
        getString(entry.path) ??
        getString(entry.filePath) ??
        getString(entry.relativePath) ??
        getString(entry.file)
      );
    })
    .filter((entry): entry is string => Boolean(entry))
    .map(toDisplayPath);
  return Array.from(new Set(files));
};

const getToolExtraDetails = (item: Extract<ChatItem, { type: "tool" }>) => {
  const normalizedName = item.name.trim().toLowerCase();
  const args = getToolArgsRecord(item.args);
  const result = getToolResultRecord(item);
  const metadata = getToolResultMetadata(item);
  const details: string[] = [];

  if (normalizedName === "patch" || normalizedName === "apply_patch") {
    const patchText = getPatchTextFromArgs(item.args);
    const patchFiles = patchText
      ? extractPatchFiles(patchText).map(toDisplayPath)
      : [];
    const resultFiles = getResultFileList(result?.files);
    const metadataFiles = getResultFileList(metadata?.files);
    const changedFiles = getResultFileList(metadata?.changedFiles);
    const fallbackFiles =
      resultFiles.length > 0
        ? resultFiles
        : metadataFiles.length > 0
          ? metadataFiles
          : changedFiles;
    const files = patchFiles.length > 0 ? patchFiles : fallbackFiles;
    const patchStats = patchText ? getPatchLineStats(patchText) : null;
    if (files.length > 0 || patchStats) {
      const fileSummary =
        files.length > 0 ? formatList(files, 4) : "inline patch";
      const statSummary =
        patchStats && (patchStats.additions > 0 || patchStats.deletions > 0)
          ? ` | +${patchStats.additions} -${patchStats.deletions}`
          : "";
      details.push(`改动: ${fileSummary}${statSummary}`);
    }
  }

  const isRunTool =
    normalizedName === "runcommand" ||
    normalizedName === "bash" ||
    normalizedName === "exec_command" ||
    normalizedName === "unified_exec" ||
    normalizedName === "shell_command";
  if (isRunTool) {
    const command =
      getString(args?.command) ??
      getCommandTextFromArgs(item.args) ??
      getString(result?.command) ??
      getString(metadata?.command);
    const exitCode =
      getNumber(result?.exitCode) ??
      getNumber(metadata?.exitCode) ??
      getNumber(result?.code);
    if (command) {
      details.push(
        `运行: ${truncateText(normalizeInlineText(command), 88)}${
          exitCode !== undefined ? ` | exit ${exitCode}` : ""
        }`,
      );
    }

    const stepOutput = [...(item.steps ?? [])]
      .reverse()
      .map((step) => step.stderr ?? step.stdout)
      .find((entry) => typeof entry === "string" && entry.trim().length > 0);
    const output =
      getString(result?.stderr) ??
      getString(result?.stdout) ??
      getString(result?.output) ??
      stepOutput;
    if (output) {
      details.push(`输出: ${truncateText(normalizeInlineText(output), 96)}`);
    }
  }

  return details;
};

const getToolArgsRecord = (value: unknown) => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return getToolArgsRecord(parsed);
    } catch {
      return null;
    }
  }
  if (!isRecord(value)) return null;
  if (isRecord(value.input)) return value.input;
  if (isRecord(value.payload)) {
    const payload = value.payload;
    if (isRecord(payload.input)) return payload.input;
    return payload;
  }
  return value;
};

const getArgPathValue = (
  args: Record<string, unknown> | null,
  keys: string[],
) => {
  if (!args) return undefined;
  for (const key of keys) {
    const value = getString(args[key]);
    if (value) return value;
  }
  return undefined;
};

const isComputerUseTool = (toolName: string) =>
  toolName.toLowerCase().startsWith("computer_use_");

const TOOL_LABELS: Record<string, string> = {
  read: "read",
  list: "list",
  edit: "edit",
  write: "write",
  writefiles: "writeFiles",
  patch: "apply_patch",
  apply_patch: "apply_patch",
  replace: "replace",
  grep: "grep",
  glob: "glob",
  bash: "bash",
  runcommand: "runCommand",
  exec_command: "runCommand",
  unified_exec: "runCommand",
  write_stdin: "writeStdin",
  webfetch: "webFetch",
  websearch: "webSearch",
  codesearch: "codeSearch",
  todoread: "todoRead",
  todowrite: "todoWrite",
  startlocaldevserver: "startLocalDevServer",
  readlocalprocesslogs: "readLocalProcessLogs",
  stoplocalprocess: "stopLocalProcess",
  listlocalprocesses: "listLocalProcesses",
};

const GENERIC_TOOL_LABELS = new Set([
  "tool",
  "dynamic-tool",
  "unknown",
  "unnamed",
  "unnamed tool",
]);

const isGenericToolLabel = (toolName: string) =>
  GENERIC_TOOL_LABELS.has(toolName.trim().toLowerCase());

const inferGenericToolName = (
  item: Extract<ChatItem, { type: "tool" }>,
  args: Record<string, unknown> | null,
) => {
  if (isComputerUseTool(item.name)) return item.name;
  if (getString(args?.command)) return "runCommand";
  if (getString(args?.query)) return "webSearch";
  if (getString(args?.url)) return "webFetch";

  const filePath = getArgPathValue(args, [
    "file",
    "filePath",
    "filepath",
    "file_path",
    "pathname",
    "relativeFilePath",
    "relative_file_path",
    "relativePath",
    "relative_path",
    "filename",
    "target_file",
    "targetFile",
  ]);
  const path = getArgPathValue(args, [
    "path",
    "targetPath",
    "target_path",
    "relative_path",
  ]);

  if (getPatchTextFromArgs(args)) return "apply_patch";
  if (filePath && typeof args?.oldString === "string") return "edit";
  if (filePath && typeof args?.content === "string") return "write";
  if (filePath) return "read";
  if (path) return "list";
  return "tool";
};

const getToolResultRecord = (item: Extract<ChatItem, { type: "tool" }>) =>
  isRecord(item.result) ? item.result : null;

const getToolResultMetadata = (item: Extract<ChatItem, { type: "tool" }>) => {
  const result = getToolResultRecord(item);
  return result && isRecord(result.metadata) ? result.metadata : null;
};

const parsePatchedFilesFromOutput = (value?: string) => {
  if (!value) return [];
  const files = value
    .split("\n")
    .map((line) => line.trim())
    .flatMap((line) => {
      const prefixedMatch = line.match(/^[AMD]\s+(.+)$/);
      if (prefixedMatch) return [prefixedMatch[1]];
      const patchedMatch = line.match(/^Patched\s+(.+)$/i);
      if (patchedMatch) return [patchedMatch[1]];
      return [];
    })
    .map(toDisplayPath);
  return Array.from(new Set(files));
};

const isPatchToolItem = (item: Extract<ChatItem, { type: "tool" }>) => {
  const normalizedName = item.name.trim().toLowerCase();
  if (normalizedName === "apply_patch" || normalizedName === "patch") {
    return true;
  }

  if (getPatchTextFromArgs(item.args)) {
    return true;
  }

  const result = getToolResultRecord(item);
  const metadata = getToolResultMetadata(item);
  const metadataName =
    getString(metadata?.toolName) ??
    getString(metadata?.name) ??
    getString(result?.title);
  return metadataName?.trim().toLowerCase() === "apply_patch";
};

const getPatchFilesFromItem = (item: Extract<ChatItem, { type: "tool" }>) => {
  const patchText = getPatchTextFromArgs(item.args);
  const patchFiles = patchText
    ? extractPatchFiles(patchText).map(toDisplayPath)
    : [];
  const result = getToolResultRecord(item);
  const metadata = getToolResultMetadata(item);
  const resultFiles = getResultFileList(result?.files);
  const metadataFiles = getResultFileList(metadata?.files);
  const changedFiles = getResultFileList(metadata?.changedFiles);
  const outputFiles = parsePatchedFilesFromOutput(getString(result?.output));
  return patchFiles.length > 0
    ? patchFiles
    : resultFiles.length > 0
      ? resultFiles
      : metadataFiles.length > 0
        ? metadataFiles
        : changedFiles.length > 0
          ? changedFiles
          : outputFiles;
};

const getLanguageFromPath = (filePath?: string | null) => {
  if (!filePath) return "text";
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith(".diff") || normalized.endsWith(".patch"))
    return "diff";
  if (normalized.endsWith(".tsx")) return "tsx";
  if (normalized.endsWith(".ts")) return "typescript";
  if (normalized.endsWith(".jsx")) return "jsx";
  if (normalized.endsWith(".js")) return "javascript";
  if (normalized.endsWith(".json")) return "json";
  if (normalized.endsWith(".rs")) return "rust";
  if (normalized.endsWith(".py")) return "python";
  if (normalized.endsWith(".md")) return "markdown";
  if (normalized.endsWith(".css")) return "css";
  if (normalized.endsWith(".html")) return "html";
  if (normalized.endsWith(".vue")) return "vue";
  if (normalized.endsWith(".svelte")) return "svelte";
  if (normalized.endsWith(".yml") || normalized.endsWith(".yaml"))
    return "yaml";
  if (normalized.endsWith(".sh")) return "bash";
  if (normalized.endsWith(".sql")) return "sql";
  if (normalized.endsWith(".toml")) return "toml";
  return "text";
};

type ToolStandalonePreview =
  | {
      kind: "code";
      filename: string;
      language: string;
      code: string;
    }
  | {
      kind: "diff";
      filename: string;
      language: string;
      before: string;
      after: string;
    };

const getToolStandalonePreview = (
  item: Extract<ChatItem, { type: "tool" }>,
): ToolStandalonePreview | null => {
  const result = getToolResultRecord(item);
  const metadata = getToolResultMetadata(item);
  const patchText = getPatchTextFromArgs(item.args);

  if (isPatchToolItem(item)) {
    const files = getPatchFilesFromItem(item);
    const metadataDiff = getString(metadata?.diff);
    const outputText = getString(result?.output);
    const diffText = patchText ?? metadataDiff ?? outputText;
    if (!diffText) return null;
    return {
      kind: "code",
      filename: files[0] ?? "apply_patch.diff",
      language: "diff",
      code: diffText,
    };
  }

  if (!result) return null;

  const filePath =
    getString(metadata?.relativePath) ??
    getString(metadata?.filePath) ??
    getString(metadata?.filepath) ??
    getString(result.title);
  if (!filePath) return null;

  const language = getLanguageFromPath(filePath);
  const output = getString(result.output);
  const preview = getString(metadata?.preview);
  const before = getString(metadata?.before);
  const after = getString(metadata?.after);

  if (item.name === "read") {
    const code = preview ?? output;
    if (!code) return null;
    return {
      kind: "code",
      filename: filePath,
      language,
      code,
    };
  }

  if (
    (item.name === "edit" || item.name === "write") &&
    before !== undefined &&
    after !== undefined
  ) {
    return {
      kind: "diff",
      filename: filePath,
      language,
      before,
      after,
    };
  }

  return null;
};

const ToolResultPreview = ({ preview }: { preview: ToolStandalonePreview }) => {
  if (preview.kind === "code") {
    return (
      <ShikiFilePreview
        code={preview.code}
        filename={preview.filename}
        language={preview.language}
      />
    );
  }

  if (preview.kind === "diff") {
    return (
      <DiffFilePreview
        filename={preview.filename}
        language={preview.language}
        before={preview.before}
        after={preview.after}
      />
    );
  }

  return null;
};

const getToolResultText = (item: Extract<ChatItem, { type: "tool" }>) => {
  const result = getToolResultRecord(item);
  return getString(result?.output) ?? getString(result?.message) ?? null;
};

const renderToolDetail = (detail: string): ReactNode => {
  const patchMatch = /^改动:\s(.+?)(?:\s\|\s([+-]\d+)\s([+-]\d+))?$/.exec(detail);
  if (!patchMatch) {
    return detail;
  }

  const [, fileSummary, additions, deletions] = patchMatch;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold tracking-[0.08em] text-accent-foreground/80 uppercase">
        改动
      </span>
      <span className="rounded-full bg-accent/55 px-2 py-0.5 text-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-foreground)_10%,transparent)]">
        {fileSummary}
      </span>
      {additions ? (
        <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
          {additions}
        </span>
      ) : null}
      {deletions ? (
        <span className="rounded-full bg-rose-500/12 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
          {deletions}
        </span>
      ) : null}
    </span>
  );
};

const getVisibleToolName = (item: Extract<ChatItem, { type: "tool" }>) => {
  const args = getToolArgsRecord(item.args);
  const normalizedToolName = item.name.trim().toLowerCase();
  const explicitLabel = TOOL_LABELS[normalizedToolName];
  if (explicitLabel) return explicitLabel;

  if (!isGenericToolLabel(item.name)) return item.name;

  const inferredToolName = inferGenericToolName(item, args);
  if (inferredToolName !== "tool") {
    return TOOL_LABELS[inferredToolName.toLowerCase()] ?? inferredToolName;
  }

  const stepLabel = [...(item.steps ?? [])]
    .reverse()
    .map((step) => step.step.trim())
    .find((step) => {
      const normalized = step.toLowerCase();
      return (
        step &&
        normalized !== "step" &&
        normalized !== "log" &&
        normalized !== "done" &&
        normalized !== "complete" &&
        normalized !== "preview"
      );
    });
  if (stepLabel) return stepLabel;

  const metadata = getToolResultMetadata(item);
  const metadataToolName =
    getString(metadata?.toolName) ?? getString(metadata?.name);
  if (metadataToolName && !isGenericToolLabel(metadataToolName)) {
    return metadataToolName;
  }

  return "tool";
};

const formatCoordinatePair = (x?: number, y?: number) =>
  x === undefined || y === undefined ? null : `${x}, ${y}`;

const parseDataUrlAttachment = (value?: string) => {
  if (!value) return null;
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
};

const getComputerUseScreenshotPreview = (
  item: Extract<ChatItem, { type: "tool" }>,
) => {
  const metadata = getToolResultMetadata(item);
  const imageUrl =
    getString(metadata?.imageUrl) ?? getString(metadata?.publicUrl);
  if (imageUrl) {
    return { type: "url" as const, src: imageUrl };
  }

  const result = getToolResultRecord(item);
  const attachments = result?.attachments;
  if (!Array.isArray(attachments)) return null;

  for (const attachment of attachments) {
    if (!isRecord(attachment)) continue;
    const data = getString(attachment.data);
    const parsed = parseDataUrlAttachment(data);
    if (parsed?.mediaType.startsWith("image/")) {
      return { type: "base64" as const, ...parsed };
    }
  }

  return null;
};

const getComputerUseToolSummary = (
  item: Extract<ChatItem, { type: "tool" }>,
) => {
  const args = getToolArgsRecord(item.args);
  const metadata = getToolResultMetadata(item);
  const name = item.name.toLowerCase();

  if (name === "computer_use_screenshot") {
    const region = args && isRecord(args.region) ? args.region : null;
    if (region) {
      const x = getNumber(region.x);
      const y = getNumber(region.y);
      const width = getNumber(region.width);
      const height = getNumber(region.height);
      if (
        x !== undefined &&
        y !== undefined &&
        width !== undefined &&
        height !== undefined
      ) {
        return `region ${x},${y} ${width}x${height}`;
      }
    }
    return "desktop screenshot";
  }

  if (name === "computer_use_get_windows") {
    const count = getNumber(metadata?.count);
    return count !== undefined ? `${count} windows` : "window list";
  }

  if (name === "computer_use_display_info") {
    const displays = metadata?.displays;
    if (Array.isArray(displays)) {
      return `${displays.length} displays`;
    }
    return "display info";
  }

  if (name === "computer_use_mouse_click") {
    const x = getNumber(args?.x);
    const y = getNumber(args?.y);
    const button = getString(args?.button) ?? "left";
    const coords = formatCoordinatePair(x, y);
    return coords ? `${button} click @ ${coords}` : `${button} click`;
  }

  if (name === "computer_use_mouse_move") {
    const coords = formatCoordinatePair(getNumber(args?.x), getNumber(args?.y));
    return coords ? `move @ ${coords}` : "mouse move";
  }

  if (name === "computer_use_mouse_drag") {
    const start = formatCoordinatePair(
      getNumber(args?.startX),
      getNumber(args?.startY),
    );
    const end = formatCoordinatePair(
      getNumber(args?.endX),
      getNumber(args?.endY),
    );
    return start && end ? `${start} -> ${end}` : "mouse drag";
  }

  if (name === "computer_use_mouse_scroll") {
    const direction = getString(args?.direction);
    const amount = getNumber(args?.amount);
    return `${direction ?? "scroll"}${amount !== undefined ? ` ${amount}` : ""}`;
  }

  if (name === "computer_use_mouse_position") {
    const coords = formatCoordinatePair(
      getNumber(metadata?.x),
      getNumber(metadata?.y),
    );
    return coords ? `cursor @ ${coords}` : "cursor position";
  }

  if (name === "computer_use_keyboard_type") {
    const text = getString(args?.text);
    return text ? `type ${truncateText(text, 42)}` : "keyboard type";
  }

  if (name === "computer_use_keyboard_press") {
    const key = getString(args?.key);
    const modifiers = Array.isArray(args?.modifiers)
      ? args.modifiers.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    if (key) {
      return modifiers.length ? `${modifiers.join("+")}+${key}` : key;
    }
    return "keyboard press";
  }

  if (name === "computer_use_keyboard_hotkey") {
    const keys = getString(args?.keys);
    return keys ?? "hotkey";
  }

  if (
    name === "computer_use_process_status" ||
    name === "computer_use_restart_process"
  ) {
    return getString(args?.processName) ?? "process";
  }

  if (
    name === "computer_use_get_process_logs" ||
    name === "computer_use_get_process_errors"
  ) {
    const processName = getString(args?.processName);
    return processName ? `${processName} logs` : "process logs";
  }

  if (name === "computer_use_start" || name === "computer_use_status") {
    const status = getString(metadata?.status);
    return status ? `status ${status}` : "computer use";
  }

  return null;
};

const ComputerUseToolPreview = ({
  item,
}: {
  item: Extract<ChatItem, { type: "tool" }>;
}) => {
  if (!isComputerUseTool(item.name)) return null;

  const result = getToolResultRecord(item);
  const metadata = getToolResultMetadata(item);
  const output = getString(result?.output);
  const screenshot = getComputerUseScreenshotPreview(item);
  const windows = Array.isArray(metadata?.windows) ? metadata.windows : [];
  const displays = Array.isArray(metadata?.displays) ? metadata.displays : [];
  const primaryDisplay = isRecord(metadata?.primaryDisplay)
    ? metadata.primaryDisplay
    : null;
  const cursorPosition = isRecord(metadata?.cursorPosition)
    ? formatCoordinatePair(
        getNumber(metadata.cursorPosition.x),
        getNumber(metadata.cursorPosition.y),
      )
    : null;
  const toolName = item.name.toLowerCase();

  const icon = toolName.includes("screenshot") ? (
    <Icon icon="solar:camera-linear" className="size-3.5" aria-hidden="true" />
  ) : toolName.includes("keyboard") ? (
    <Icon
      icon="solar:keyboard-linear"
      className="size-3.5"
      aria-hidden="true"
    />
  ) : toolName.includes("window") ? (
    <Icon
      icon="solar:window-frame-linear"
      className="size-3.5"
      aria-hidden="true"
    />
  ) : toolName.includes("display") ? (
    <Icon icon="solar:monitor-linear" className="size-3.5" aria-hidden="true" />
  ) : (
    <Icon
      icon="solar:cursor-linear"
      className="size-3.5"
      aria-hidden="true"
    />
  );

  return (
    <div className="space-y-2">
      {(output || cursorPosition) && (
        <div className="flex items-center gap-2 rounded-xl border border-border/45 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground/70">
            {icon}
          </span>
          <div className="min-w-0">
            {output ? (
              <div className="truncate text-foreground/85">{output}</div>
            ) : null}
            {cursorPosition ? (
              <div className="text-muted-foreground/75">
                cursor {cursorPosition}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {screenshot ? (
        <div className="inline-block overflow-hidden rounded-lg border border-border/45 bg-background/70 shadow-sm">
          {screenshot.type === "url" ? (
            <img
              src={screenshot.src}
              alt="Desktop screenshot"
              className="block h-auto w-[220px] max-w-none rounded-none"
            />
          ) : (
            <Image
              base64={screenshot.base64}
              mediaType={screenshot.mediaType}
              alt="Desktop screenshot"
              className="block h-auto w-[220px] max-w-none rounded-none"
            />
          )}
        </div>
      ) : null}

      {windows.length > 0 ? (
        <div className="grid gap-1.5">
          {windows.slice(0, 6).map((window, index) => {
            if (!isRecord(window)) return null;
            const title = getString(window.title) ?? "(untitled)";
            const id = getString(window.id) ?? String(window.id ?? index);
            return (
              <div
                key={`${item.id}-window-${id}-${index}`}
                className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/15 px-3 py-2 text-[10px]"
              >
                <span className="truncate text-foreground/85">{title}</span>
                <span className="ml-3 shrink-0 font-mono text-muted-foreground/70">
                  {id}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {displays.length > 0 ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {displays.map((display, index) => {
            if (!isRecord(display)) return null;
            const width = getNumber(display.width);
            const height = getNumber(display.height);
            const x = getNumber(display.x) ?? 0;
            const y = getNumber(display.y) ?? 0;
            const active =
              display === primaryDisplay || display.isActive === true;
            return (
              <div
                key={`${item.id}-display-${index}`}
                className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2 text-[10px]"
              >
                <div className="flex items-center gap-2">
                  <Icon
                    icon="solar:monitor-linear"
                    className="size-3.5 text-foreground/65"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground/85">
                    {width && height
                      ? `${width}x${height}`
                      : `Display ${index + 1}`}
                  </span>
                  {active ? (
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-300">
                      Primary
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-muted-foreground/75">
                  origin {x}, {y}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const formatToolMeta = (item: Extract<ChatItem, { type: "tool" }>) => {
  const name = item.name;
  if (isPatchToolItem(item)) {
    const files = getPatchFilesFromItem(item);
    if (files.length > 0) {
      return formatList(files, 4);
    }
    const output = getString(getToolResultRecord(item)?.output);
    if (output?.trim() === "Patch applied with no file changes.") {
      return "未产生文件变更";
    }
    return "apply_patch";
  }

  const args = getToolArgsRecord(item.args);
  if (!args) return null;
  if (isComputerUseTool(name)) {
    return getComputerUseToolSummary(item);
  }
  const filePath = getArgPathValue(args, [
    "file",
    "filePath",
    "filepath",
    "file_path",
    "pathname",
    "relativeFilePath",
    "relative_file_path",
    "relativePath",
    "relative_path",
    "filename",
    "target_file",
    "targetFile",
  ]);
  const path = getArgPathValue(args, [
    "path",
    "targetPath",
    "target_path",
    "relative_path",
  ]);
  const pattern = getString(args.pattern);
  const query = getString(args.query);
  const command = getString(args.command);

  if (name === "write" && filePath) {
    return toDisplayLeaf(filePath);
  }
  if (name === "writeFiles") {
    const files = Array.isArray(args.files)
      ? args.files
          .map((entry) => (isRecord(entry) ? getString(entry.path) : undefined))
          .filter((entry): entry is string => Boolean(entry))
          .map(toDisplayPath)
      : [];
    return files.length ? formatList(files.map(toDisplayLeaf)) : null;
  }
  if (name === "read" && filePath) {
    return toDisplayLeaf(filePath);
  }
  if (name === "list") {
    return toDisplayPath(path ?? ".");
  }
  if (name === "glob" && pattern) {
    return `pattern: ${truncateText(pattern, 60)}${
      path ? ` | in ${toDisplayPath(path)}` : ""
    }`;
  }
  if (name === "grep" && pattern) {
    const include = getString(args.include);
    return `pattern: ${truncateText(pattern, 60)}${
      path ? ` | in ${toDisplayPath(path)}` : ""
    }${include ? ` | include ${include}` : ""}`;
  }
  if (name === "replace") {
    const files = Array.isArray(args.files)
      ? args.files
          .filter((entry): entry is string => typeof entry === "string")
          .map(toDisplayPath)
      : [];
    return `pattern: ${truncateText(pattern ?? "replace", 50)}${
      files.length ? ` | files: ${formatList(files)}` : ""
    }`;
  }
  if (name === "edit" && filePath) {
    const replaceAll = args.replaceAll ? " | replace all" : "";
    return `${toDisplayLeaf(filePath)}${replaceAll}`;
  }
  if (name === "patch") {
    const files = getPatchFilesFromItem(item);
    return files.length ? `files: ${formatList(files)}` : "apply_patch";
  }
  if (name === "runCommand" || name === "bash" || name === "shell_command") {
    return command ? `command: ${command}` : null;
  }
  if (name === "exec_command" || name === "unified_exec") {
    return command ? `command: ${command}` : "run command";
  }
  if (name === "write_stdin") {
    const sessionId = getString(args.sessionId);
    const input = getString(args.input);
    if (input) {
      return `stdin: ${truncateText(input.replace(/\s+/g, " ").trim(), 72)}`;
    }
    return sessionId ? `session: ${truncateText(sessionId, 48)}` : "stdin";
  }
  if (name === "startLocalDevServer") {
    const port = typeof args.port === "number" ? args.port : null;
    const workingDirectory = getArgPathValue(args, ["workingDirectory"]);
    return `${command ? `command: ${command}` : "start dev server"}${workingDirectory ? ` | in ${toDisplayPath(workingDirectory)}` : ""}${port ? ` | port ${port}` : ""}`;
  }
  if (name === "readLocalProcessLogs") {
    const processId = getString(args.processId);
    return processId
      ? `process: ${truncateText(processId, 48)}`
      : "read process logs";
  }
  if (name === "stopLocalProcess") {
    const processId = getString(args.processId);
    return processId
      ? `process: ${truncateText(processId, 48)}`
      : "stop process";
  }
  if (name === "listLocalProcesses") {
    return "local services";
  }
  if (name === "websearch" || name === "codesearch") {
    return query ? `query: ${truncateText(query, 80)}` : null;
  }
  if (name === "webfetch") {
    const url = getString(args.url);
    return url ? `url: ${truncateText(url, 80)}` : null;
  }
  if (name === "downloadFiles") {
    const paths = Array.isArray(args.paths)
      ? args.paths
          .filter((entry): entry is string => typeof entry === "string")
          .map(toDisplayPath)
      : [];
    return paths.length ? formatList(paths.map(toDisplayLeaf)) : null;
  }
  if (name === "mv") {
    const source = getString(args.source);
    const destination = getString(args.destination);
    if (source && destination) {
      return `from ${toDisplayPath(source)} -> ${toDisplayPath(destination)}`;
    }
  }
  if (name === "rm" && path) {
    const recursive = args.recursive ? " | recursive" : "";
    return `${toDisplayPath(path)}${recursive}`;
  }
  if (name === "mkdir" && path) {
    return toDisplayPath(path);
  }
  if (name === "chmod" && path) {
    return toDisplayPath(path);
  }
  if (name === "ast_grep_search") {
    const lang = getString(args.lang);
    const paths = Array.isArray(args.paths)
      ? args.paths
          .filter((entry): entry is string => typeof entry === "string")
          .map(toDisplayPath)
      : [];
    return `pattern: ${truncateText(pattern ?? "search", 50)}${
      lang ? ` | lang ${lang}` : ""
    }${paths.length ? ` | in ${formatList(paths)}` : ""}`;
  }
  if (name === "ast_grep_replace") {
    const lang = getString(args.lang);
    const rewrite = getString(args.rewrite);
    return `pattern: ${truncateText(pattern ?? "replace", 50)}${
      rewrite ? ` | rewrite ${truncateText(rewrite, 40)}` : ""
    }${lang ? ` | lang ${lang}` : ""}`;
  }

  if (filePath) return toDisplayLeaf(filePath);
  if (path) return toDisplayPath(path);
  if (query) return `query: ${truncateText(query, 80)}`;
  if (pattern) return `pattern: ${truncateText(pattern, 60)}`;
  if (command) return `command: ${command}`;
  return null;
};

const getToolDisplayTitle = (
  item: Extract<ChatItem, { type: "tool" }>,
  visibleToolName: string,
) => {
  if (isPatchToolItem(item)) {
    const files = getPatchFilesFromItem(item);
    return {
      primary: visibleToolName,
      secondary: files.length > 0 ? formatList(files, 4) : "补丁内容",
    };
  }

  const toolMeta = formatToolMeta(item);
  const pathTail = getToolPathTail(item);
  const detail = toolMeta ?? pathTail ?? null;
  const primary = visibleToolName;
  const secondary = detail && detail !== visibleToolName ? detail : null;
  return { primary, secondary };
};

type ActivityAction =
  | "browse"
  | "edit"
  | "run"
  | "search"
  | "plan"
  | "desktop"
  | "delegate"
  | "other";

const getToolAction = (toolName: string): ActivityAction => {
  const name = toolName.toLowerCase();
  if (
    name === "read" ||
    name === "list" ||
    name === "glob" ||
    name === "grep" ||
    name === "cat" ||
    name.startsWith("ast_grep")
  ) {
    return "browse";
  }
  if (
    name === "write" ||
    name === "writefiles" ||
    name === "edit" ||
    name === "patch" ||
    name === "apply_patch" ||
    name === "replace" ||
    name === "mv" ||
    name === "rm" ||
    name === "mkdir" ||
    name === "chmod"
  ) {
    return "edit";
  }
  if (
    name === "runcommand" ||
    name === "bash" ||
    name === "shell_command" ||
    name === "exec_command" ||
    name === "unified_exec" ||
    name === "write_stdin" ||
    name === "writestdin" ||
    name.includes("devserver")
  ) {
    return "run";
  }
  if (name.startsWith("computer_use_")) {
    return "desktop";
  }
  if (name === "websearch" || name === "webfetch" || name === "codesearch") {
    return "search";
  }
  if (name === "todowrite" || name === "todoread" || name.includes("plan")) {
    return "plan";
  }
  return "other";
};

const getActivityVerb = (
  action: ActivityAction,
  status: "pending" | "done" | "error",
  toolName?: string,
) => {
  const normalizedToolName = toolName?.trim().toLowerCase() ?? "";

  if (normalizedToolName === "apply_patch" || normalizedToolName === "patch") {
    if (status === "error") return "应用补丁失败";
    if (status === "done") return "已应用补丁";
    return "正在应用补丁";
  }

  const pendingVerb =
    normalizedToolName === "read" || normalizedToolName === "cat"
      ? "正在阅读"
      : normalizedToolName === "list" ||
          normalizedToolName === "glob" ||
          normalizedToolName === "grep"
        ? "正在浏览"
        : action === "browse"
          ? "正在浏览"
          : action === "edit"
            ? "正在编写"
            : action === "run"
              ? "正在运行"
              : action === "desktop"
                ? "正在操作桌面"
                : action === "search"
                  ? "正在搜索"
                  : action === "plan"
                    ? "正在规划"
                    : action === "delegate"
                      ? "正在委派"
                      : "正在处理";

  if (status === "error") {
    return pendingVerb.replace(/^正在/, "") + "失败";
  }

  if (status === "done") {
    if (normalizedToolName === "read" || normalizedToolName === "cat") {
      return "已阅读";
    }
    if (
      normalizedToolName === "write" ||
      normalizedToolName === "writefiles" ||
      normalizedToolName === "edit" ||
      normalizedToolName === "patch" ||
      normalizedToolName === "apply_patch" ||
      normalizedToolName === "replace" ||
      normalizedToolName === "mv" ||
      normalizedToolName === "mkdir" ||
      normalizedToolName === "chmod"
    ) {
      return "已编辑";
    }
    return pendingVerb.replace(/^正在/, "已");
  }

  return pendingVerb;
};

const getToolDisplayText = (
  displayTitle: { primary: string; secondary: string | null },
  visibleToolName: string,
) => {
  const normalizedToolName = visibleToolName.trim().toLowerCase();
  const isRunCommandTool =
    normalizedToolName === "runcommand" ||
    normalizedToolName === "bash" ||
    normalizedToolName === "shell_command" ||
    normalizedToolName === "exec_command" ||
    normalizedToolName === "unified_exec";

  if (isRunCommandTool && displayTitle.secondary) {
    const commandText = displayTitle.secondary.replace(/^command:\s*/i, "");
    return `${displayTitle.primary} ${commandText}`;
  }

  if (
    (normalizedToolName === "read" ||
      normalizedToolName === "cat" ||
      normalizedToolName === "list" ||
      normalizedToolName === "glob" ||
      normalizedToolName === "grep" ||
      normalizedToolName === "edit" ||
      normalizedToolName === "patch" ||
      normalizedToolName === "apply_patch" ||
      normalizedToolName === "write" ||
      normalizedToolName === "writefiles" ||
      normalizedToolName === "replace" ||
      normalizedToolName === "mv" ||
      normalizedToolName === "mkdir" ||
      normalizedToolName === "chmod" ||
      normalizedToolName === "write_stdin" ||
      normalizedToolName === "writestdin") &&
    displayTitle.secondary
  ) {
    return displayTitle.secondary;
  }

  return displayTitle.secondary
    ? `${displayTitle.primary} ${displayTitle.secondary}`
    : displayTitle.primary;
};

const getToolPathTail = (item: Extract<ChatItem, { type: "tool" }>) => {
  if (isComputerUseTool(item.name)) {
    return getComputerUseToolSummary(item);
  }
  const args = getToolArgsRecord(item.args);
  const result = isRecord(item.result) ? item.result : null;
  const resultMeta =
    result && isRecord(result.metadata) ? result.metadata : null;
  const resultTitle =
    getString(result?.title) ??
    getString(resultMeta?.title) ??
    getString(resultMeta?.name);
  const command = getString(args?.command);
  const query = getString(args?.query);
  const pattern = getString(args?.pattern);
  const url = getString(args?.url);

  const argFilePath = getArgPathValue(args, [
    "file",
    "filePath",
    "filepath",
    "file_path",
    "pathname",
    "relativeFilePath",
    "relative_file_path",
    "relativePath",
    "relative_path",
    "filename",
    "target_file",
    "targetFile",
  ]);
  const argPath = getArgPathValue(args, [
    "path",
    "pathname",
    "targetPath",
    "target_path",
    "relativeFilePath",
    "relative_file_path",
    "relative_path",
  ]);
  const argSource = getArgPathValue(args, [
    "source",
    "sourcePath",
    "source_path",
  ]);
  const argDest = getArgPathValue(args, [
    "destination",
    "destinationPath",
    "destination_path",
  ]);
  const argFiles =
    args && Array.isArray(args.files)
      ? args.files
          .map((entry) => {
            if (typeof entry === "string") return entry;
            if (isRecord(entry)) {
              return getString(entry.path) ?? getString(entry.filePath);
            }
            return undefined;
          })
          .filter((entry): entry is string => Boolean(entry))
      : [];
  const argPaths =
    args && Array.isArray(args.paths)
      ? args.paths.filter((entry): entry is string => typeof entry === "string")
      : [];
  const metaFilePath = resultMeta
    ? (getString(resultMeta.filePath) ??
      getString(resultMeta.file) ??
      getString(resultMeta.relativeFilePath))
    : undefined;
  const metaRelativePath = resultMeta
    ? (getString(resultMeta.relativePath) ??
      getString(resultMeta.relative_file_path))
    : undefined;
  const metaPath = resultMeta
    ? (getString(resultMeta.path) ?? getString(resultMeta.pathname))
    : undefined;

  const primary =
    argFilePath ??
    argPath ??
    metaFilePath ??
    metaRelativePath ??
    metaPath ??
    resultTitle;
  if (primary) return toDisplayPath(primary);
  if (argSource && argDest) {
    return `${toDisplayPath(argSource)} -> ${toDisplayPath(argDest)}`;
  }
  if (argFiles.length > 0) {
    return formatList(argFiles.map(toDisplayPath));
  }
  if (argPaths.length > 0) {
    return formatList(argPaths.map(toDisplayPath));
  }
  if (command) {
    return truncateText(command, 88);
  }
  if (query) {
    return truncateText(query, 88);
  }
  if (pattern) {
    return truncateText(pattern, 72);
  }
  if (url) {
    return truncateText(url, 88);
  }
  return null;
};

const getResultCount = (result: unknown) => {
  if (!isRecord(result)) return undefined;
  const metadata = isRecord(result.metadata) ? result.metadata : null;
  const directCount =
    typeof result.count === "number" ? result.count : undefined;
  const metadataCount =
    metadata && typeof metadata.count === "number" ? metadata.count : undefined;
  return metadataCount ?? directCount;
};

type ToolRunState =
  | "started"
  | "running"
  | "completed"
  | "failed"
  | "timed_out";

type RunInfo = {
  state?: ToolRunState;
  sessionId?: string;
  durationMs?: number;
};

const isToolRunState = (value: unknown): value is ToolRunState =>
  value === "started" ||
  value === "running" ||
  value === "completed" ||
  value === "failed" ||
  value === "timed_out";

const getRunInfo = (item: Extract<ChatItem, { type: "tool" }>): RunInfo => {
  const result = item.result;
  if (isRecord(result)) {
    const state = isToolRunState(result.state)
      ? result.state
      : isToolRunState(result.runState)
        ? result.runState
        : undefined;
    const sessionId = getString(result.sessionId);
    const durationMs =
      typeof result.executionTime === "number"
        ? result.executionTime
        : typeof result.startupDurationMs === "number"
          ? result.startupDurationMs
          : undefined;
    if (state || sessionId || durationMs !== undefined) {
      return { state, sessionId, durationMs };
    }
  }
  const latestStep = item.steps?.[item.steps.length - 1];
  return {
    state: latestStep?.runState,
    sessionId: latestStep?.sessionId,
    durationMs: latestStep?.durationMs,
  };
};

const formatUsageTokens = (value?: number) =>
  value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);

const formatUsageCost = (
  usage: LanguageModelUsage | undefined,
  modelId?: string,
  costUSD?: number,
) => {
  if (typeof costUSD === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(costUSD);
  }
  if (!usage || !modelId) return "—";
  const computedCostUSD = getUsage({
    modelId,
    usage: {
      input: usage.inputTokens ?? 0,
      output: usage.outputTokens ?? 0,
      cacheReads: usage.cachedInputTokens ?? 0,
      reasoningTokens: usage.reasoningTokens,
    },
  }).costUSD?.totalUSD;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(computedCostUSD ?? 0);
};

const dataUrlToGeneratedImage = (dataUrl: string, filename?: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const [, mediaType, base64] = match;
  return {
    mediaType,
    base64,
    alt: filename ?? "Uploaded image",
  };
};

type PreparedAttachment = {
  mediaType: string;
  dataUrl: string;
  filename?: string;
  previewImage?: ReturnType<typeof dataUrlToGeneratedImage>;
};

type QueuedSubmission = {
  id: string;
  text: string;
  files: FileUIPart[];
};

const blobUrlToDataUrl = async (url: string) => {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read attachment."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read attachment."));
    reader.readAsDataURL(blob);
  });
};

const prepareAttachmentForModel = async (
  file: FileUIPart,
): Promise<PreparedAttachment> => {
  const sourceDataUrl = file.url.startsWith("data:")
    ? file.url
    : await blobUrlToDataUrl(file.url);

  if (!file.mediaType.startsWith("image/")) {
    return {
      filename: file.filename,
      mediaType: file.mediaType,
      dataUrl: sourceDataUrl,
    };
  }

  return {
    filename: file.filename,
    mediaType: file.mediaType,
    dataUrl: sourceDataUrl,
    previewImage: dataUrlToGeneratedImage(sourceDataUrl, file.filename),
  };
};

const serializeItemsForThread = (items: ChatItem[]): ChatItem[] => {
  return items;
};

// ─── File tree components (Editor view) ───────────────────────────────────
type FileTreeNodeItemProps = {
  node: DesktopWorkspaceNode;
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  depth: number;
};

const FileTreeNodeItem = ({
  node,
  onSelectFile,
  selectedPath,
  depth,
}: FileTreeNodeItemProps) => {
  const [expanded, setExpanded] = useState(true);
  const indent = 8 + depth * 12;

  if (node.isDir) {
    return (
      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
          style={{ paddingLeft: `${indent}px` }}
          className="h-auto w-full justify-start gap-1.5 rounded px-0 py-1 pr-2 text-[11.5px] font-normal text-[#56657d] shadow-none transition-colors hover:bg-[#111c2e] hover:text-white"
        >
          <Icon
            icon="solar:alt-arrow-right-linear"
            className={cn(
              "size-2.5 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
            aria-hidden="true"
          />
          <Icon
            icon="solar:folder-with-files-linear"
            className="size-3 shrink-0 text-amber-500/70"
            aria-hidden="true"
          />
          {node.name}
        </Button>
        {expanded &&
          node.children.map((child: DesktopWorkspaceNode) => (
            <FileTreeNodeItem
              key={child.path}
              node={child}
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSelectFile(node.path)}
      style={{ paddingLeft: `${indent + 14}px` }}
      className={cn(
        "h-auto w-full justify-start gap-1.5 rounded px-0 py-1 pr-2 text-left text-[11.5px] font-normal shadow-none transition-colors",
        selectedPath === node.path
          ? "bg-[#1a2540] text-white"
          : "text-[#56657d] hover:text-white hover:bg-[#111c2e]",
      )}
    >
      <Icon
        icon="solar:file-code-linear"
        className="size-3 shrink-0 text-indigo-400/70"
        aria-hidden="true"
      />
      <span className="truncate">{node.name}</span>
    </Button>
  );
};

const ModelSelectorItemRow = ({
  model,
  selected,
  onSelect,
}: {
  model: (typeof models)[number];
  selected: boolean;
  onSelect: (id: string) => void;
}) => {
  return (
    <ModelSelectorItem
      value={model.id}
      onSelect={() => onSelect(model.id)}
      className="gap-2 rounded-xl px-3 py-2 text-[12px]"
    >
      <ModelSelectorLogo className="size-3.5" provider={model.chefSlug} />
      <ModelSelectorName className="text-[12px] font-medium">
        {model.name}
      </ModelSelectorName>
      <ModelSelectorLogoGroup className="mr-1 [&>img]:size-3.5">
        {model.providers.slice(0, 3).map((provider) => (
          <ModelSelectorLogo key={provider} provider={provider} />
        ))}
      </ModelSelectorLogoGroup>
      {selected ? (
        <Icon
          icon="solar:check-circle-linear"
          className="ml-auto size-3.5"
          aria-hidden="true"
        />
      ) : (
        <div className="ml-auto size-3.5" />
      )}
    </ModelSelectorItem>
  );
};

const CHAT_COLUMN_CLASS = "mx-auto w-full max-w-5xl px-6 md:px-8 xl:px-10";

const logWorkspaceDebug = (
  label: string,
  payload?: Record<string, unknown>,
) => {
  console.info(`[workspace-debug] ${label}`, payload ?? {});
};

export default function Home() {
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const model = useWorkspaceShellStore((state) => state.model);
  const setModel = useWorkspaceShellStore((state) => state.setModel);
  const modelDialogOpen = useWorkspaceShellStore(
    (state) => state.modelDialogOpen,
  );
  const setModelDialogOpen = useWorkspaceShellStore(
    (state) => state.setModelDialogOpen,
  );
  const reasoningOpenState = useWorkspaceShellStore(
    (state) => state.reasoningOpenState,
  );
  const setReasoningOpenState = useWorkspaceShellStore(
    (state) => state.setReasoningOpenState,
  );
  const resetReasoningOpenState = useWorkspaceShellStore(
    (state) => state.resetReasoningOpenState,
  );
  const gitDialogOpen = useWorkspaceShellStore((state) => state.gitDialogOpen);
  const setGitDialogOpen = useWorkspaceShellStore(
    (state) => state.setGitDialogOpen,
  );
  const terminalExpanded = useWorkspaceShellStore(
    (state) => state.terminalExpanded,
  );
  const setTerminalExpanded = useWorkspaceShellStore(
    (state) => state.setTerminalExpanded,
  );
  const [selectedAgent] = useState(DEFAULT_AGENT_ID);
  const previousThinkingStatusesRef = useRef<
    Record<string, "pending" | "done">
  >({});
  const params = useParams();
  const router = useRouter();
  const selectedModelData = models.find((m) => m.id === model);
  const modelChefs = useMemo(
    () => [...new Set(models.map((entry) => entry.chef))],
    [],
  );
  const [threadSessionError, setThreadSessionError] = useState<string | null>(
    null,
  );
  const [lastSubmittedMessage, setLastSubmittedMessage] =
    useState<PromptInputMessage | null>(null);
  const {
    items,
    setItems,
    plan,
    setPlan,
    setPreviewUrl,
    setPreviewLogs,
    threadId,
    recentThreads,
    setRecentThreads,
    workspaceRoot,
    setWorkspaceRoot,
    activeThreadRecord,
    isHydratingThread,
    mergeRecentThreads,
    handleNewThread: createThreadSession,
    handleSelectThread: selectThreadSession,
    handleDeleteThread: deleteThreadSession,
  } = useThreadSession({
    params,
    router,
    setError: setThreadSessionError,
    createThreadId,
    serializeItemsForThread,
    summarizeThreadTitle,
    summarizeWorkspaceRoot,
    logWorkspaceDebug,
    isPlanRecord,
  });
  const effectiveWorkspaceRoot =
    workspaceRoot ?? activeThreadRecord?.workspaceRoot ?? null;
  const activeWorkspaceLabel = summarizeWorkspaceRoot(effectiveWorkspaceRoot);
  const {
    status,
    error,
    guideState,
    queuedSubmissionPreview,
    handleSubmit,
    promoteQueuedSubmissionToGuide,
    handleStop,
    drainSubmissionQueue,
  } = useAgentStream({
    params,
    model,
    selectedAgent,
    selectedModelName: selectedModelData?.name,
    threadId,
    workspaceRoot,
    items,
    setItems,
    setRecentThreads,
    setPreviewUrl,
    setPreviewLogs,
    setPlan,
    summarizeThreadTitle,
    summarizeWorkspaceRoot,
    mergeRecentThreads,
    createId,
    parseSseEvent,
    prepareAttachmentForModel,
  });

  useEffect(() => {
    void drainSubmissionQueue();
  }, [drainSubmissionQueue]);

  useEffect(() => {
    const currentStatuses: Record<string, "pending" | "done"> = {};
    for (const item of items) {
      if (item.type !== "thinking") continue;
      currentStatuses[item.id] = item.status;
    }

    setReasoningOpenState((previous) => {
      const next = { ...previous };
      let changed = false;

      for (const id of Object.keys(currentStatuses)) {
        if (!(id in next)) {
          next[id] = false;
          changed = true;
        }
      }

      previousThinkingStatusesRef.current = currentStatuses;
      return changed ? next : previous;
    });
  }, [items]);

  const activeError = error ?? threadSessionError;
  const { directive: avatarDirective, thinking: avatarThinking } =
    useAvatarDirector({
      threadId,
      threadTitle: activeThreadRecord?.title ?? null,
      workspaceLabel: activeWorkspaceLabel,
      model,
      streamStatus: status,
      items,
    });

  useEffect(() => {
    if (!activeError) return;
    const summary = summarizeUiError(activeError);
    gooeyToast.error(`Request failed: ${summary}`, {
      borderColor: "#fca5a5",
      fillColor: "#fff5f5",
      spring: false,
      duration: 3600,
    });
  }, [activeError]);

  const activePlan = useMemo(() => {
    if (!plan?.todos?.length) return null;
    if (status !== "submitted" && status !== "streaming") return null;
    const remainingTodos = plan.todos.filter(
      (todo) => todo.status !== "completed" && todo.status !== "cancelled",
    );
    if (remainingTodos.length === 0) return null;
    return {
      id: `plan-${threadId || "thread"}`,
      title: plan.title,
      todos: plan.todos,
    };
  }, [plan, status, threadId]);

  const guideBanner = useMemo(() => {
    if (guideState === "queued") {
      return {
        tone: "pending" as const,
        text: "引导已挂起，等待当前流在下一次 step/iteration 边界注入。",
      };
    }

    return null;
  }, [guideState]);

  const canStartConversation = Boolean(threadId) && !isHydratingThread;
  const canSubmitChat = canStartConversation && Boolean(model);
  const shouldShowEmptyThreadHint =
    !canStartConversation && recentThreads.length === 0;
  const chatDisabledReason = canStartConversation
    ? null
    : "请先创建或选择一个线程，然后再开始对话。";

  const {
    isDesktopRuntime,
    desktopWorkspace,
    setDesktopWorkspace,
    workspaceSearchOpen,
    setWorkspaceSearchOpen,
    setEditorSelectedFile,
    workspaceBranches,
    setWorkspaceBranches,
    workspaceBranchLoading,
    handleOpenWorkspaceFile,
    handleChangeWorkspaceRoot,
    handleRefreshDesktopWorkspace,
    handleSwitchWorkspaceBranch,
    handlePushWorkspaceBranch,
    handleOpenWorkspaceTerminal,
  } = useDesktopWorkspace({
    hasMounted,
    recentThreadCount: recentThreads.length,
    workspaceRoot: effectiveWorkspaceRoot,
    currentThreadId: threadId || null,
    onNewThread: createThreadSession,
    setWorkspaceRoot,
    logWorkspaceDebug,
  });

  const resetThreadUiChrome = useCallback(() => {
    resetReasoningOpenState();
    previousThinkingStatusesRef.current = {};
    setThreadSessionError(null);
  }, [resetReasoningOpenState]);

  const handleNewThread = useCallback(
    (initialWorkspaceRoot?: string | null) => {
      resetThreadUiChrome();
      createThreadSession(initialWorkspaceRoot ?? effectiveWorkspaceRoot);
    },
    [createThreadSession, effectiveWorkspaceRoot, resetThreadUiChrome],
  );

  const handleSelectThread = useCallback(
    (nextThreadId: string) => {
      if (!nextThreadId || nextThreadId === threadId) return;
      resetThreadUiChrome();
      selectThreadSession(nextThreadId);
    },
    [resetThreadUiChrome, selectThreadSession, threadId],
  );

  const handleDeleteThread = useCallback(
    async (targetThreadId: string) => {
      if (!targetThreadId) return;
      const deletingLastActiveThread =
        threadId === targetThreadId &&
        recentThreads.filter((entry) => entry.id !== targetThreadId).length ===
          0;

      resetThreadUiChrome();
      await deleteThreadSession(targetThreadId);

      if (!deletingLastActiveThread) {
        return;
      }

      setDesktopWorkspace(null);
      setEditorSelectedFile(null);
      setWorkspaceBranches(null);
      setStoredWorkspaceRoot(null);
    },
    [
      deleteThreadSession,
      recentThreads,
      resetThreadUiChrome,
      setDesktopWorkspace,
      setEditorSelectedFile,
      setWorkspaceBranches,
      threadId,
    ],
  );

  const handleSelectEditorFile = handleOpenWorkspaceFile;
  const handleHeaderBranchChange = handleSwitchWorkspaceBranch;
  const handlePushWorkspace = handlePushWorkspaceBranch;
  const handleChatSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (!canStartConversation) {
        setThreadSessionError("请先创建或选择一个线程，然后再开始对话。");
        return;
      }

      if (!model) {
        setModelDialogOpen(true);
        setThreadSessionError("请先选择模型，然后再发送消息。");
        return;
      }

      setLastSubmittedMessage({
        text: message.text,
        files: message.files.map((file) => ({ ...file })),
      });

      await handleSubmit(message);
    },
    [canStartConversation, handleSubmit, model],
  );

  const handleSelectModel = useCallback((nextModel: string) => {
    setModel(nextModel);
    setModelDialogOpen(false);
  }, []);

  const handleCreateBranch = useCallback(async () => {
    if (!isDesktopRuntime) return;
    const branchName = window.prompt("新分支名称", "main");
    if (!branchName?.trim()) return;
    await handleHeaderBranchChange(branchName.trim());
  }, [handleHeaderBranchChange, isDesktopRuntime]);

  if (!hasMounted) {
    return null;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar
        currentThreadId={threadId}
        onNewThread={handleNewThread}
        onSelectThread={handleSelectThread}
        onDeleteThread={handleDeleteThread}
        onOpenWorkspace={handleChangeWorkspaceRoot}
        recentThreads={recentThreads}
        workspaceRoot={effectiveWorkspaceRoot}
      />
      <SidebarInset className="app-shell relative min-w-0 overflow-hidden border-l border-border/55 bg-transparent">
        <ModelSelector open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
          <ModelSelectorContent
            className="max-w-[430px] rounded-[22px]"
            title="选择模型"
          >
            <ModelSelectorInput placeholder="搜索模型..." />
            <ModelSelectorList className="max-h-[360px] px-1.5 py-1.5">
              <ModelSelectorEmpty>没有找到模型。</ModelSelectorEmpty>
              {modelChefs.map((chef) => (
                <ModelSelectorGroup key={chef} heading={chef}>
                  {models
                    .filter((entry) => entry.chef === chef)
                    .map((entry) => (
                      <ModelSelectorItemRow
                        key={entry.id}
                        model={entry}
                        selected={model === entry.id}
                        onSelect={handleSelectModel}
                      />
                    ))}
                </ModelSelectorGroup>
              ))}
            </ModelSelectorList>
          </ModelSelectorContent>
        </ModelSelector>
        <div className="app-shell flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent text-foreground">
          <main className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <WorkspacePageLayout
              terminalExpanded={terminalExpanded}
              header={
                <WorkspaceHeaderBar
                  chatColumnClassName={CHAT_COLUMN_CLASS}
                  title={activeThreadRecord?.title ?? "Untitled thread"}
                  workspaceLabel={activeWorkspaceLabel}
                  updatedLabel={
                    activeThreadRecord?.updatedAt
                      ? formatRelativeUpdatedAt(activeThreadRecord.updatedAt)
                      : "just now"
                  }
                  workspaceBranches={workspaceBranches}
                  workspaceBranchLoading={workspaceBranchLoading}
                  onOpenSearch={() => setWorkspaceSearchOpen(true)}
                  onSelectBranch={handleHeaderBranchChange}
                  onCreateBranch={handleCreateBranch}
                  onOpenGitDialog={() => setGitDialogOpen(true)}
                  onPushWorkspace={handlePushWorkspace}
                />
              }
              content={
                <WorkspaceConversationPanel
                  chatColumnClassName={CHAT_COLUMN_CLASS}
                >
                  {isHydratingThread ? (
                    <ThreadHistoryLoadingState />
                  ) : items.length === 0 ? (
                    <></>
                  ) : (
                    items.map((item, itemIndex) => {
                      if (item.type === "thinking") {
                        if (item.status === "done" && !item.content.trim()) {
                          return null;
                        }
                        return (
                          <div key={item.id} className="pl-0.5">
                            <Reasoning
                              isStreaming={item.status === "pending"}
                              open={reasoningOpenState[item.id] ?? false}
                              onOpenChange={(open) =>
                                setReasoningOpenState((previous) => ({
                                  ...previous,
                                  [item.id]: open,
                                }))
                              }
                              className="mt-0"
                            >
                              <ReasoningTrigger
                                className="min-h-0 border-0 bg-transparent px-0 py-0 text-[11px] font-normal text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground/80"
                                getThinkingMessage={(streaming) =>
                                  streaming ? "正在思考" : "已思考"
                                }
                              />
                              {item.content ? (
                                <ReasoningContent
                                  showDivider={false}
                                  className="mt-0.5 border-l border-border/35 px-0 py-0 pl-2.5 text-[11px] leading-5 text-muted-foreground shadow-none"
                                >
                                  {item.content}
                                </ReasoningContent>
                              ) : null}
                            </Reasoning>
                          </div>
                        );
                      }

                      if (item.type === "tool" && item.parentToolCallId) {
                        return null;
                      }

                      if (item.type === "agent") {
                        const childTools = items.filter(
                          (
                            entry,
                          ): entry is Extract<ChatItem, { type: "tool" }> =>
                            entry.type === "tool" &&
                            entry.parentToolCallId === item.parentToolCallId,
                        );
                        return (
                          <div key={item.id}>
                            <div
                              className={cn(
                                "app-tool-row rounded-[14px] px-3 py-2 text-[12px] leading-5 text-foreground/82",
                                item.status === "error" &&
                                  "text-destructive/90",
                              )}
                            >
                              <div className="min-w-0 truncate">
                                <span className="text-muted-foreground/82">
                                  {getActivityVerb("delegate", item.status)}
                                </span>{" "}
                                <span>{item.name}</span>
                                {childTools.length ? (
                                  <span className="text-muted-foreground/68">
                                    {" "}
                                    {childTools.length} 个工具
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (item.type === "tool") {
                        const visibleToolName = getVisibleToolName(item);
                        const displayTitle = getToolDisplayTitle(
                          item,
                          visibleToolName,
                        );
                        const action = getToolAction(visibleToolName);
                        const verb = getActivityVerb(
                          action,
                          item.status,
                          visibleToolName,
                        );
                        const displayText = getToolDisplayText(
                          displayTitle,
                          visibleToolName,
                        );
                        const extraDetails = getToolExtraDetails(item);
                        const resultText = getToolResultText(item);
                        const patchTool = isPatchToolItem(item);
                        const hasLaterActivity = items
                          .slice(itemIndex + 1)
                          .some(
                            (entry) =>
                              entry.type === "tool" ||
                              entry.type === "agent" ||
                              entry.type === "message",
                          );
                        const streamSettled =
                          status !== "submitted" && status !== "streaming";
                        const missingToolResult =
                          item.status === "pending" &&
                          (streamSettled || hasLaterActivity);
                        const displayVerb = missingToolResult
                          ? patchTool
                            ? "未收到补丁结果"
                            : "未收到工具结果"
                          : verb;
                        const preview =
                          item.status === "done" || patchTool
                            ? getToolStandalonePreview(item)
                            : null;
                        const normalizedToolName = visibleToolName
                          .trim()
                          .toLowerCase();
                        const previewEnabled =
                          ((item.status === "done" &&
                            (normalizedToolName === "read" ||
                              normalizedToolName === "cat" ||
                              normalizedToolName === "edit" ||
                              normalizedToolName === "write")) ||
                            patchTool) &&
                          Boolean(preview);
                        const showInlineResult =
                          item.status === "done" &&
                          Boolean(resultText) &&
                          normalizedToolName !== "read" &&
                          normalizedToolName !== "cat" &&
                          normalizedToolName !== "list" &&
                          normalizedToolName !== "glob" &&
                          normalizedToolName !== "grep" &&
                          !patchTool &&
                          !previewEnabled;
                        return (
                          <div key={item.id}>
                            {previewEnabled && preview ? (
                              <details
                                className="group"
                                open={patchTool && missingToolResult}
                              >
                                <summary
                                  className={cn(
                                    "app-tool-row list-none rounded-[11px] px-3 py-0.5 text-[12px] leading-5 text-foreground/82 hover:bg-transparent hover:border-transparent hover:shadow-none [&::-webkit-details-marker]:hidden",
                                    item.status === "error" &&
                                      "text-destructive/90",
                                    "cursor-pointer",
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="text-muted-foreground/82">
                                      {displayVerb}
                                    </span>
                                    <span className="font-mono text-foreground/88 truncate">
                                      {displayText}
                                    </span>
                                    <Icon
                                      icon="lucide:chevron-right"
                                      className="ml-0.5 size-3 shrink-0 text-muted-foreground/70 group-open:hidden"
                                      aria-hidden="true"
                                    />
                                    <Icon
                                      icon="lucide:chevron-down"
                                      className="ml-0.5 hidden size-3 shrink-0 text-muted-foreground/70 group-open:inline"
                                      aria-hidden="true"
                                    />
                                  </div>
                                  {item.errorText ? (
                                    <div className="pt-0.5 text-destructive/90">
                                      {item.errorText}
                                    </div>
                                  ) : null}
                                  {extraDetails.length > 0 ? (
                                    <div className="pt-0.5 text-[11px] leading-4 text-muted-foreground/74">
                                      {extraDetails.map((detail, index) => (
                                        <div
                                          key={`${item.id}-detail-${index}`}
                                          className="font-mono"
                                        >
                                          {renderToolDetail(detail)}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {missingToolResult ? (
                                    <div className="pt-1 text-[11px] leading-4 text-amber-700/80 dark:text-amber-300/80">
                                      流已结束，但没有收到这次工具调用的结构化结果事件。
                                    </div>
                                  ) : null}
                                </summary>
                                <div className="pt-0.5">
                                  <ToolResultPreview preview={preview} />
                                </div>
                              </details>
                            ) : (
                              <div
                                className={cn(
                                  "app-tool-row rounded-[11px] px-3 py-1.5 text-[12px] leading-5 text-foreground/82 hover:bg-transparent hover:border-transparent hover:shadow-none",
                                  item.status === "error" &&
                                    "text-destructive/90",
                                )}
                              >
                                <div className="min-w-0 truncate">
                                  <span className="text-muted-foreground/82">
                                    {displayVerb}
                                  </span>{" "}
                                  <span className="font-mono text-foreground/88">
                                    {displayText}
                                  </span>
                                  {item.errorText ? (
                                    <span className="text-destructive/90">
                                      {" "}
                                      {item.errorText}
                                    </span>
                                  ) : null}
                                </div>
                                {extraDetails.length > 0 ? (
                                  <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground/74">
                                    {extraDetails.map((detail, index) => (
                                      <div
                                        key={`${item.id}-detail-${index}`}
                                        className="font-mono"
                                      >
                                        {renderToolDetail(detail)}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                {showInlineResult ? (
                                  <div className="mt-1 text-[11px] leading-4 text-muted-foreground/74">
                                    {resultText}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <Message key={item.id} from={item.role}>
                          <MessageContent>
                            <MessageResponse>{item.content}</MessageResponse>
                            {item.images?.length ? (
                              <div className="grid gap-3 pt-2">
                                {item.images.map((img, index) => (
                                  <Image
                                    key={`${item.id}-${index}`}
                                    {...img}
                                    alt=""
                                  />
                                ))}
                              </div>
                            ) : null}
                            {item.role === "assistant" && item.usage ? (
                              <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/80">
                                <Badge
                                  variant="secondary"
                                  className="rounded-full border border-amber-200/70 bg-amber-50/80 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                                >
                                  In {formatUsageTokens(item.usage.inputTokens)}
                                </Badge>
                                <Badge
                                  variant="secondary"
                                  className="rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                                >
                                  Out{" "}
                                  {formatUsageTokens(item.usage.outputTokens)}
                                </Badge>
                                <Badge
                                  variant="secondary"
                                  className="rounded-full border border-stone-200/70 bg-stone-50/80 px-2 py-0.5 text-[10px] text-stone-700 dark:border-stone-700/60 dark:bg-stone-900/40 dark:text-stone-300"
                                >
                                  Total{" "}
                                  {formatUsageTokens(item.usage.totalTokens)}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground/80">
                                  Cost{" "}
                                  {formatUsageCost(
                                    item.usage,
                                    item.modelId,
                                    item.usageCostUSD,
                                  )}
                                </span>
                              </div>
                            ) : null}
                          </MessageContent>
                        </Message>
                      );
                    })
                  )}
                </WorkspaceConversationPanel>
              }
              composer={
                <WorkspaceComposerShell
                  chatColumnClassName={CHAT_COLUMN_CLASS}
                  activePlan={activePlan}
                  queuedSubmissionPreview={queuedSubmissionPreview}
                  queuedSubmissionSummary={
                    queuedSubmissionPreview
                      ? summarizeQueuedSubmission(queuedSubmissionPreview)
                      : null
                  }
                  guideBanner={guideBanner}
                  canStartConversation={canStartConversation}
                  onPromoteQueuedSubmissionToGuide={() =>
                    void promoteQueuedSubmissionToGuide()
                  }
                >
                  <PromptInput
                    className={cn(
                      "border-0 bg-transparent p-0 shadow-none",
                      activePlan || queuedSubmissionPreview || guideBanner
                        ? "rounded-none"
                        : "rounded-[16px]",
                    )}
                    globalDrop={canStartConversation}
                    multiple
                    onSubmit={handleChatSubmit}
                  >
                    <WorkspacePromptAttachments />
                    <PromptInputBody>
                      <FileMentionTextarea
                        workspaceTree={desktopWorkspace?.tree ?? []}
                        workspaceRoot={workspaceRoot}
                        lastSubmittedMessage={lastSubmittedMessage}
                        className="min-h-[64px] rounded-none border-0 bg-transparent px-5 py-3.5 text-[14px] leading-6 shadow-none focus-visible:ring-0"
                        placeholder={
                          canStartConversation || !shouldShowEmptyThreadHint
                            ? "输入 @ 选择文件或技能，然后继续描述你的需求"
                            : "请先创建或选择一个线程"
                        }
                        readOnly={!canStartConversation}
                      />
                    </PromptInputBody>
                    {shouldShowEmptyThreadHint ? (
                      <div className="border-border/35 border-t px-5 py-2.5 text-[12px] text-muted-foreground">
                        {chatDisabledReason}
                      </div>
                    ) : !model ? (
                      <div className="border-border/35 border-t px-5 py-2.5 text-[12px] text-muted-foreground">
                        请先选择模型，然后再发送消息。
                      </div>
                    ) : null}
                    <PromptInputFooter className="flex-wrap border-border/40 border-t bg-transparent px-5 py-2.5">
                      <WorkspaceModelTerminalControls
                        modelDialogOpen={modelDialogOpen}
                        onModelDialogOpenChange={setModelDialogOpen}
                        selectedModelData={selectedModelData ?? null}
                        terminalExpanded={terminalExpanded}
                        onToggleTerminal={() =>
                          setTerminalExpanded((value) => !value)
                        }
                      />
                      <PromptInputTools className="shrink-0 gap-2 max-sm:ml-auto">
                        <PromptInputActionMenu>
                          <PromptInputActionMenuTrigger
                            disabled={!canStartConversation}
                          />
                          <PromptInputActionMenuContent>
                            <PromptInputActionAddAttachments />
                          </PromptInputActionMenuContent>
                        </PromptInputActionMenu>
                      </PromptInputTools>
                      <PromptInputSubmit
                        className="app-control size-9 shrink-0 rounded-[10px] border-0 shadow-none"
                        disabled={!canSubmitChat && status !== "streaming"}
                        onStop={handleStop}
                        status={status}
                      />
                    </PromptInputFooter>
                  </PromptInput>
                </WorkspaceComposerShell>
              }
              terminal={
                <BottomTerminalPanel
                  workspaceRoot={effectiveWorkspaceRoot}
                  isDesktopRuntime={isDesktopRuntime}
                  onOpenSystemTerminal={handleOpenWorkspaceTerminal}
                  expanded={terminalExpanded}
                  onExpandedChange={setTerminalExpanded}
                />
              }
            />
          </main>
        </div>
        <GitChangesDialog
          open={gitDialogOpen}
          onOpenChange={setGitDialogOpen}
          workspaceRoot={effectiveWorkspaceRoot}
          branchState={workspaceBranches}
          onCommitComplete={async () => {
            setGitDialogOpen(false);
            await handleRefreshDesktopWorkspace();
          }}
          onPush={handlePushWorkspace}
        />
        <WorkspaceSearchDialog
          open={workspaceSearchOpen}
          onOpenChange={setWorkspaceSearchOpen}
          workspaceRoot={workspaceRoot}
          workspaceTree={desktopWorkspace?.tree ?? []}
          onSelectFile={(path) => {
            void handleSelectEditorFile(path);
          }}
        />
        <AvatarCornerWidget directive={avatarDirective} thinking={avatarThinking} />
      </SidebarInset>
    </SidebarProvider>
  );
}
