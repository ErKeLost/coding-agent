"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTools,
  usePromptInputAttachments,
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
import { Plan } from "@/components/tool-ui/plan";
import { AppSidebar } from "@/components/app-sidebar";
import { FileMentionTextarea } from "@/components/rovix/file-mention-textarea";
import { WorkspaceSearchDialog } from "@/components/rovix/workspace-search-dialog";
import { ThemeSettingsPanel } from "@/components/rovix/theme-settings-panel";

import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  type DesktopWorkspaceNode,
  setStoredWorkspaceRoot,
} from "@/lib/desktop-workspace";
import {
  AppWindowIcon,
  CameraIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileCode2Icon,
  FolderIcon,
  GitBranchIcon,
  KeyboardIcon,
  LoaderCircleIcon,
  MonitorIcon,
  MousePointer2Icon,
  SearchIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";
import { gooeyToast } from "goey-toast";

import {
  type ChatItem,
  type ToolStep,
} from "@/lib/stream-event-bus";
import {
  summarizeThreadTitle as summarizeThreadTitleFromGraph,
} from "@/lib/workflow-graph";
import { useDesktopWorkspace } from "@/hooks/use-desktop-workspace";
import { useThreadSession } from "@/hooks/use-thread-session";
import { useAgentStream } from "@/hooks/use-agent-stream";

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

const summarizeThreadTitle = (value?: string | null) =>
  summarizeThreadTitleFromGraph(value ?? "");

const ThreadHistoryLoadingState = () => (
  <div className="flex min-h-[240px] flex-1 items-center justify-center px-6 py-8">
    <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground/70" />
  </div>
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
    id: "openrouter/z-ai/glm-5v-turbo",
    name: "GLM-5V Turbo",
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

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createThreadId = () =>
  `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    id.includes("glm-5v") ||
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

const PromptGuideButton = ({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="app-control inline-flex h-9 items-center gap-2 rounded-full border-0 px-3 text-[12px] font-medium text-foreground/88 shadow-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SparklesIcon className="size-3.5 text-primary/80" />
      引导
    </button>
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
      {selected ? <CheckIcon className="ml-auto size-3.5" /> : <div className="ml-auto size-3.5" />}
    </ModelSelectorItem>
  );
};

const CHAT_COLUMN_CLASS =
  "mx-auto w-full max-w-5xl px-6 md:px-8 xl:px-10";

const MODEL_STORAGE_KEY = "chat-selected-model";
const DEFAULT_MODEL_ID = "openrouter/openai/gpt-5.4-mini";

const logWorkspaceDebug = (label: string, payload?: Record<string, unknown>) => {
  console.info(`[workspace-debug] ${label}`, payload ?? {});
};

export default function Home() {
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [activeSection, setActiveSection] = useState<"chat" | "settings">("chat");
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [selectedAgent] = useState(DEFAULT_AGENT_ID);
  const [reasoningOpenState, setReasoningOpenState] = useState<Record<string, boolean>>({});
  const [toolOpenState, setToolOpenState] = useState<Record<string, boolean>>({});
  const previousToolStatusesRef = useRef<Record<string, "pending" | "done" | "error">>({});
  const previousThinkingStatusesRef = useRef<Record<string, "pending" | "done">>({});
  const params = useParams();
  const router = useRouter();
  const selectedModelData = models.find((m) => m.id === model);
  const modelChefs = useMemo(
    () => [...new Set(models.map((entry) => entry.chef))],
    [],
  );
  const selectedAgentData = AGENTS.find((agent) => agent.id === selectedAgent);
  const [threadSessionError, setThreadSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasMounted) return;
    try {
      const savedModel = window.localStorage.getItem(MODEL_STORAGE_KEY)?.trim();
      if (savedModel && models.some((entry) => entry.id === savedModel)) {
        setModel(savedModel);
        return;
      }
    } catch {
      // Ignore storage errors.
    }

    setModel(DEFAULT_MODEL_ID);
  }, [hasMounted]);

  useEffect(() => {
    if (!hasMounted || !model) return;
    try {
      window.localStorage.setItem(MODEL_STORAGE_KEY, model);
    } catch {
      // Ignore storage errors.
    }
  }, [hasMounted, model]);
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
  const activeWorkspaceLabel = summarizeWorkspaceRoot(
    workspaceRoot ?? activeThreadRecord?.workspaceRoot ?? null
  );
  const {
    status,
    error,
    guideState,
    guideText,
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
    modelSupportsImageInput,
  });

  useEffect(() => {
    void drainSubmissionQueue();
  }, [drainSubmissionQueue]);

  const roundSummaryByFirstActivityId = useMemo(() => {
    const summary = new Map<string, string>();
    type RoundCounts = Record<ActivityAction, { pending: number; done: number; error: number }>;
    const freshCounts = (): RoundCounts => ({
      browse: { pending: 0, done: 0, error: 0 },
      edit: { pending: 0, done: 0, error: 0 },
      run: { pending: 0, done: 0, error: 0 },
      search: { pending: 0, done: 0, error: 0 },
      plan: { pending: 0, done: 0, error: 0 },
      desktop: { pending: 0, done: 0, error: 0 },
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
        "desktop",
        "delegate",
        "other",
      ];
      const labelByAction: Record<ActivityAction, string> = {
        browse: "浏览",
        edit: "编辑",
        run: "运行",
        search: "搜索",
        plan: "计划",
        desktop: "桌面",
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

  const activeError = error ?? threadSessionError;

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
      (todo) => todo.status !== "completed" && todo.status !== "cancelled"
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
    handleSwitchWorkspaceBranch,
    handleCommitWorkspace,
    handlePushWorkspaceBranch,
  } = useDesktopWorkspace({
    hasMounted,
    recentThreadCount: recentThreads.length,
    workspaceRoot,
    currentThreadId: threadId || null,
    onNewThread: createThreadSession,
    setWorkspaceRoot,
    logWorkspaceDebug,
  });

  const resetThreadUiChrome = useCallback(() => {
    setToolOpenState({});
    previousToolStatusesRef.current = {};
    setReasoningOpenState({});
    previousThinkingStatusesRef.current = {};
    setThreadSessionError(null);
  }, []);

  const handleNewThread = useCallback((initialWorkspaceRoot?: string | null) => {
    resetThreadUiChrome();
    setActiveSection("chat");
    createThreadSession(initialWorkspaceRoot);
  }, [createThreadSession, resetThreadUiChrome]);

  const handleSelectThread = useCallback((nextThreadId: string) => {
    if (!nextThreadId || nextThreadId === threadId) return;
    resetThreadUiChrome();
    setActiveSection("chat");
    selectThreadSession(nextThreadId);
  }, [resetThreadUiChrome, selectThreadSession, threadId]);

  const handleDeleteThread = useCallback(async (targetThreadId: string) => {
    if (!targetThreadId) return;
    const deletingLastActiveThread =
      threadId === targetThreadId &&
      recentThreads.filter((entry) => entry.id !== targetThreadId).length === 0;

    resetThreadUiChrome();
    await deleteThreadSession(targetThreadId);

    if (!deletingLastActiveThread) {
      return;
    }

    setDesktopWorkspace(null);
    setEditorSelectedFile(null);
    setWorkspaceBranches(null);
    setStoredWorkspaceRoot(null);
  }, [
    deleteThreadSession,
    recentThreads,
    resetThreadUiChrome,
    setDesktopWorkspace,
    setEditorSelectedFile,
    setWorkspaceBranches,
    threadId,
  ]);

  const handleSelectEditorFile = handleOpenWorkspaceFile;
  const handleHeaderBranchChange = handleSwitchWorkspaceBranch;
  const handlePushWorkspace = handlePushWorkspaceBranch;
  const handleChatSubmit = useCallback(async (message: PromptInputMessage) => {
    if (!canStartConversation) {
      setThreadSessionError("请先创建或选择一个线程，然后再开始对话。");
      return;
    }

    if (!model) {
      setModelDialogOpen(true);
      setThreadSessionError("请先选择模型，然后再发送消息。");
      return;
    }

    await handleSubmit(message);
  }, [canStartConversation, handleSubmit, model]);

  const handleSelectModel = useCallback((nextModel: string) => {
    setModel(nextModel);
    setModelDialogOpen(false);
  }, []);

  const handleCreateBranch = useCallback(async () => {
    if (!isDesktopRuntime) return;
    const branchName = window.prompt("新分支名称", "feature/");
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
        onOpenSettings={() => setActiveSection("settings")}
        activeSection={activeSection}
        recentThreads={recentThreads}
        workspaceRoot={workspaceRoot}
      />
      <SidebarInset className="app-shell bg-transparent">
        <ModelSelector open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
          <ModelSelectorContent
            className="max-w-[420px] rounded-[20px] border border-border/60 bg-background/96 shadow-2xl backdrop-blur"
            title="选择模型"
          >
            <ModelSelectorInput placeholder="搜索模型..." className="text-[12px]" />
            <ModelSelectorList className="max-h-[340px]">
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
        <div className="app-shell flex h-screen flex-col overflow-hidden bg-transparent text-foreground">
          <main className="min-h-0 flex-1 overflow-hidden">
            <section className="flex h-full min-h-0 min-w-0 flex-col border-l border-border/50 bg-transparent">
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
                            {activeSection === "settings"
                              ? "设置"
                              : activeThreadRecord?.title ?? "Untitled thread"}
                          </span>
                          {activeSection === "chat" ? (
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
                          ) : null}
                        </div>
                        <div className="mt-1 flex items-center gap-2 overflow-hidden text-[10px] text-muted-foreground/80">
                          {activeSection === "settings" ? (
                            <>
                              <span className="truncate">Rovix</span>
                              <span className="text-border">•</span>
                              <span className="truncate">外观与偏好设置</span>
                            </>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="hidden items-center gap-2 md:flex">
                      {activeSection === "settings" ? (
                        <button
                          type="button"
                          onClick={() => setActiveSection("chat")}
                          className="flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-background px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          返回对话
                        </button>
                      ) : (
                        <>
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
                              className="min-w-[220px] rounded-xl border border-white/10 bg-[#242321] p-1.5 text-white shadow-[0_16px_36px_rgba(0,0,0,0.24)]"
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
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-0">
                  {activeSection === "settings" ? (
                    <ThemeSettingsPanel onBack={() => setActiveSection("chat")} />
                  ) : (
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
                              (entry): entry is Extract<ChatItem, { type: "tool" }> =>
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
                              className={item.role === "assistant" ? "mt-3" : "mt-1.5"}
                            >
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
                  )}
                </CardContent>

                {activeSection === "chat" ? (
                <CardFooter className="px-4 py-3">
                  <PromptInputProvider initialInput="">
                    <div className={cn(CHAT_COLUMN_CLASS)}>
                      <div
                        className={cn(
                          "app-panel app-frosted overflow-hidden",
                          activePlan ? "rounded-[18px]" : "rounded-[16px]",
                        )}
                      >
                        {activePlan ? (
                          <Plan
                            {...activePlan}
                            maxVisibleTodos={2}
                            showProgress
                            className="w-full rounded-none border-0 border-b border-border/45 bg-transparent py-0 shadow-none"
                          />
                        ) : null}

                        {queuedSubmissionPreview ? (
                          <div
                            className={cn(
                              "app-soft-card flex w-full flex-wrap items-center justify-between gap-2 rounded-none border-x-0 border-t-0 px-4 py-3 text-[12px] text-muted-foreground shadow-none",
                              activePlan ? "border-b border-border/40" : "",
                            )}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <LoaderCircleIcon className="size-3.5 animate-spin" />
                              <span className="truncate">
                                {summarizeQueuedSubmission(queuedSubmissionPreview)}
                              </span>
                            </div>
                            <PromptGuideButton
                              disabled={!canStartConversation}
                              onClick={() => void promoteQueuedSubmissionToGuide()}
                            />
                          </div>
                        ) : null}

                        {guideBanner ? (
                          <div
                            className="app-soft-card flex w-full flex-wrap items-center justify-between gap-2 rounded-none border-x-0 border-t-0 px-4 py-3 text-[12px] text-muted-foreground shadow-none"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <SparklesIcon className="size-3.5 shrink-0 text-primary/80" />
                              <span className="truncate">
                                {guideBanner.text}
                              </span>
                            </div>
                            {queuedSubmissionPreview ? (
                              <button
                                type="button"
                                onClick={() => void promoteQueuedSubmissionToGuide()}
                                className="shrink-0 text-[11px] text-foreground/75 transition-colors hover:text-foreground"
                              >
                                转为引导
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        <PromptInput
                          className={cn(
                            "border-0 bg-transparent p-0 shadow-none",
                            activePlan || queuedSubmissionPreview
                              ? "rounded-none"
                              : "rounded-[16px]",
                          )}
                          globalDrop={canStartConversation}
                          multiple
                          onSubmit={handleChatSubmit}
                        >
                          <PromptInputAttachmentsDisplay />
                          <PromptInputBody>
                            <FileMentionTextarea
                              workspaceTree={desktopWorkspace?.tree ?? []}
                              className="min-h-[60px] rounded-none border-0 bg-transparent px-5 py-3 text-[14px] leading-6 shadow-none focus-visible:ring-0"
                              placeholder={
                                canStartConversation
                                  ? "输入 @ 选择文件，然后继续描述你的需求"
                                  : "请先创建或选择一个线程"
                              }
                              readOnly={!canStartConversation}
                            />
                          </PromptInputBody>
                          {!canStartConversation ? (
                            <div className="border-border/35 border-t px-5 py-2.5 text-[12px] text-muted-foreground">
                              {chatDisabledReason}
                            </div>
                          ) : !model ? (
                            <div className="border-border/35 border-t px-5 py-2.5 text-[12px] text-muted-foreground">
                              请先选择模型，然后再发送消息。
                            </div>
                          ) : null}
                          <PromptInputFooter className="flex-wrap border-border/40 border-t bg-transparent px-4 py-2.5">
                            <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:w-full">
                              <ModelSelector open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
                                <ModelSelectorTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="h-8 min-w-0 max-w-[180px] justify-between gap-2 rounded-[10px] border-border/60 bg-background/80 px-2.5 text-[11px] shadow-none max-sm:w-full max-sm:max-w-none"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      {selectedModelData?.chefSlug ? (
                                        <ModelSelectorLogo
                                          className="size-3.5 shrink-0"
                                          provider={selectedModelData.chefSlug}
                                        />
                                      ) : null}
                                      <span className="truncate">
                                        {selectedModelData?.name ?? "选择模型"}
                                      </span>
                                    </div>
                                    <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                                  </Button>
                                </ModelSelectorTrigger>
                              </ModelSelector>
                            </div>
                            <PromptInputTools className="shrink-0 gap-2 max-sm:ml-auto">
                              <PromptInputActionMenu>
                                <PromptInputActionMenuTrigger disabled={!canStartConversation} />
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
                      </div>
                    </div>
                  </PromptInputProvider>
                </CardFooter>
                ) : null}
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
