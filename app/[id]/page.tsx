"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getUsage } from "tokenlens";
import type { LanguageModelUsage } from "ai";
import type { FileUIPart } from "ai";
import { useParams, useRouter } from "next/navigation";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
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
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
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
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Image } from "@/components/ai-elements/image";
import { Plan } from "@/components/tool-ui/plan";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandCenterDialog } from "@/components/rovix/command-center-dialog";
import { ShikiFilePreview } from "@/components/rovix/shiki-file-preview";
import { DiffFilePreview } from "@/components/rovix/diff-file-preview";
import { FileMentionTextarea } from "@/components/rovix/file-mention-textarea";
import { WorkspaceSearchDialog } from "@/components/rovix/workspace-search-dialog";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  commitWorkspaceChanges,
  getStoredWorkspaceRoot,
  getWorkspaceBranches,
  isTauriDesktop,
  loadDesktopWorkspace,
  pickWorkspaceDirectory,
  pushWorkspaceBranch,
  readDesktopWorkspaceFile,
  setStoredWorkspaceRoot,
  switchWorkspaceBranch,
  type DesktopWorkspaceFile,
  type DesktopWorkspaceNode,
  type DesktopWorkspacePayload,
  type WorkspaceBranchPayload,
} from "@/lib/desktop-workspace";
import {
  AppWindowIcon,
  BellIcon,
  BotIcon,
  CameraIcon,
  CornerDownLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  Code2Icon,
  ExternalLinkIcon,
  FileSearchIcon,
  FileCode2Icon,
  FlaskConicalIcon,
  FolderIcon,
  GitBranchIcon,
  KeyboardIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  MonitorIcon,
  MousePointer2Icon,
  PanelLeftIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  SquareTerminalIcon,
  StopCircleIcon,
  WandSparklesIcon,
  ZapIcon,
  PaperclipIcon,
  UploadIcon,
} from "lucide-react";
import { gooeyToast } from "goey-toast";

import {
  type ChatItem,
  type StreamPayload,
  type ToolStep,
  createStreamEventBus,
} from "@/lib/stream-event-bus";
import type { LocalProcessRecord } from "@/lib/local-process";
import type { ThreadRecord } from "@/lib/thread-session";
import {
  summarizeThreadTitle,
} from "@/lib/workflow-graph";

const SANDBOX_STORAGE_KEY_PREFIX = "chat-thread-sandbox:";
const RECENT_THREADS_STORAGE_KEY = "chat-recent-threads";
const PENDING_NEW_THREAD_STORAGE_KEY = "chat-pending-new-thread";

const getSandboxStorageKey = (threadId: string) =>
  `${SANDBOX_STORAGE_KEY_PREFIX}${threadId}`;

const mergeRecentThreads = (
  nextRecord: ThreadRecord,
  current: ThreadRecord[]
) => {
  return [nextRecord, ...current.filter((entry) => entry.id !== nextRecord.id)].slice(0, 16);
};

const clearThreadLocalState = (
  threadId: string | null,
  setSandboxId: (value: string | null) => void
) => {
  if (typeof window === "undefined" || !threadId) {
    setSandboxId(null);
    return;
  }

  try {
    window.localStorage.removeItem(getSandboxStorageKey(threadId));
  } catch {
    // Ignore storage cleanup errors.
  }

  setSandboxId(null);
};

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

const formatProcessUpdatedAt = (updatedAt: string) => {
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? formatRelativeUpdatedAt(parsed) : "just now";
};

const summarizeQueuedSubmission = (submission: QueuedSubmission) => {
  if (submission.text.trim()) return submission.text.trim();
  const firstFilename = submission.files.find((file) => file.filename)?.filename;
  if (firstFilename) return firstFilename;
  return "待发送消息";
};

const summarizeWorkspaceRoot = (value: string | null | undefined) => {
  if (typeof value !== "string" || !value.trim()) return "未选择目录";
  const normalized = value.trim().replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
};

const ThreadHistoryLoadingState = () => (
  <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-8">
    <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground/70" />
  </div>
);

const EmptyConversationState = () => (
  <ConversationEmptyState>
    <div className="flex h-full w-full items-center justify-center">
      <div className="app-soft-card flex size-16 items-center justify-center rounded-[20px] shadow-none">
        <SquareTerminalIcon className="size-6 text-cyan-500 dark:text-cyan-300" />
      </div>
    </div>
  </ConversationEmptyState>
);


const isPlanRecord = (
  value: unknown
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
    id: "kwaipilot/kat-coder-pro-v2",
    name: "KAT Coder Pro V2",
    chef: "KwaiPilot",
    chefSlug: "kwaipilot",
    providers: ["kwaipilot"],
  },
  {
    id: "openrouter/z-ai/glm-4.7",
    name: "GLM-4.7",
    chef: "Z.AI",
    chefSlug: "zai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/z-ai/glm-5",
    name: "GLM-5",
    chef: "Z.AI",
    chefSlug: "zai",
    providers: ["openrouter"],
  },
   {
    id: "openrouter/moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    chef: "Moonshot AI",
    chefSlug: "moonshotai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/x-ai/grok-code-fast-1",
    name: "grok",
    chef: "grok",
    chefSlug: "grok",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/qwen/qwen3-max",
    name: "qwen3-max",
    chef: "qwen",
    chefSlug: "qwen",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/qwen/qwen3-max-thinking",
    name: "qwen3-max-thinking",
    chef: "qwen",
    chefSlug: "qwen",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/qwen/qwen3-coder-next",
    name: "qwen3-coder-next",
    chef: "qwen",
    chefSlug: "qwen",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/qwen/qwen3.6-plus-preview:free",
    name: "qwen3.6-plus-preview:free",
    chef: "qwen",
    chefSlug: "qwen",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/xiaomi/mimo-v2-pro",
    name: "Mimo V2 Pro",
    chef: "Xiaomi",
    chefSlug: "xiaomi",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/z-ai/glm-4.7-flash",
    name: "GLM-4.7 Flash",
    chef: "Z.AI",
    chefSlug: "zai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/openai/gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    chef: "OpenAI",
    chefSlug: "openai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/openai/gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    chef: "OpenAI",
    chefSlug: "openai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    chef: "OpenAI",
    chefSlug: "openai",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/bytedance-seed/seed-2.0-mini",
    name: "Seed 2.0 Mini",
    chef: "ByteDance",
    chefSlug: "bytedance",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    chef: "Anthropic",
    chefSlug: "anthropic",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    chef: "Anthropic",
    chefSlug: "anthropic",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    chef: "Anthropic",
    chefSlug: "anthropic",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    chef: "Anthropic",
    chefSlug: "anthropic",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/minimax/minimax-m2.1",
    name: "minimax 2.1",
    chef: "MiniMax",
    chefSlug: "minimax",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/minimax/minimax-m2.5",
    name: "minimax 2.5",
    chef: "MiniMax",
    chefSlug: "minimax",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/minimax/minimax-m2.7",
    name: "minimax 2.7",
    chef: "MiniMax",
    chefSlug: "minimax",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/google/gemini-3-pro-preview",
    name: "Gemini 3 Pro (Preview)",
    chef: "Google",
    chefSlug: "google",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro (Preview)",
    chef: "Google",
    chefSlug: "google",
    providers: ["openrouter"],
  },
  {
    id: "openrouter/pony-alpha",
    name: "Pony Alpha",
    chef: "Pony",
    chefSlug: "pony",
    providers: ["openrouter"],
  },

];

const workspaceTabs = ["Main.py", "quantum_core.py", "test_harness.ts"];

const explorerSections = [
  {
    label: "Search",
    items: ["Find in workspace", "Symbol index"],
  },
  {
    label: "Chat",
    items: ["Active thread", "Queued prompts"],
  },
  {
    label: "Insights",
    items: ["Runtime health", "Usage"],
  },
];

const editorCodeLines = [
  "import numpy as np",
  "from qengine.compiler import QuantumCircuit",
  "",
  "class Main:",
  "    def __init__(self, backend: str = \"hybrid\") -> None:",
  "        self.backend = backend",
  "        self.circuit = QuantumCircuit(qubits=12)",
  "",
  "    def run_simulation(self, depth: int = 4) -> dict[str, float]:",
  "        entangled_state = self.circuit.prepare_entanglement(depth=depth)",
  "        optimized = self.circuit.optimize(entangled_state)",
  "        probabilities = np.abs(optimized.amplitudes) ** 2",
  "        return {",
  "            \"backend\": self.backend,",
  "            \"fidelity\": float(np.max(probabilities)),",
  "            \"entropy\": float(np.mean(probabilities) * depth),",
  "        }",
  "",
  "if __name__ == \"__main__\":",
  "    runtime = Main()",
  "    print(runtime.run_simulation(depth=6))",
];

const aiPromptSuggestions = ["Refactor", "Document"];

const centralNavItems = [
  { label: "Search", icon: SearchIcon, active: true },
  { label: "Chat", icon: MessageSquareTextIcon, active: false },
  { label: "Insights", icon: SparklesIcon, active: false },
  { label: "Settings", icon: Settings2Icon, active: false },
];

const commandActions = [
  {
    title: "Generate Unit Test",
    description: "Create Jest/Enzyme tests for Editor.tsx",
    icon: FlaskConicalIcon,
  },
  {
    title: "Refactor Code",
    description: "Simplify hooks and improve readability",
    icon: WandSparklesIcon,
  },
  {
    title: "Explain current file",
    description: "Get a summary of architecture and logic",
    icon: FileSearchIcon,
  },
];

const getCommentPrefix = (language: string) => {
  switch (language) {
    case "python":
    case "yaml":
    case "toml":
      return "#";
    case "html":
      return "<!--";
    default:
      return "//";
  }
};

const buildRefactorPreview = (content: string, language: string) => {
  const lines = content.split("\n");
  const commentPrefix = getCommentPrefix(language);
  const banner =
    commentPrefix === "<!--"
      ? "<!-- Rovix preview: extracted command palette action -->"
      : `${commentPrefix} Rovix preview: extracted command palette action`;

  const next = [...lines];
  next.unshift(banner, "");

  const firstLongLine = next.findIndex((line) => line.trim().length > 24);
  if (firstLongLine >= 0) {
    next[firstLongLine] = `${next[firstLongLine]} // reviewed`;
  }

  const insertionIndex = Math.min(next.length, 8);
  next.splice(
    insertionIndex,
    0,
    "",
    commentPrefix === "<!--"
      ? "<!-- ready for unit-test + explain flow -->"
      : `${commentPrefix} ready for unit-test + explain flow`
  );

  return next.join("\n");
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createThreadId = () =>
  `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const BUILD_AGENT_ID = "build-agent";
const DEFAULT_AGENT_ID = "build-agent";
const AGENTS = [
  { id: "network-agent", name: "Network Agent" },
  { id: "build-agent", name: "Build Agent" },
  { id: "explore-agent", name: "Explore Agent" },
  { id: "plan-agent", name: "Plan Agent" },
];

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

const toDisplayPath = (value: string) =>
  value.replace(/^\/workspace\//, "");

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
    if (!line.startsWith("+++ ") && !line.startsWith("--- ")) continue;
    const raw = line.slice(4).trim();
    if (!raw || raw === "/dev/null") continue;
    const cleaned = raw.replace(/^[ab]\//, "");
    files.add(cleaned);
  }
  return Array.from(files);
};

const getToolArgsRecord = (value: unknown) => {
  if (!isRecord(value)) return null;
  return isRecord(value.input) ? value.input : value;
};

const getArgPathValue = (
  args: Record<string, unknown> | null,
  keys: string[]
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

const GENERIC_TOOL_LABELS = new Set([
  "tool",
  "dynamic-tool",
  "unknown",
  "unnamed",
  "unnamed tool",
]);

const isGenericToolLabel = (toolName: string) =>
  GENERIC_TOOL_LABELS.has(toolName.trim().toLowerCase());

const getToolResultRecord = (item: Extract<ChatItem, { type: "tool" }>) =>
  isRecord(item.result) ? item.result : null;

const getToolResultMetadata = (item: Extract<ChatItem, { type: "tool" }>) => {
  const result = getToolResultRecord(item);
  return result && isRecord(result.metadata) ? result.metadata : null;
};

const getVisibleToolName = (item: Extract<ChatItem, { type: "tool" }>) => {
  if (!isGenericToolLabel(item.name)) return item.name;

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
    getString(metadata?.toolName) ??
    getString(metadata?.name) ??
    getString(metadata?.title);
  if (metadataToolName && !isGenericToolLabel(metadataToolName)) {
    return metadataToolName;
  }

  return "未命名工具";
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
  item: Extract<ChatItem, { type: "tool" }>
) => {
  const metadata = getToolResultMetadata(item);
  const imageUrl = getString(metadata?.imageUrl) ?? getString(metadata?.publicUrl);
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
  item: Extract<ChatItem, { type: "tool" }>
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
        return `区域截图 ${x},${y} ${width}x${height}`;
      }
    }
    return "桌面截图";
  }

  if (name === "computer_use_get_windows") {
    const count = getNumber(metadata?.count);
    return count !== undefined ? `窗口 ${count} 个` : "窗口列表";
  }

  if (name === "computer_use_display_info") {
    const displays = metadata?.displays;
    if (Array.isArray(displays)) {
      return `显示器 ${displays.length} 个`;
    }
    return "显示器信息";
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
      getNumber(args?.startY)
    );
    const end = formatCoordinatePair(
      getNumber(args?.endX),
      getNumber(args?.endY)
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
      getNumber(metadata?.y)
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
      ? args.modifiers.filter((entry): entry is string => typeof entry === "string")
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

  if (name === "computer_use_process_status" || name === "computer_use_restart_process") {
    return getString(args?.processName) ?? "process";
  }

  if (name === "computer_use_get_process_logs" || name === "computer_use_get_process_errors") {
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
        getNumber(metadata.cursorPosition.y)
      )
    : null;
  const toolName = item.name.toLowerCase();

  const icon =
    toolName.includes("screenshot") ? (
      <CameraIcon className="size-3.5" />
    ) : toolName.includes("keyboard") ? (
      <KeyboardIcon className="size-3.5" />
    ) : toolName.includes("window") ? (
      <AppWindowIcon className="size-3.5" />
    ) : toolName.includes("display") ? (
      <MonitorIcon className="size-3.5" />
    ) : (
      <MousePointer2Icon className="size-3.5" />
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
              <div className="text-muted-foreground/75">cursor {cursorPosition}</div>
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
            const active = display === primaryDisplay || display.isActive === true;
            return (
              <div
                key={`${item.id}-display-${index}`}
                className="rounded-xl border border-border/40 bg-muted/15 px-3 py-2 text-[10px]"
              >
                <div className="flex items-center gap-2">
                  <MonitorIcon className="size-3.5 text-foreground/65" />
                  <span className="font-medium text-foreground/85">
                    {width && height ? `${width}x${height}` : `Display ${index + 1}`}
                  </span>
                  {active ? (
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-300">
                      Primary
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-muted-foreground/75">origin {x}, {y}</div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const formatToolMeta = (item: Extract<ChatItem, { type: "tool" }>) => {
  const args = getToolArgsRecord(item.args);
  if (!args) return null;
  const name = item.name;
  if (isComputerUseTool(name)) {
    return getComputerUseToolSummary(item);
  }
  const filePath = getArgPathValue(args, [
    "filePath",
    "filepath",
    "file_path",
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
    return `file: ${toDisplayPath(filePath)}`;
  }
  if (name === "writeFiles") {
    const files = Array.isArray(args.files)
      ? args.files
        .map((entry) => (isRecord(entry) ? getString(entry.path) : undefined))
        .filter((entry): entry is string => Boolean(entry))
        .map(toDisplayPath)
      : [];
    return files.length ? `files: ${formatList(files)}` : null;
  }
  if (name === "read" && filePath) {
    const offset =
      typeof args.offset === "number" ? ` | offset ${args.offset}` : "";
    const limit =
      typeof args.limit === "number" ? ` | limit ${args.limit}` : "";
    return `file: ${toDisplayPath(filePath)}${offset}${limit}`;
  }
  if (name === "list") {
    return `path: ${toDisplayPath(path ?? ".")}`;
  }
  if (name === "glob" && pattern) {
    return `pattern: ${truncateText(pattern, 60)}${path ? ` | in ${toDisplayPath(path)}` : ""
      }`;
  }
  if (name === "grep" && pattern) {
    const include = getString(args.include);
    return `pattern: ${truncateText(pattern, 60)}${path ? ` | in ${toDisplayPath(path)}` : ""
      }${include ? ` | include ${include}` : ""}`;
  }
  if (name === "replace") {
    const files = Array.isArray(args.files)
      ? args.files
        .filter((entry): entry is string => typeof entry === "string")
        .map(toDisplayPath)
      : [];
    return `pattern: ${truncateText(pattern ?? "replace", 50)}${files.length ? ` | files: ${formatList(files)}` : ""
      }`;
  }
  if (name === "edit" && filePath) {
    const replaceAll = args.replaceAll ? " | replace all" : "";
    return `file: ${toDisplayPath(filePath)}${replaceAll}`;
  }
  if (name === "patch") {
    const patchText = getString(args.patchText);
    if (!patchText) return "patch";
    const files = extractPatchFiles(patchText).map(toDisplayPath);
    return files.length ? `patch: ${formatList(files)}` : "patch";
  }
  if (name === "runCommand" || name === "bash") {
    return command ? `cmd: ${truncateText(command, 80)}` : null;
  }
  if (name === "startLocalDevServer") {
    const port = typeof args.port === "number" ? args.port : null;
    const workingDirectory = getArgPathValue(args, ["workingDirectory"]);
    return `${command ? `cmd: ${truncateText(command, 60)}` : "start dev server"}${workingDirectory ? ` | in ${toDisplayPath(workingDirectory)}` : ""}${port ? ` | port ${port}` : ""}`;
  }
  if (name === "readLocalProcessLogs") {
    const processId = getString(args.processId);
    return processId ? `process: ${truncateText(processId, 48)}` : "read process logs";
  }
  if (name === "stopLocalProcess") {
    const processId = getString(args.processId);
    return processId ? `process: ${truncateText(processId, 48)}` : "stop process";
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
    return paths.length ? `paths: ${formatList(paths)}` : null;
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
    return `path: ${toDisplayPath(path)}${recursive}`;
  }
  if (name === "mkdir" && path) {
    return `path: ${toDisplayPath(path)}`;
  }
  if (name === "chmod" && path) {
    return `path: ${toDisplayPath(path)}`;
  }
  if (name === "ast_grep_search") {
    const lang = getString(args.lang);
    const paths = Array.isArray(args.paths)
      ? args.paths
        .filter((entry): entry is string => typeof entry === "string")
        .map(toDisplayPath)
      : [];
    return `pattern: ${truncateText(pattern ?? "search", 50)}${lang ? ` | lang ${lang}` : ""
      }${paths.length ? ` | in ${formatList(paths)}` : ""}`;
  }
  if (name === "ast_grep_replace") {
    const lang = getString(args.lang);
    const rewrite = getString(args.rewrite);
    return `pattern: ${truncateText(pattern ?? "replace", 50)}${rewrite ? ` | rewrite ${truncateText(rewrite, 40)}` : ""
      }${lang ? ` | lang ${lang}` : ""}`;
  }

  if (filePath) return `file: ${toDisplayPath(filePath)}`;
  if (path) return `path: ${toDisplayPath(path)}`;
  if (query) return `query: ${truncateText(query, 80)}`;
  if (pattern) return `pattern: ${truncateText(pattern, 60)}`;
  if (command) return `cmd: ${truncateText(command, 80)}`;
  return null;
};

const getToolDisplayTitle = (
  item: Extract<ChatItem, { type: "tool" }>,
  visibleToolName: string
) => {
  const toolMeta = formatToolMeta(item);
  const metaText = cleanMetaForActivity(toolMeta);
  const pathTail = getToolPathTail(item);
  const detail = pathTail ?? metaText;
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
    name === "replace" ||
    name === "mv" ||
    name === "rm" ||
    name === "mkdir" ||
    name === "chmod"
  ) {
    return "edit";
  }
  if (name === "runcommand" || name === "bash" || name.includes("devserver")) {
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
  status: "pending" | "done" | "error"
) => {
  const verb =
    action === "browse"
      ? "浏览"
      : action === "edit"
        ? "编辑"
          : action === "run"
            ? "运行"
            : action === "desktop"
              ? "操作桌面"
            : action === "search"
              ? "搜索"
            : action === "plan"
              ? "计划"
              : action === "delegate"
                ? "委托"
                : "处理";
  if (status === "pending") return `正在${verb}`;
  if (status === "done") return `已${verb}`;
  return `${verb}失败`;
};

const cleanMetaForActivity = (meta: string | null) =>
  (meta ?? "")
    .replace(
      /^(file|files|path|pattern|query|cmd|url|patch|from)\s*:\s*/i,
      ""
    )
    .trim();

const getToolPathTail = (item: Extract<ChatItem, { type: "tool" }>) => {
  if (isComputerUseTool(item.name)) {
    return getComputerUseToolSummary(item);
  }
  const args = getToolArgsRecord(item.args);
  const result = isRecord(item.result) ? item.result : null;
  const resultMeta = result && isRecord(result.metadata) ? result.metadata : null;
  const resultTitle =
    getString(result?.title) ??
    getString(resultMeta?.title) ??
    getString(resultMeta?.name);
  const command = getString(args?.command);
  const query = getString(args?.query);
  const pattern = getString(args?.pattern);
  const url = getString(args?.url);

  const argFilePath = getArgPathValue(args, [
    "filePath",
    "filepath",
    "file_path",
    "filename",
    "target_file",
    "targetFile",
  ]);
  const argPath = getArgPathValue(args, [
    "path",
    "targetPath",
    "target_path",
    "relative_path",
  ]);
  const argSource = getArgPathValue(args, ["source", "sourcePath", "source_path"]);
  const argDest = getArgPathValue(args, [
    "destination",
    "destinationPath",
    "destination_path",
  ]);
  const argFiles =
    args && Array.isArray(args.files)
      ? args
          .files
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
  const metaFilePath = resultMeta ? getString(resultMeta.filePath) : undefined;
  const metaPath = resultMeta ? getString(resultMeta.path) : undefined;

  const primary = argFilePath ?? argPath ?? metaFilePath ?? metaPath ?? resultTitle;
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
  const directCount = typeof result.count === "number" ? result.count : undefined;
  const metadataCount =
    metadata && typeof metadata.count === "number" ? metadata.count : undefined;
  return metadataCount ?? directCount;
};

type ToolRunState = "started" | "running" | "completed" | "failed" | "timed_out";

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
    const state = isToolRunState(result.state) ? result.state : isToolRunState(result.runState) ? result.runState : undefined;
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
  costUSD?: number
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

const modelSupportsImageInput = (modelId?: string) => {
  const id = (modelId ?? "").toLowerCase();
  if (!id) return false;

  return (
    id.includes("gpt-4o") ||
    id.includes("gpt-4.1") ||
    id.includes("gpt-5") ||
    id.includes("claude") ||
    id.includes("gemini") ||
    id.includes("glm-4.7") ||
    id.includes("glm-5")
  );
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
  file: FileUIPart
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
  return items.map((item) => {
    if (item.type !== "message" || !item.images?.length) {
      return item;
    }

    return {
      ...item,
      images: [],
    };
  });
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
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ paddingLeft: `${indent}px` }}
          className="flex w-full items-center gap-1.5 rounded py-1 pr-2 text-[11.5px] text-[#56657d] hover:text-white hover:bg-[#111c2e] transition-colors"
        >
          <ChevronRightIcon
            className={cn("size-2.5 shrink-0 transition-transform", expanded && "rotate-90")}
          />
          <FolderIcon className="size-3 shrink-0 text-amber-500/70" />
          {node.name}
        </button>
        {expanded &&
          node.children.map((child) => (
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
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      style={{ paddingLeft: `${indent + 14}px` }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-[11.5px] transition-colors text-left",
        selectedPath === node.path
          ? "bg-[#1a2540] text-white"
          : "text-[#56657d] hover:text-white hover:bg-[#111c2e]"
      )}
    >
      <FileCode2Icon className="size-3 shrink-0 text-indigo-400/70" />
      <span className="truncate">{node.name}</span>
    </button>
  );
};

const FileTreeNodes = ({
  nodes,
  onSelectFile,
  selectedPath,
  depth,
}: {
  nodes: DesktopWorkspaceNode[];
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
  depth: number;
}) => (
  <div className="space-y-0.5">
    {nodes.map((node) => (
      <FileTreeNodeItem
        key={node.path}
        node={node}
        onSelectFile={onSelectFile}
        selectedPath={selectedPath}
        depth={depth}
      />
    ))}
  </div>
);
// ─────────────────────────────────────────────────────────────────────────────

const PromptInputAttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments
      variant="grid"
      className="ml-0 w-full justify-start gap-3 px-5 pt-4"
    >
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => attachments.remove(attachment.id)}
          className="size-14 overflow-hidden rounded-xl border border-border/45 bg-background/70 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <AttachmentPreview className="rounded-2xl bg-muted/30" />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
};

const CHAT_COLUMN_CLASS =
  "mx-auto w-full max-w-5xl px-6 md:px-8 xl:px-10";

const logWorkspaceDebug = (label: string, payload?: Record<string, unknown>) => {
  console.info(`[workspace-debug] ${label}`, payload ?? {});
};

export default function Home() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const [desktopWorkspace, setDesktopWorkspace] =
    useState<DesktopWorkspacePayload | null>(null);
  const [desktopWorkspaceLoading, setDesktopWorkspaceLoading] = useState(false);
  const [desktopWorkspaceError, setDesktopWorkspaceError] = useState<string | null>(null);
  const [commandDialogOpen, setCommandDialogOpen] = useState(true);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState("code");
  const [activeView, setActiveView] = useState<"chat" | "editor">("chat");
  const [editorSelectedFile, setEditorSelectedFile] = useState<DesktopWorkspaceFile | null>(null);
  const [threadId, setThreadId] = useState<string>("");
  const [recentThreads, setRecentThreads] = useState<ThreadRecord[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [localProcesses, setLocalProcesses] = useState<LocalProcessRecord[]>([]);
  const [serviceLogsById, setServiceLogsById] = useState<Record<string, string>>({});
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceActionId, setServiceActionId] = useState<string | null>(null);
  const [hydratedThreadId, setHydratedThreadId] = useState<string | null>(null);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [model, setModel] = useState("openrouter/qwen/qwen3.6-plus-preview:free");
  const [selectedAgent, setSelectedAgent] = useState(DEFAULT_AGENT_ID);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [status, setStatus] = useState<
    "submitted" | "streaming" | "ready" | "error"
  >("ready");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [workspaceBranches, setWorkspaceBranches] = useState<WorkspaceBranchPayload | null>(null);
  const [workspaceBranchLoading, setWorkspaceBranchLoading] = useState(false);
  const [previewLogs, setPreviewLogs] = useState<
    Array<{ level: "log" | "warn" | "error"; message: string; timestamp: Date }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const [, setStreamingMessageId] = useState<string | null>(null);
  const [reasoningOpenState, setReasoningOpenState] = useState<Record<string, boolean>>({});
  const [toolOpenState, setToolOpenState] = useState<Record<string, boolean>>({});
  const itemsRef = useRef<ChatItem[]>([]);
  const previousToolStatusesRef = useRef<Record<string, "pending" | "done" | "error">>({});
  const previousThinkingStatusesRef = useRef<Record<string, "pending" | "done">>({});
  const postToolPendingRef = useRef(false);
  const [plan, setPlan] = useState<{
    title: string;
    todos: Array<{
      id: string;
      label: string;
      status: "pending" | "in_progress" | "completed" | "cancelled";
      description?: string;
    }>;
  } | null>(null);
  const [queuedSubmissions, setQueuedSubmissions] = useState<QueuedSubmission[]>([]);
  const dequeuingSubmissionRef = useRef(false);
  const params = useParams();
  const router = useRouter();
  const selectedModelData = models.find((m) => m.id === model);
  const selectedAgentData = AGENTS.find((agent) => agent.id === selectedAgent);
  const activeThreadRecord = recentThreads.find((entry) => entry.id === threadId);
  const activeWorkspaceLabel = summarizeWorkspaceRoot(
    workspaceRoot ?? activeThreadRecord?.workspaceRoot ?? null
  );
  const runningLocalProcesses = localProcesses.filter((entry) => entry.status === "running");
  const visibleLocalProcesses = runningLocalProcesses;
  const showLocalServicesPanel = hasMounted && visibleLocalProcesses.length > 0;
  const [pendingNewThreadId, setPendingNewThreadId] = useState<string | null>(null);
  const isHydratingThread =
    Boolean(threadId) &&
    hydratedThreadId !== threadId &&
    pendingNewThreadId !== threadId;
  const loadThreadList = useCallback(async () => {
    try {
      const response = await fetch("/api/threads?limit=24", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { threads?: ThreadRecord[] };
      if (Array.isArray(payload.threads)) {
        setRecentThreads((prev) => {
          const next = payload.threads ?? [];
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      }
    } catch {
      // Ignore thread list load failures.
    }
  }, []);

  const loadLocalProcesses = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setServicesLoading(true);
    }
    try {
      const response = await fetch("/api/local-processes", { cache: "no-store" });
      const payload = (await response.json()) as { processes?: LocalProcessRecord[] };
      if (!response.ok) {
        throw new Error("Failed to load local services");
      }
      setLocalProcesses(Array.isArray(payload.processes) ? payload.processes : []);
    } catch {
      // Ignore service refresh failures.
    } finally {
      if (!options?.silent) {
        setServicesLoading(false);
      }
    }
  }, []);

  const loadServiceLogs = useCallback(async (processId: string) => {
    try {
      const response = await fetch(`/api/local-processes/${processId}/logs?lines=80`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { output?: string };
      if (!response.ok) {
        throw new Error("Failed to load service logs");
      }
      setServiceLogsById((previous) => ({
        ...previous,
        [processId]: payload.output ?? "",
      }));
    } catch {
      setServiceLogsById((previous) => ({
        ...previous,
        [processId]: "Unable to load logs.",
      }));
    }
  }, []);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandDialogOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isDesktopRuntime = hasMounted && isTauriDesktop();

  const applyDesktopWorkspace = useCallback((payload: DesktopWorkspacePayload) => {
    logWorkspaceDebug("applyDesktopWorkspace", {
      rootPath: payload.rootPath,
      rootName: payload.rootName,
      activeFile: payload.activeFile?.path ?? null,
    });
    setDesktopWorkspace(payload);
    setDesktopWorkspaceError(null);
    setWorkspaceRoot(payload.rootPath);
    setStoredWorkspaceRoot(payload.rootPath);
  }, []);

  const loadWorkspaceBranches = useCallback(async (path: string) => {
    if (!isTauriDesktop()) {
      setWorkspaceBranches(null);
      return;
    }

    try {
      const payload = await getWorkspaceBranches(path);
      setWorkspaceBranches(payload);
    } catch {
      setWorkspaceBranches({
        hasGit: false,
        currentBranch: null,
        branches: [],
      });
    }
  }, []);

  const loadDesktopWorkspaceFromPath = useCallback(
    async (path: string) => {
      setDesktopWorkspaceLoading(true);
      try {
        const payload = await loadDesktopWorkspace(path);
        applyDesktopWorkspace(payload);
        await loadWorkspaceBranches(payload.rootPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load workspace";
        setDesktopWorkspaceError(message);
      } finally {
        setDesktopWorkspaceLoading(false);
      }
    },
    [applyDesktopWorkspace, loadWorkspaceBranches]
  );

  useEffect(() => {
    if (!isDesktopRuntime || recentThreads.length === 0) return;
    const storedRoot = getStoredWorkspaceRoot();
    if (!storedRoot) return;
    logWorkspaceDebug("restoreStoredWorkspaceRoot", { storedRoot, recentThreads: recentThreads.length });
    void loadDesktopWorkspaceFromPath(storedRoot);
  }, [isDesktopRuntime, loadDesktopWorkspaceFromPath, recentThreads.length]);

  useEffect(() => {
    void loadLocalProcesses();
    const timer = window.setInterval(() => {
      void loadLocalProcesses({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadLocalProcesses]);

  useEffect(() => {
    if (!expandedServiceId) return;
    void loadServiceLogs(expandedServiceId);
    const timer = window.setInterval(() => {
      void loadServiceLogs(expandedServiceId);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [expandedServiceId, loadServiceLogs]);

  useEffect(() => {
    if (!expandedServiceId) return;
    if (!visibleLocalProcesses.some((process) => process.id === expandedServiceId)) {
      setExpandedServiceId(null);
    }
  }, [expandedServiceId, visibleLocalProcesses]);

  const roundSummaryByFirstActivityId = useMemo(() => {
    const summary = new Map<string, string>();
    type RoundCounts = Record<ActivityAction, { pending: number; done: number; error: number }>;
    const freshCounts = (): RoundCounts => ({
      browse: { pending: 0, done: 0, error: 0 },
      edit: { pending: 0, done: 0, error: 0 },
      run: { pending: 0, done: 0, error: 0 },
      search: { pending: 0, done: 0, error: 0 },
      plan: { pending: 0, done: 0, error: 0 },
      delegate: { pending: 0, done: 0, error: 0 },
      other: { pending: 0, done: 0, error: 0 },
    });

    let firstActivityId: string | null = null;
    let inRound = false;
    let counts = freshCounts();

    const flush = () => {
      if (!firstActivityId) return;
      const actionOrder: ActivityAction[] = [
        "browse",
        "edit",
        "run",
        "search",
        "plan",
        "delegate",
        "other",
      ];
      const labelByAction: Record<ActivityAction, string> = {
        browse: "浏览",
        edit: "编辑",
        run: "运行",
        search: "搜索",
        plan: "计划",
        delegate: "委托",
        other: "处理",
      };
      const chunks: string[] = [];
      for (const action of actionOrder) {
        const stat = counts[action];
        if (stat.pending > 0) chunks.push(`正在${labelByAction[action]} ${stat.pending}`);
        if (stat.done > 0) chunks.push(`已${labelByAction[action]} ${stat.done}`);
        if (stat.error > 0) chunks.push(`${labelByAction[action]}失败 ${stat.error}`);
      }
      if (chunks.length) {
        summary.set(firstActivityId, chunks.join("，"));
      }
    };

    for (const item of items) {
      if (item.type === "message" && item.role === "user") {
        flush();
        inRound = true;
        firstActivityId = null;
        counts = freshCounts();
        continue;
      }
      if (item.type === "message" && item.role === "assistant") {
        flush();
        inRound = false;
        firstActivityId = null;
        counts = freshCounts();
        continue;
      }
      if (!inRound) continue;
      if (item.type === "thinking") continue;
      if (item.type === "tool" && item.parentToolCallId) continue;
      if (item.type !== "tool" && item.type !== "agent") continue;

      if (!firstActivityId) firstActivityId = item.id;
      const action = item.type === "agent" ? "delegate" : getToolAction(item.name);
      counts[action][item.status] += 1;
    }

    flush();
    return summary;
  }, [items]);

  useEffect(() => {
    const currentStatuses: Record<string, "pending" | "done" | "error"> = {};
    for (const item of items) {
      if (item.type !== "tool" && item.type !== "agent") continue;
      currentStatuses[item.id] = item.status;
    }

    setToolOpenState((previous) => {
      const next = { ...previous };
      let changed = false;

      for (const id of Object.keys(currentStatuses)) {
        if (!(id in next)) {
          next[id] = false;
          changed = true;
        }
      }

      previousToolStatusesRef.current = currentStatuses;
      return changed ? next : previous;
    });
  }, [items]);

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

  useEffect(() => {
    if (!error) return;
    const summary = summarizeUiError(error);
    gooeyToast.error(`Request failed: ${summary}`, {
      borderColor: "#fca5a5",
      fillColor: "#fff5f5",
      spring: false,
      duration: 3600,
    });
  }, [error]);

  useEffect(() => {
    void loadThreadList();
  }, [loadThreadList]);

  useEffect(() => {
    const rawId = params?.id;
    const routeId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (routeId && typeof routeId === "string") {
      setThreadId(routeId);
    }
  }, [params]);

  useEffect(() => {
    try {
      const rawThreads = window.localStorage.getItem(RECENT_THREADS_STORAGE_KEY);
      if (rawThreads) {
        const parsedThreads = JSON.parse(rawThreads) as unknown;
        if (Array.isArray(parsedThreads)) {
          setRecentThreads(parsedThreads as ThreadRecord[]);
        }
      }

      const pendingThread = window.localStorage.getItem(PENDING_NEW_THREAD_STORAGE_KEY);
      if (pendingThread) {
        setPendingNewThreadId(pendingThread);
      }
    } catch {
      // Ignore storage errors during hydration.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        RECENT_THREADS_STORAGE_KEY,
        JSON.stringify(recentThreads)
      );
    } catch {
      // Ignore storage errors.
    }
  }, [recentThreads]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (pendingNewThreadId) {
        window.localStorage.setItem(PENDING_NEW_THREAD_STORAGE_KEY, pendingNewThreadId);
      } else {
        window.localStorage.removeItem(PENDING_NEW_THREAD_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors.
    }
  }, [pendingNewThreadId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!threadId) {
      setSandboxId(null);
      return;
    }
    try {
      const saved = window.localStorage.getItem(getSandboxStorageKey(threadId));
      setSandboxId(saved || null);
    } catch {
      setSandboxId(null);
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      logWorkspaceDebug("hydrateThread:no-thread", {});
      setHydratedThreadId(null);
      setWorkspaceRoot(null);
      return;
    }

    if (pendingNewThreadId === threadId) {
      logWorkspaceDebug("hydrateThread:pending-new-thread", {
        threadId,
        workspaceRoot,
      });
      setItems([]);
      setPlan(null);
      setPreviewUrl(null);
      setPreviewLogs([]);
      setHydratedThreadId(threadId);
      setPendingNewThreadId(null);
      return;
    }

    let cancelled = false;
    setHydratedThreadId(null);

    const loadThreadSession = async () => {
      try {
        const response = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          setItems([]);
          setPlan(null);
          setPreviewUrl(null);
          setPreviewLogs([]);
          setWorkspaceRoot(null);
          setHydratedThreadId(threadId);
          return;
        }
        if (!response.ok) {
          throw new Error("Failed to load thread session");
        }
        const payload = (await response.json()) as {
          thread?: {
            state?: {
              workspaceRoot?: string | null;
              sandboxId?: string | null;
              previewUrl?: string | null;
              items?: unknown[];
              plan?: unknown;
              previewLogs?: Array<{
                level: "log" | "warn" | "error";
                message: string;
                timestamp: string | Date;
              }>;
            };
          };
        };
        const state = payload.thread?.state;
        const hydratedWorkspaceRoot =
          typeof state?.workspaceRoot === "string" && state.workspaceRoot.trim()
            ? state.workspaceRoot.trim()
            : null;
        logWorkspaceDebug("hydrateThread:loaded", {
          threadId,
          hydratedWorkspaceRoot,
          title: payload.thread?.title ?? null,
        });
        setWorkspaceRoot(hydratedWorkspaceRoot);
        setRecentThreads((prev) =>
          prev.map((entry) =>
            entry.id === threadId
              ? {
                  ...entry,
                  subtitle: summarizeWorkspaceRoot(hydratedWorkspaceRoot),
                  workspaceRoot: hydratedWorkspaceRoot,
                }
              : entry
          )
        );
        setItems(Array.isArray(state?.items) ? (state.items as ChatItem[]) : []);
        setPlan(isPlanRecord(state?.plan) ? state.plan : null);
        setPreviewUrl(typeof state?.previewUrl === "string" ? state.previewUrl : null);
        setSandboxId(
          typeof state?.sandboxId === "string" && state.sandboxId.trim()
            ? state.sandboxId.trim()
            : null
        );
        setPreviewLogs(
          Array.isArray(state?.previewLogs)
            ? state.previewLogs.map((entry) => ({
                ...entry,
                timestamp: new Date(entry.timestamp),
              }))
            : []
        );
        setHydratedThreadId(threadId);
      } catch {
        if (cancelled) return;
        setHydratedThreadId(threadId);
      }
    };

    void loadThreadSession();

    return () => {
      cancelled = true;
    };
  }, [pendingNewThreadId, threadId]);

  useEffect(() => {
    if (!threadId || hydratedThreadId !== threadId) return;

    const timeout = window.setTimeout(() => {
      const latestUserMessage = [...items]
        .reverse()
        .find((item) => item.type === "message" && item.role === "user");
      const title = latestUserMessage?.content
        ? summarizeThreadTitle(latestUserMessage.content)
        : activeThreadRecord?.title ??
          (threadId.startsWith("thread-") ? threadId.slice(7) : threadId);

      void fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle: summarizeWorkspaceRoot(workspaceRoot),
          state: {
            workspaceRoot,
            sandboxId,
            previewUrl,
            items: serializeItemsForThread(items),
            plan,
            previewLogs: previewLogs.map((entry) => ({
              ...entry,
              timestamp: entry.timestamp.toISOString(),
            })),
          },
        }),
      }).catch(() => {
        // Ignore persistence failures.
      });
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activeThreadRecord?.title,
    items,
    plan,
    previewLogs,
    previewUrl,
    sandboxId,
    selectedModelData?.name,
    workspaceRoot,
    hydratedThreadId,
    threadId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !threadId) return;
    try {
      const key = getSandboxStorageKey(threadId);
      if (sandboxId) {
        window.localStorage.setItem(key, sandboxId);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage errors.
    }
  }, [sandboxId, threadId]);

  const streamBus = createStreamEventBus({
    setItems,
    setError,
    setStatus,
    setPreviewUrl,
    setSandboxId,
    setStreamingMessageId,
    assistantIdRef,
    itemsRef,
    postToolPendingRef,
    createId,
    appendPreviewLog: (log) =>
      setPreviewLogs((prev) => [...prev.slice(-200), log]),
    getModelId: () => model,
    setPlan,
    setWorkflowGraph: () => {},
  });

  const activePlan = useMemo(() => {
    if (!plan?.todos?.length) return null;
    if (status !== "submitted" && status !== "streaming") return null;
    const remainingTodos = plan.todos.filter(
      (todo) => todo.status !== "completed" && todo.status !== "cancelled"
    );
    if (remainingTodos.length === 0) return null;
    return {
      id: `plan-${threadId || "thread"}`,
      title: plan.title,
      todos: plan.todos,
    };
  }, [plan, status, threadId]);

  const processSubmission = useCallback(async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    const attachments = message.files ?? [];
    if (!text && attachments.length === 0) return;

    const containsImageAttachment = attachments.some((file) =>
      file.mediaType.startsWith("image/")
    );
    if (containsImageAttachment && !modelSupportsImageInput(model)) {
      setError(
        `当前模型 ${selectedModelData?.name ?? model} 不支持图片输入。请切换到支持多模态的模型后再上传图片。`
      );
      setStatus("ready");
      return;
    }

    setPlan(null);
    setPreviewUrl(null);
    setStatus("submitted");
    setError(null);

    const threadTitleInput =
      text || attachments.find((file) => file.filename)?.filename || "Image request";
    const userImages: NonNullable<ChatItem["images"]> = [];

    const userMessage: ChatItem = {
      id: createId(),
      type: "message",
      role: "user",
      content: text,
      images: userImages,
    };

    const assistantId = createId();
    assistantIdRef.current = assistantId;

    const assistantMessage: ChatItem = {
      id: assistantId,
      type: "message",
      role: "assistant",
      content: "",
      images: [],
      modelId: model,
    };

    const optimisticThinking: ChatItem = {
      id: `thinking:${assistantId}:optimistic`,
      type: "thinking",
      messageId: assistantId,
      content: "",
      status: "pending",
    };

    setItems((prev) => [...prev, userMessage, assistantMessage, optimisticThinking]);

    if (threadId) {
      setRecentThreads((prev) =>
        mergeRecentThreads(
          {
            id: threadId,
            title: summarizeThreadTitle(threadTitleInput),
            subtitle: summarizeWorkspaceRoot(workspaceRoot),
            workspaceRoot,
            updatedAt: Date.now(),
          },
          prev
        )
      );
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStreamingMessageId(assistantId);
    setStatus("submitted");

    try {
      const preparedAttachments = attachments.length
        ? await Promise.all(attachments.map((file) => prepareAttachmentForModel(file)))
        : [];
      userMessage.images = preparedAttachments
        .map((file) => file.previewImage ?? null)
        .filter((image): image is NonNullable<typeof image> => Boolean(image));

      const rawId = params?.id;
      const routeId = Array.isArray(rawId) ? rawId[0] : rawId;
      const effectiveThreadId =
        threadId || (typeof routeId === "string" ? routeId : undefined);
      logWorkspaceDebug("processSubmission:before-request", {
        threadId,
        routeId: typeof routeId === "string" ? routeId : null,
        effectiveThreadId: effectiveThreadId ?? null,
        workspaceRoot,
        activeThreadWorkspaceRoot: activeThreadRecord?.workspaceRoot ?? null,
      });
      const response = await fetch(`/api/agents/${selectedAgent}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(preparedAttachments.length
            ? {
                messages: [
                  {
                    role: "user",
                    content: [
                      ...(text ? [{ type: "text" as const, text }] : []),
                      ...preparedAttachments.map((file) => ({
                        type: "file" as const,
                        mediaType: file.mediaType,
                        filename: file.filename,
                        data: file.dataUrl,
                      })),
                    ],
                  },
                ],
              }
            : { message: text }),
          threadId: effectiveThreadId,
          model,
          requestContext: {
            ...(sandboxId ? { sandboxId } : {}),
            workspaceRoot,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        throw new Error(text || "Mastra stream failed");
      }

      setStatus("streaming");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const parsed = parseSseEvent(part);
          if (!parsed) continue;
          let data: StreamPayload | string = parsed.data;
          try {
            data = JSON.parse(parsed.data) as StreamPayload;
          } catch {
            // keep raw string
          }
          streamBus.handlePayload(data);
        }
      }

      setStatus("ready");
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "未知错误";
      const message = rawMessage.includes("No endpoints found that support image input")
        ? `当前模型 ${selectedModelData?.name ?? model} 不支持图片输入。请切换到支持多模态的模型后再试。`
        : rawMessage;
      const aborted =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError") ||
        /aborted|aborterror|signal is aborted/i.test(rawMessage);
      if (aborted) {
        setError(null);
        setStatus("ready");
      } else {
        setError(message);
        setStatus("error");
      }
    } finally {
      const finalAssistantId = assistantIdRef.current ?? assistantId;
      if (finalAssistantId) {
        setItems((prev) =>
          prev.map((item) =>
            item.type === "thinking" && item.messageId === finalAssistantId
              ? { ...item, status: "done" }
              : item
          )
        );
      }
      abortRef.current = null;
      assistantIdRef.current = null;
      postToolPendingRef.current = false;
      setStreamingMessageId(null);
    }
  }, [
    model,
    params,
    sandboxId,
    selectedModelData?.name,
    selectedAgent,
    streamBus,
    threadId,
    workspaceRoot,
  ]);

  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    const text = message.text?.trim();
    const attachments = message.files ?? [];
    if (!text && attachments.length === 0) return;

    if (status === "submitted" || status === "streaming") {
      setQueuedSubmissions((previous) => [
        ...previous,
        {
          id: createId(),
          text: text ?? "",
          files: attachments,
        },
      ]);
      return;
    }

    await processSubmission(message);
  }, [processSubmission, status]);

  useEffect(() => {
    if (status !== "ready") return;
    if (dequeuingSubmissionRef.current) return;
    const nextSubmission = queuedSubmissions[0];
    if (!nextSubmission) return;

    dequeuingSubmissionRef.current = true;
    setQueuedSubmissions((previous) => previous.slice(1));

    void processSubmission({
      text: nextSubmission.text,
      files: nextSubmission.files,
    }).finally(() => {
      dequeuingSubmissionRef.current = false;
    });
  }, [processSubmission, queuedSubmissions, status]);

  const handleStop = () => {
    const currentAssistantId = assistantIdRef.current;
    if (currentAssistantId) {
      setItems((prev) =>
        prev.map((item) =>
          item.type === "thinking" && item.messageId === currentAssistantId
            ? { ...item, status: "done" }
            : item
        )
      );
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
    postToolPendingRef.current = false;
    setStreamingMessageId(null);
  };

  const handleNewThread = useCallback((initialWorkspaceRoot?: string | null) => {
    const normalizedWorkspaceRoot =
      typeof initialWorkspaceRoot === "string" && initialWorkspaceRoot.trim()
        ? initialWorkspaceRoot.trim()
        : null;
    const nextId = createThreadId();
    logWorkspaceDebug("handleNewThread", {
      nextId,
      initialWorkspaceRoot: normalizedWorkspaceRoot,
    });
    const nextRecord: ThreadRecord = {
      id: nextId,
      title: "Untitled thread",
      subtitle: summarizeWorkspaceRoot(normalizedWorkspaceRoot),
      workspaceRoot: normalizedWorkspaceRoot,
      updatedAt: Date.now(),
    };

    setRecentThreads((prev) => mergeRecentThreads(nextRecord, prev));
    setPendingNewThreadId(nextId);
    setThreadId(nextId);
    setHydratedThreadId(nextId);
    setSandboxId(null);
    setWorkspaceRoot(normalizedWorkspaceRoot);
    router.push(`/${nextId}`);
    setItems([]);
    setToolOpenState({});
    previousToolStatusesRef.current = {};
    setReasoningOpenState({});
    previousThinkingStatusesRef.current = {};
    setPlan(null);
    setError(null);
    setPreviewUrl(null);
    setPreviewLogs([]);

    void fetch(`/api/threads/${nextId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextRecord.title,
        subtitle: nextRecord.subtitle,
        state: {
          workspaceRoot: normalizedWorkspaceRoot,
          sandboxId: null,
          previewUrl: null,
          items: [],
          plan: null,
          previewLogs: [],
        },
      }),
    }).catch(() => {
      // Ignore optimistic thread creation failures.
    });
  }, [router]);

  const handleSelectThread = (nextThreadId: string) => {
    if (!nextThreadId || nextThreadId === threadId) return;
    setThreadId(nextThreadId);
    setHydratedThreadId(null);
    setItems([]);
    setToolOpenState({});
    previousToolStatusesRef.current = {};
    setReasoningOpenState({});
    previousThinkingStatusesRef.current = {};
    setPlan(null);
    setError(null);
    setPreviewUrl(null);
    setPreviewLogs([]);
    router.push(`/${nextThreadId}`);
  };

  const handleDeleteThread = async (targetThreadId: string) => {
    if (!targetThreadId) return;

    try {
      const response = await fetch(`/api/threads/${targetThreadId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to delete thread");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete thread");
      return;
    }

    clearThreadLocalState(targetThreadId, setSandboxId);

    const remainingThreads = recentThreads.filter((entry) => entry.id !== targetThreadId);
    setRecentThreads(remainingThreads);

    if (threadId !== targetThreadId) {
      return;
    }

    const fallbackThreadId = remainingThreads[0]?.id;
    if (fallbackThreadId) {
      handleSelectThread(fallbackThreadId);
      return;
    }
    setThreadId("");
    setHydratedThreadId(null);
    setItems([]);
    setToolOpenState({});
    previousToolStatusesRef.current = {};
    setReasoningOpenState({});
    previousThinkingStatusesRef.current = {};
    setPlan(null);
    setError(null);
    setPreviewUrl(null);
    setPreviewLogs([]);
    setWorkspaceRoot(null);
    setDesktopWorkspace(null);
    setEditorSelectedFile(null);
    setWorkspaceBranches(null);
    setSandboxId(null);
    setStoredWorkspaceRoot(null);
  };

  const handleSelectEditorFile = useCallback(
    async (path: string) => {
      if (!isDesktopRuntime) return;
      try {
        const file = await readDesktopWorkspaceFile(path);
        setEditorSelectedFile(file);
      } catch {
        // Ignore file read errors
      }
    },
    [isDesktopRuntime]
  );

  const handleChangeWorkspaceRoot = useCallback(async () => {
    if (!isDesktopRuntime) {
      if (typeof window === "undefined") return;
      const nextValue = window.prompt("Set thread directory", workspaceRoot ?? "");
      if (nextValue === null) return;
      handleNewThread(nextValue.trim() || null);
      return;
    }

    const selectedPath = await pickWorkspaceDirectory();
    if (!selectedPath) return;
    logWorkspaceDebug("handleChangeWorkspaceRoot:selected", {
      selectedPath,
      currentThreadId: threadId || null,
      currentWorkspaceRoot: workspaceRoot,
    });
    handleNewThread(selectedPath);
    await loadDesktopWorkspaceFromPath(selectedPath);
  }, [handleNewThread, isDesktopRuntime, loadDesktopWorkspaceFromPath, threadId, workspaceRoot]);

  const handleWorkspaceBranchChange = useCallback(
    async (targetWorkspaceRoot: string) => {
      if (!isDesktopRuntime) return;
      if (targetWorkspaceRoot !== workspaceRoot) return;
      await loadDesktopWorkspaceFromPath(targetWorkspaceRoot);
    },
    [isDesktopRuntime, loadDesktopWorkspaceFromPath, workspaceRoot]
  );

  const handleHeaderBranchChange = useCallback(
    async (branch: string) => {
      if (!isDesktopRuntime) return;
      setWorkspaceBranchLoading(true);
      try {
        const payload = await switchWorkspaceBranch(workspaceRoot, branch);
        setWorkspaceBranches(payload);
        await loadDesktopWorkspaceFromPath(workspaceRoot);
      } finally {
        setWorkspaceBranchLoading(false);
      }
    },
    [isDesktopRuntime, loadDesktopWorkspaceFromPath, workspaceRoot]
  );

  const handleCommitWorkspace = useCallback(async () => {
    if (!isDesktopRuntime) return;
    const message = window.prompt("提交说明", "Update workspace");
    if (!message) return;

    try {
      setWorkspaceBranchLoading(true);
      const payload = await commitWorkspaceChanges(workspaceRoot, message);
      setWorkspaceBranches(payload);
      gooeyToast.success("提交成功");
      await loadDesktopWorkspaceFromPath(workspaceRoot);
    } catch (error) {
      gooeyToast.error(error instanceof Error ? error.message : "提交失败");
    } finally {
      setWorkspaceBranchLoading(false);
    }
  }, [isDesktopRuntime, loadDesktopWorkspaceFromPath, workspaceRoot]);

  const handlePushWorkspace = useCallback(async () => {
    if (!isDesktopRuntime) return;

    try {
      setWorkspaceBranchLoading(true);
      const payload = await pushWorkspaceBranch(workspaceRoot);
      setWorkspaceBranches(payload);
      gooeyToast.success("推送成功");
    } catch (error) {
      gooeyToast.error(error instanceof Error ? error.message : "推送失败");
    } finally {
      setWorkspaceBranchLoading(false);
    }
  }, [isDesktopRuntime, workspaceRoot]);

  const handleCreateBranch = useCallback(async () => {
    if (!isDesktopRuntime) return;
    const branchName = window.prompt("新分支名称", "feature/");
    if (!branchName) return;
    await handleHeaderBranchChange(branchName);
  }, [handleHeaderBranchChange, isDesktopRuntime]);

  const handleStopLocalProcess = useCallback(async (processId: string) => {
    setServiceActionId(processId);
    try {
      const response = await fetch(`/api/local-processes/${processId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to stop local process");
      }
      await loadLocalProcesses({ silent: true });
      if (expandedServiceId === processId) {
        await loadServiceLogs(processId);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to stop local process");
    } finally {
      setServiceActionId(null);
    }
  }, [expandedServiceId, loadLocalProcesses, loadServiceLogs]);

  const queuedSubmissionPreview = queuedSubmissions[0] ?? null;
  const projectTitle = desktopWorkspace?.rootName ?? "Project Alpha";
  const activeDesktopFile = desktopWorkspace?.activeFile ?? null;
  const currentEditorFile = editorSelectedFile ?? activeDesktopFile;
  const activeFileSegments = activeDesktopFile?.path.split("/").filter(Boolean) ?? [
    "src",
    "components",
    "Editor.tsx",
  ];
  const activeFileName = activeDesktopFile?.name ?? "Editor.tsx";
  const backgroundCode = activeDesktopFile?.content
    ? activeDesktopFile.content
    : `import React from 'react';
import { Command } from './components/Command';

export const Editor: React.FC = () => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <div className="flex-1 bg-slate-950 relative overflow-hidden">
      <CodeOverlay />
      {isOpen && (
        <CommandPalette
          placeholder="What can I help you build?"
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

const CodeOverlay = () => {
  return <div className="absolute inset-0 backdrop-blur-sm bg-slate-900/50" />;
};`;
  const activeLanguage = activeDesktopFile?.language ?? "tsx";
  const diffPreviewCode = buildRefactorPreview(backgroundCode, activeLanguage);
  const handleCommandAction = (value: string) => {
    setCommandDialogOpen(false);

    if (value === "refactor") {
      setPreviewTab("diff");
      return;
    }

    setPreviewTab("code");
  };

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
        workspaceRoot={workspaceRoot}
      />
      <SidebarInset className="bg-background">
        <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <main className="min-h-0 flex-1 overflow-hidden">
            <section className="flex h-full min-h-0 min-w-0 flex-col border-l border-border/60 bg-[radial-gradient(circle_at_top_left,_color-mix(in_srgb,var(--primary)_14%,transparent),transparent_34%),radial-gradient(circle_at_bottom_right,_color-mix(in_srgb,var(--accent)_12%,transparent),transparent_28%),linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white_8%)_0%,color-mix(in_srgb,var(--background)_96%,var(--primary)_4%)_100%)]">
              <Card className="flex min-h-0 flex-1 flex-col gap-2 rounded-none border-0 bg-transparent pt-0 shadow-none">
                <CardHeader className="border-border/50 border-b px-0 py-2.5">
                  <div
                    className={cn(
                      CHAT_COLUMN_CLASS,
                      "flex items-center justify-between gap-6"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SidebarTrigger className="md:hidden" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-medium tracking-tight text-foreground/92">
                            {activeThreadRecord?.title ?? "Untitled thread"}
                          </span>
                          <Badge
                            variant="secondary"
                            className="rounded-full border border-border/45 bg-background px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/85"
                          >
                            {status === "streaming"
                              ? "Running"
                              : status === "error"
                                ? "Attention"
                                : "Ready"}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-2 overflow-hidden text-[10px] text-muted-foreground/80">
                          <span className="truncate">
                            {activeWorkspaceLabel}
                          </span>
                          <span className="text-border">•</span>
                          <span className="truncate">
                            {selectedAgentData?.name ?? "Build Agent"}
                          </span>
                          <span className="text-border">•</span>
                          <span className="truncate">
                            {activeThreadRecord?.updatedAt
                              ? formatRelativeUpdatedAt(activeThreadRecord.updatedAt)
                              : "just now"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="hidden items-center gap-2 md:flex">
                      <button
                        type="button"
                        onClick={() => setWorkspaceSearchOpen(true)}
                        className="flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <SearchIcon className="size-4" />
                        搜索
                      </button>
                      {workspaceBranches?.hasGit ? (
                        <>
                          <div className="relative">
                            <select
                              value={workspaceBranches.currentBranch ?? ""}
                              onChange={(event) =>
                                void handleHeaderBranchChange(event.target.value)
                              }
                              disabled={workspaceBranchLoading}
                              className="h-9 min-w-[148px] appearance-none rounded-xl border border-border/60 bg-background px-9 pr-9 text-[12px] text-foreground shadow-none outline-none"
                            >
                              {workspaceBranches.branches.map((branch) => (
                                <option key={branch} value={branch}>
                                  {branch}
                                </option>
                              ))}
                            </select>
                            <GitBranchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-[12px] text-foreground transition-colors hover:bg-muted"
                              >
                                提交
                                <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="min-w-[220px] rounded-2xl border border-white/10 bg-[#242321]/95 p-1.5 text-white shadow-[0_22px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                            >
                              <DropdownMenuItem
                                onClick={() => void handleCommitWorkspace()}
                                disabled={workspaceBranchLoading || !workspaceBranches.hasChanges}
                                className="rounded-xl px-3 py-2.5 text-[14px] text-white/92 focus:bg-white/10 focus:text-white"
                              >
                                提交
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void handlePushWorkspace()}
                                disabled={workspaceBranchLoading || !workspaceBranches.hasRemote}
                                className="rounded-xl px-3 py-2.5 text-[14px] text-white/92 focus:bg-white/10 focus:text-white"
                              >
                                <UploadIcon className="size-4" />
                                推送
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="my-1 bg-white/8" />
                              <DropdownMenuItem
                                onClick={() => void handleCreateBranch()}
                                className="rounded-xl px-3 py-2.5 text-[14px] text-white/92 focus:bg-white/10 focus:text-white"
                              >
                                <GitBranchIcon className="size-4" />
                                Create branch
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleHeaderBranchChange("main")}
                          className="flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <GitBranchIcon className="size-4" />
                          初始化分支
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-0">
                  <Conversation className="flex min-h-0 flex-1 overflow-hidden">
                    <ConversationContent
                      className={cn(
                        CHAT_COLUMN_CLASS,
                        "min-h-0 flex-1 overflow-y-auto"
                      )}
                    >
                      {isHydratingThread ? (
                        <ThreadHistoryLoadingState />
                      ) : items.length === 0 ? (
                        <ConversationEmptyState>
                          <div className="h-full w-full p-6">
                            <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
                              <div className="flex size-16 items-center justify-center rounded-2xl border border-border/45 bg-muted/20">
                                <SparklesIcon className="size-7 text-primary/80" />
                              </div>
                              <div className="space-y-2">
                                <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-foreground">
                                  Hello,{" "}
                                  <span className="bg-gradient-to-r from-primary to-foreground/70 bg-clip-text text-transparent">
                                    AlphaDev
                                  </span>
                                </h1>
                                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                                  The aura is synchronized. Ready to refactor, debug,
                                  or architect your next masterpiece.
                                </p>
                              </div>
                            </div>
                          </div>
                        </ConversationEmptyState>
                      ) : (
                        items.map((item) => {
                          if (item.type === "thinking") {
                            if (item.status === "done" && !item.content.trim()) {
                              return null;
                            }
                            return (
                              <div key={item.id} className="mt-2 pl-2">
                                <Reasoning
                                  isStreaming={item.status === "pending"}
                                  open={reasoningOpenState[item.id] ?? false}
                                  onOpenChange={(open) =>
                                    setReasoningOpenState((previous) => ({
                                      ...previous,
                                      [item.id]: open,
                                    }))
                                  }
                                  className="mt-1"
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
                              (entry) =>
                                entry.type === "tool" &&
                                entry.parentToolCallId === item.parentToolCallId
                            );
                            const runningCount = childTools.filter(
                              (tool) => tool.status === "pending"
                            ).length;
                            const doneCount = childTools.filter(
                              (tool) => tool.status === "done"
                            ).length;
                            const errorCount = childTools.filter(
                              (tool) => tool.status === "error"
                            ).length;
                            const open = toolOpenState[item.id] ?? false;
                            const summaryText =
                              roundSummaryByFirstActivityId.get(item.id);
                            return (
                              <div key={item.id} className="space-y-1">
                                {summaryText ? (
                                  <div className="pl-5.5 text-[10px] leading-4.5 text-muted-foreground/75">
                                    {summaryText}
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setToolOpenState((previous) => ({
                                      ...previous,
                                      [item.id]: !open,
                                    }))
                                  }
                                  className={cn(
                                    "flex w-full items-start gap-2 rounded-md px-0 py-0.5 text-left text-foreground/78 transition-colors hover:bg-transparent hover:text-foreground",
                                    item.status === "error" &&
                                      "text-destructive/80 hover:text-destructive"
                                  )}
                                >
                                  <ChevronDownIcon
                                    className={cn(
                                      "mt-1 size-3.5 shrink-0 text-muted-foreground/75 transition-transform",
                                      open && "rotate-180"
                                    )}
                                  />
                                  <div className="min-w-0 pt-px">
                                    <div className="flex items-center gap-1.5 text-[11px] leading-5">
                                      <span className="truncate font-normal">
                                        {getActivityVerb("delegate", item.status)}{" "}
                                        {item.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/75">
                                      <span>子工具 {childTools.length} 个</span>
                                      <span>·</span>
                                      <span>运行中 {runningCount}</span>
                                      <span>·</span>
                                      <span>完成 {doneCount}</span>
                                      {errorCount ? (
                                        <>
                                          <span>·</span>
                                          <span className="text-destructive">
                                            失败 {errorCount}
                                          </span>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                </button>
                                {open ? (
                                  <div className="ml-3 space-y-1 border-l border-border/35 pl-2.5 text-[10px] leading-4.5 text-muted-foreground">
                                    {item.content ? (
                                      <div className="whitespace-pre-wrap text-muted-foreground">
                                        {item.content}
                                      </div>
                                    ) : null}
                                    {item.thinking ? (
                                      <div className="whitespace-pre-wrap">
                                        {item.thinking}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          }

                          if (item.type === "tool") {
                            const visibleToolName = getVisibleToolName(item);
                            const displayTitle = getToolDisplayTitle(
                              item,
                              visibleToolName
                            );
                            const action = getToolAction(item.name);
                            const verb = getActivityVerb(action, item.status);
                            const resultCount = getResultCount(item.result);
                            const runInfo = getRunInfo(item);
                            const open = toolOpenState[item.id] ?? false;
                            const summaryText =
                              roundSummaryByFirstActivityId.get(item.id);
                            return (
                              <div key={item.id} className="space-y-1">
                                {summaryText ? (
                                  <div className="pl-5.5 text-[10px] leading-4.5 text-muted-foreground/75">
                                    {summaryText}
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setToolOpenState((previous) => ({
                                      ...previous,
                                      [item.id]: !open,
                                    }))
                                  }
                                  className={cn(
                                    "flex w-full items-start gap-2 rounded-md px-0 py-0.5 text-left text-foreground/78 transition-colors hover:bg-transparent hover:text-foreground",
                                    item.status === "error" &&
                                      "text-destructive/80 hover:text-destructive"
                                  )}
                                >
                                  <ChevronDownIcon
                                    className={cn(
                                      "mt-1 size-3.5 shrink-0 text-muted-foreground/75 transition-transform",
                                      open && "rotate-180"
                                    )}
                                  />
                                  <div className="min-w-0 pt-px">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] leading-5">
                                      <span className="shrink-0 text-muted-foreground/80">
                                        {verb}
                                      </span>
                                      {displayTitle.secondary ? (
                                        <span className="shrink-0 rounded-sm bg-muted/20 px-1.5 text-[10px] text-muted-foreground/75">
                                          {displayTitle.secondary}
                                        </span>
                                      ) : null}
                                      <span className="min-w-0 truncate font-mono text-foreground/86">
                                        {displayTitle.primary}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] leading-4.5 text-muted-foreground/75">
                                      {resultCount !== undefined ? (
                                        <span>{resultCount} 个结果</span>
                                      ) : null}
                                      {runInfo.durationMs !== undefined ? (
                                        <span>
                                          {(runInfo.durationMs / 1000).toFixed(1)}s
                                        </span>
                                      ) : null}
                                      {runInfo.state ? <span>{runInfo.state}</span> : null}
                                      {typeof item.costUSD === "number" ? (
                                        <span>${(item.costUSD ?? 0).toFixed(4)}</span>
                                      ) : null}
                                      {item.errorText ? (
                                        <span className="text-destructive">
                                          {item.errorText}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </button>
                                {open ? (
                                  <div className="ml-3 space-y-1.5 border-l border-border/30 pl-2.5 text-[10px]">
                                    <div className="space-y-0.5">
                                      <div className="text-[9px] tracking-[0.08em] text-muted-foreground/60">
                                        Args
                                      </div>
                                      <pre className="max-h-24 overflow-auto px-0 py-0 text-[9px] leading-4.5 text-muted-foreground/90">
                                        {JSON.stringify(item.args ?? {}, null, 2)}
                                      </pre>
                                    </div>
                                    {item.steps?.length ? (
                                      <div className="space-y-0.5">
                                        <div className="text-[9px] tracking-[0.08em] text-muted-foreground/60">
                                          Trace
                                        </div>
                                        {item.steps.slice(-6).map((step) => (
                                          <div
                                            key={step.id}
                                            className={cn(
                                              "px-0 py-0 text-[9px] leading-4.5",
                                              getStepTone(step.status)
                                            )}
                                          >
                                            <div className="flex flex-wrap items-center gap-x-2">
                                              <span className="font-medium text-foreground/75">
                                                {step.step}
                                              </span>
                                              {step.runState ? (
                                                <span className="text-muted-foreground/70">
                                                  {step.runState}
                                                </span>
                                              ) : null}
                                              {step.durationMs ? (
                                                <span className="text-muted-foreground/70">
                                                  {(step.durationMs / 1000).toFixed(1)}s
                                                </span>
                                              ) : null}
                                            </div>
                                            {step.message ? (
                                              <div className="whitespace-pre-wrap text-muted-foreground/80">
                                                {step.message}
                                              </div>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                    <ComputerUseToolPreview item={item} />
                                    {item.result ? (
                                      <div className="space-y-0.5">
                                        <div className="text-[9px] tracking-[0.08em] text-muted-foreground/60">
                                          {isComputerUseTool(item.name)
                                            ? "Raw result"
                                            : "Result"}
                                        </div>
                                        <pre className="max-h-32 overflow-auto px-0 py-0 text-[9px] leading-4.5 text-muted-foreground/90">
                                          {JSON.stringify(item.result, null, 2)}
                                        </pre>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            );
                          }

                          return (
                            <Message
                              key={item.id}
                              from={item.role}
                              className={item.role === "assistant" ? "mt-3" : "mt-2.5"}
                            >
                              <MessageContent>
                                <MessageResponse>{item.content}</MessageResponse>
                                {item.images?.length ? (
                                  <div className="grid gap-3 pt-2">
                                    {item.images.map((img, index) => (
                                      <Image
                                        key={`${item.id}-${index}`}
                                        {...img}
                                        alt={img.alt ?? ""}
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
                                      Out {formatUsageTokens(item.usage.outputTokens)}
                                    </Badge>
                                    <Badge
                                      variant="secondary"
                                      className="rounded-full border border-stone-200/70 bg-stone-50/80 px-2 py-0.5 text-[10px] text-stone-700 dark:border-stone-700/60 dark:bg-stone-900/40 dark:text-stone-300"
                                    >
                                      Total {formatUsageTokens(item.usage.totalTokens)}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground/80">
                                      Cost{" "}
                                      {formatUsageCost(
                                        item.usage,
                                        item.modelId,
                                        item.usageCostUSD
                                      )}
                                    </span>
                                  </div>
                                ) : null}
                              </MessageContent>
                            </Message>
                          );
                        })
                      )}
                    </ConversationContent>
                    <ConversationScrollButton />
                  </Conversation>
                </CardContent>

                <CardFooter className="bg-background px-4 py-3">
                  <PromptInputProvider initialInput="">
                    <div className={cn(CHAT_COLUMN_CLASS, "space-y-1.5")}>
                      {activePlan ? (
                        <div className="w-full">
                          <Plan
                            {...activePlan}
                            maxVisibleTodos={2}
                            showProgress
                            className="w-full"
                          />
                        </div>
                      ) : null}

                      {queuedSubmissionPreview ? (
                        <div className="flex w-full items-center gap-2 rounded-2xl border border-border/50 bg-muted/25 px-4 py-3 text-[12px] text-muted-foreground">
                          <LoaderCircleIcon className="size-3.5 animate-spin" />
                          <span className="truncate">
                            {summarizeQueuedSubmission(queuedSubmissionPreview)}
                          </span>
                        </div>
                      ) : null}

                      <PromptInput
                        className="rounded-[24px] border border-border/50 bg-background p-0 shadow-[0_4px_14px_rgba(15,23,42,0.05)]"
                        globalDrop
                        multiple
                        onSubmit={handleSubmit}
                      >
                        <PromptInputAttachmentsDisplay />
                        <PromptInputBody>
                          <FileMentionTextarea
                            workspaceTree={desktopWorkspace?.tree ?? []}
                            className="min-h-[60px] rounded-none border-0 bg-transparent px-5 py-3 text-[14px] leading-6 shadow-none focus-visible:ring-0"
                            placeholder="输入 @ 选择文件，然后继续描述你的需求"
                          />
                        </PromptInputBody>
                        <PromptInputFooter className="border-border/40 border-t bg-transparent px-4 py-2.5">
                          <div className="flex flex-1" />
                          <PromptInputTools className="gap-2">
                            <PromptInputActionMenu>
                              <PromptInputActionMenuTrigger />
                              <PromptInputActionMenuContent>
                                <PromptInputActionAddAttachments />
                              </PromptInputActionMenuContent>
                            </PromptInputActionMenu>
                          </PromptInputTools>
                          <PromptInputSubmit
                            className="size-9 rounded-full border border-border/50 shadow-none"
                            onStop={handleStop}
                            status={status}
                          />
                        </PromptInputFooter>
                      </PromptInput>
                    </div>
                  </PromptInputProvider>
                </CardFooter>
              </Card>
            </section>
          </main>
        </div>
        <WorkspaceSearchDialog
          open={workspaceSearchOpen}
          onOpenChange={setWorkspaceSearchOpen}
          workspaceRoot={workspaceRoot}
          workspaceTree={desktopWorkspace?.tree ?? []}
          onSelectFile={(path) => {
            void handleSelectEditorFile(path);
          }}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
