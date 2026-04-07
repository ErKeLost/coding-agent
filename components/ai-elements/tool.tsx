/* eslint-disable @next/next/no-img-element */
"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CalculatorIcon,
  CalendarIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  CloudSunIcon,
  CircleIcon,
  ClockIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  FileIcon,
  GlobeIcon,
  ImageIcon,
  LineChartIcon,
  MailIcon,
  MapIcon,
  MousePointerClickIcon,
  PlugIcon,
  SearchIcon,
  TerminalIcon,
  TrophyIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement, useMemo, useState } from "react";
import { CodeBlock } from "./code-block";
import { File, PatchDiff } from "@pierre/diffs/react";
import { Terminal } from "@/components/tool-ui/terminal";
import { ImageGallery } from "@/components/tool-ui/image-gallery";
import { Image as ToolImage } from "@/components/tool-ui/image";
import type { BundledLanguage } from "shiki";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group not-prose relative w-full overflow-hidden rounded-lg border border-border/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.01))] shadow-[0_1px_0_rgba(255,255,255,0.06),0_4px_12px_rgba(2,6,23,0.05)] ring-1 ring-black/5 transition-all duration-200 hover:border-foreground/15",
      className
    )}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
  meta?: ReactNode;
} & (
    | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
    | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
  );

export const getStatusBadge = (status: ToolPart["state"]) => {
  const labels: Record<ToolPart["state"], string> = {
    "input-streaming": "Pending",
    "input-available": "Running",
    "approval-requested": "Awaiting Approval",
    "approval-responded": "Responded",
    "output-available": "Completed",
    "output-error": "Error",
    "output-denied": "Denied",
  };

  const icons: Record<ToolPart["state"], ReactNode> = {
    "input-streaming": <CircleIcon className="size-3" />,
    "input-available": <ClockIcon className="size-3 animate-pulse" />,
    "approval-requested": <ClockIcon className="size-3 text-yellow-600" />,
    "approval-responded": <CheckCircleIcon className="size-3 text-blue-600" />,
    "output-available": <CheckCircleIcon className="size-3 text-emerald-500" />,
    "output-error": <XCircleIcon className="size-3 text-amber-500" />,
    "output-denied": <XCircleIcon className="size-3 text-amber-500" />,
  };

  return (
    <Badge
      className="gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm"
      variant="secondary"
    >
      {icons[status]}
      {labels[status]}
    </Badge>
  );
};

const getToolIcon = (toolName?: string) => {
  const name = toolName?.toLowerCase() ?? "";

  if (name.includes("shell") || name.includes("terminal")) {
    return <TerminalIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("search")) {
    return <SearchIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("web") || name.includes("browser") || name.includes("http")) {
    return <GlobeIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("image") || name.includes("img")) {
    return <ImageIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("weather")) {
    return <CloudSunIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("finance") || name.includes("stock") || name.includes("price")) {
    return <LineChartIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("calc") || name.includes("math")) {
    return <CalculatorIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("time") || name.includes("clock")) {
    return <ClockIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("sports")) {
    return <TrophyIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("file") || name.includes("fs")) {
    return <FileIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("db") || name.includes("database")) {
    return <DatabaseIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("mcp") || name.includes("plugin")) {
    return <PlugIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("open") || name.includes("link")) {
    return <ExternalLinkIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("click") || name.includes("tap")) {
    return <MousePointerClickIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("map") || name.includes("geo")) {
    return <MapIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("mail") || name.includes("email")) {
    return <MailIcon className="size-3.5 text-foreground/60" />;
  }
  if (name.includes("calendar") || name.includes("schedule")) {
    return <CalendarIcon className="size-3.5 text-foreground/60" />;
  }

  return <WrenchIcon className="size-3.5 text-foreground/60" />;
};

const getStatusTone = (status: ToolPart["state"]) => {
  switch (status) {
    case "output-available":
    case "approval-responded":
      return "bg-emerald-500/8 text-emerald-700 border-emerald-500/20";
    case "output-error":
    case "output-denied":
      return "bg-amber-500/8 text-amber-700 border-amber-500/20";
    case "input-available":
    case "input-streaming":
    case "approval-requested":
    default:
      return "bg-amber-500/8 text-amber-700 border-amber-500/20";
  }
};

export const ToolHeader = ({
  className,
  title,
  meta,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const isBusy =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested";

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-2 border-border/60 border-b bg-[linear-gradient(90deg,rgba(255,255,255,0.04),transparent_55%)] px-2 py-1 transition-colors hover:bg-muted/15",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-background/80 shadow-sm",
            getStatusTone(state)
          )}
        >
          {getToolIcon(type === "dynamic-tool" ? toolName : derivedName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              tool
            </span>
            <span className="truncate text-[12px] font-semibold tracking-tight text-foreground">
              {title ?? derivedName}
            </span>
            {meta ? (
              <span className="truncate rounded-full border border-border/60 bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/90">
                {meta}
              </span>
            ) : null}
            {getStatusBadge(state)}
            {isBusy ? (
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                active
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in bg-background/50",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div
    className={cn("border-border/60 border-b px-4 py-3", className)}
    {...props}
  >
    <details className="group">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Parameters
      </summary>
      <div className="mt-2 overflow-hidden rounded-xl border border-border/50 bg-background/70 shadow-inner">
        <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
      </div>
    </details>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
  toolName?: string;
  input?: ToolPart["input"];
};

type ToolResult = {
  title?: string;
  output?: string;
  metadata?: Record<string, unknown>;
  attachments?: Array<{ mime?: string; data?: string }>;
};

const extractPatchDiff = (output: ToolPart["output"]) => {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (typeof record.diff === "string") return record.diff;
  const metadata = record.metadata;
  if (metadata && typeof metadata === "object") {
    const metaRecord = metadata as Record<string, unknown>;
    if (typeof metaRecord.diff === "string") return metaRecord.diff;
  }
  return null;
};

const normalizeToolResult = (output: ToolPart["output"]) => {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (typeof record.output !== "string") return null;
  return record as ToolResult;
};

const extractFileBody = (raw: string) => {
  const match = raw.match(/<file>\n([\s\S]*?)\n<\/file>/);
  const body = match?.[1] ?? raw.replace(/\n?\(End of file[\s\S]*$/i, "");
  return body
    .split("\n")
    .map((line) => line.replace(/^\d{5}\|\s?/, ""))
    .join("\n");
};

const toLanguageFromPath = (filePath?: string): BundledLanguage => {
  if (!filePath) return "text";
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
      return "ts";
    case "tsx":
      return "tsx";
    case "js":
      return "js";
    case "jsx":
      return "jsx";
    case "json":
      return "json";
    case "md":
    case "mdx":
      return "md";
    case "css":
      return "css";
    case "html":
      return "html";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
    case "bash":
    case "zsh":
      return "bash";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "zig":
      return "zig";
    case "toml":
      return "toml";
    case "xml":
      return "xml";
    case "sql":
      return "sql";
    default:
      return "text";
  }
};

const buildFileTree = (lines: string[], basePath?: string) => {
  if (lines.length === 0) return "";
  const root = basePath?.replace(/\/+$/, "") ?? "/";
  const entries = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(root, "").replace(/^\//, ""));

  const tree: Record<string, unknown> = {};
  for (const entry of entries) {
    const isDir = entry.endsWith("/");
    const parts = entry.replace(/\/$/, "").split("/").filter(Boolean);
    let cursor: Record<string, unknown> = tree;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (!cursor[part]) {
        cursor[part] = { __isDir: i < parts.length - 1 || isDir, __children: {} };
      }
      const node = cursor[part] as { __children: Record<string, unknown> };
      cursor = node.__children;
    }
  }

  const renderNode = (
    node: Record<string, unknown>,
    depth = 0
  ): string[] => {
    return Object.keys(node)
      .sort()
      .flatMap((name) => {
        const entry = node[name] as { __isDir?: boolean; __children?: Record<string, unknown> };
        const prefix = "  ".repeat(depth);
        const label = entry.__isDir ? `${name}/` : name;
        const lines = [`${prefix}- ${label}`];
        if (entry.__children && Object.keys(entry.__children).length > 0) {
          lines.push(...renderNode(entry.__children, depth + 1));
        }
        return lines;
      });
  };

  const treeLines = renderNode(tree);
  return [root, ...treeLines].join("\n");
};

const toTerminalPayload = (
  toolName: string,
  input: ToolPart["input"],
  result: ToolResult | null,
  outputText?: string,
  errorText?: string,
) => {
  const meta = result?.metadata ?? {};
  const exit = typeof meta.exit === "number" ? meta.exit : errorText ? 1 : 0;
  const command = (input as { command?: string } | undefined)?.command ?? toolName;
  const cwd = (input as { workdir?: string } | undefined)?.workdir;
  const stdout = typeof meta.stdout === "string" ? meta.stdout : outputText ?? "";
  const stderr = typeof meta.stderr === "string" ? meta.stderr : undefined;
  const truncated = typeof meta.truncated === "boolean" ? meta.truncated : undefined;
  return {
    id: `terminal-${toolName}-${command}`,
    command,
    stdout,
    stderr,
    exitCode: exit,
    cwd,
    truncated,
    maxCollapsedLines: 24,
  };
};

const extractImageOutputs = (
  output: ToolPart["output"],
): { primary?: { src: string; title?: string }; gallery?: string[] } => {
  if (!output || typeof output !== "object") return {};
  const record = output as Record<string, unknown>;
  const url =
    (typeof record.url === "string" ? record.url : undefined) ??
    (typeof record.publicUrl === "string" ? record.publicUrl : undefined) ??
    (typeof record.dataUrl === "string" ? record.dataUrl : undefined);
  const topLevelUrls = Array.isArray(record.urls)
    ? (record.urls as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const images = Array.isArray(record.images)
    ? (record.images as Array<Record<string, unknown>>)
    : [];
  const gallery = [...topLevelUrls, ...images
    .map((img) =>
      (typeof img.dataUrl === "string" ? img.dataUrl : undefined) ??
      (typeof img.publicUrl === "string" ? img.publicUrl : undefined) ??
      (typeof img.url === "string" ? img.url : undefined)
    )]
    .filter((src): src is string => typeof src === "string");
  const attachments = Array.isArray(record.attachments)
    ? (record.attachments as Array<Record<string, unknown>>)
    : [];
  const attachmentImages = attachments
    .map((item) => {
      const mime = typeof item.mime === "string" ? item.mime : "";
      const data = typeof item.data === "string" ? item.data : undefined;
      return mime.startsWith("image/") ? data : undefined;
    })
    .filter((src): src is string => typeof src === "string");
  if (attachmentImages.length > 0) {
    gallery.push(...attachmentImages);
  }
  return { primary: url ? { src: url } : undefined, gallery };
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  toolName,
  input,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  const [isExpanded, setIsExpanded] = useState(false);

  const patchDiff = extractPatchDiff(output);
  const toolResult = normalizeToolResult(output);
  const outputText =
    toolResult?.output ??
    (typeof output === "string" ? output : undefined);
  const toolNameLower = toolName?.toLowerCase() ?? "";
  const filePath =
    (input as { filePath?: string } | undefined)?.filePath ?? toolResult?.title;
  const inputContent = (input as { content?: string } | undefined)?.content;

  const isReadTool = toolNameLower.includes("read");
  const isListTool = toolNameLower.includes("list") || toolNameLower === "ls";
  const isWriteTool = toolNameLower === "write" || toolNameLower.includes("write");
  const isTerminalTool =
    toolNameLower === "bash" ||
    toolNameLower.includes("terminal") ||
    toolNameLower.includes("shell");
  const hasFileOutput = Boolean(outputText);

  let customContent: ReactNode = null;
  const outputSummary =
    errorText
      ? "execution error"
      : patchDiff
        ? "diff output"
        : isTerminalTool
          ? "terminal output"
          : isReadTool
            ? "file content"
            : isListTool
              ? "directory listing"
              : hasFileOutput
                ? "tool result"
                : "structured result";
  let Output = <div>{output as ReactNode}</div>;
  const imageOutputs = useMemo(() => extractImageOutputs(output), [output]);
  const allowImagePreview =
    toolNameLower.includes("image") ||
    toolNameLower.includes("img") ||
    toolNameLower.includes("browser");

  if (patchDiff) {
    Output = null;
    customContent = (
      <div className="bg-background/80">
        <div className="max-h-[260px] overflow-auto rounded-xl border border-border/60 bg-background">
          <PatchDiff
            patch={patchDiff}
            options={{
              theme: { dark: "pierre-dark", light: "pierre-light" },
              diffStyle: "unified",
              diffIndicators: "bars",
              overflow: "wrap",
              lineDiffType: "word-alt",
            }}
          />
        </div>
      </div>
    );
  } else if (isTerminalTool) {
    Output = null;
    const terminalPayload = toTerminalPayload(
      toolNameLower || "terminal",
      input,
      toolResult,
      outputText,
      errorText,
    );
    customContent = (
      <div className="bg-background/80">
        <div className="max-h-[260px] overflow-auto rounded-xl border border-border/60 bg-background">
          <Terminal {...terminalPayload} />
        </div>
      </div>
    );
  } else if (
    allowImagePreview &&
    (imageOutputs.primary || (imageOutputs.gallery?.length ?? 0) > 0)
  ) {
    Output = null;
    const idBase = `image-${toolNameLower || "image"}`;
    if (imageOutputs.gallery && imageOutputs.gallery.length > 1) {
      customContent = (
        <div className="bg-background/80">
          <div className="max-h-[240px] overflow-auto">
            <ImageGallery
              id={idBase}
              title={toolResult?.title}
              images={imageOutputs.gallery.map((src, index) => ({
                id: `${idBase}-${index}`,
                src,
                alt: toolResult?.title ?? `Generated image ${index + 1}`,
                width: 1024,
                height: 1024,
              }))}
            />
          </div>
        </div>
      );
    } else if (imageOutputs.primary?.src) {
      customContent = (
        <div className="bg-background/80">
          <div className="max-h-[240px] overflow-auto">
            <ToolImage
              id={idBase}
              assetId={idBase}
              src={imageOutputs.primary.src}
              alt={toolResult?.title ?? "Generated image"}
              title={toolResult?.title}
            />
          </div>
        </div>
      );
    }
  } else if (isReadTool && hasFileOutput) {
    Output = null;
    const code = extractFileBody(outputText ?? "");
    const language = toLanguageFromPath(filePath);
    const previewAttachment = toolResult?.attachments?.find((item) =>
      item.mime?.startsWith("image/")
    );
    if (allowImagePreview && previewAttachment?.data) {
      customContent = (
        <div className="bg-background/80">
          <img
            src={previewAttachment.data}
            alt={filePath ?? "file preview"}
            className="max-h-60 w-full rounded-lg border border-border/60 object-contain"
          />
        </div>
      );
    } else {
      const collapsedHeight = "240px";
      customContent = (
        <div className="bg-background/80">
          {/* <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              File
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
            >
              {isExpanded ? "Collapse" : "Expand"}
            </button>
          </div> */}
          <div className="relative max-h-[240px] overflow-auto rounded-lg border border-border/60 bg-background">
            <div
              className="transition-[max-height] duration-300"
              style={{
                maxHeight: isExpanded ? "none" : collapsedHeight,
                overflow: isExpanded ? "visible" : "auto",
              }}
            >
              <File
                file={{ name: filePath ?? "file", contents: code }}
                options={{
                  theme: { dark: "pierre-dark", light: "pierre-light" },
                  overflow: "wrap",
                  disableLineNumbers: false,
                  disableFileHeader: false,
                }}
              />
            </div>
            {!isExpanded ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background to-transparent" />
            ) : null}
          </div>
        </div>
      );
    }
  } else if (isWriteTool && typeof inputContent === "string") {
    Output = null;
    const language = toLanguageFromPath(filePath);
    const collapsedHeight = "240px";
    customContent = (
      <div className="bg-background/80">
        <div className="mb-2 flex items-center justify-between">
          {/* <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Written File
          </span> */}
          {/* <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition hover:text-foreground"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button> */}
        </div>
        <div className="relative max-h-[240px] overflow-auto rounded-lg border border-border/60 bg-background">
          <div
            className="transition-[max-height] duration-300"
            style={{
              maxHeight: isExpanded ? "none" : collapsedHeight,
              overflow: isExpanded ? "visible" : "auto",
            }}
          >
            <File
              file={{ name: filePath ?? "file", contents: inputContent }}
              options={{
                theme: { dark: "pierre-dark", light: "pierre-light" },
                overflow: "wrap",
                disableLineNumbers: false,
                disableFileHeader: false,
              }}
            />
          </div>
          {!isExpanded ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background to-transparent" />
          ) : null}
        </div>
      </div>
    );
  } else if (isListTool && hasFileOutput) {
    Output = null;
    const tree = buildFileTree(outputText?.split("\n") ?? [], toolResult?.title);
    customContent = (
      <div className="bg-background/80">
        <pre className="max-h-[260px] overflow-auto rounded-xl border border-border/60 bg-background px-3 py-2 text-[11px] leading-relaxed text-foreground">
          {tree}
        </pre>
      </div>
    );
  } else if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2 p-2", className)} {...props}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {outputSummary}
        </span>
        {errorText ? (
          <span className="text-[10px] uppercase tracking-[0.18em] text-destructive/80">
            failed
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "max-h-72 overflow-auto rounded-xl border border-border/50 text-xs [&_table]:w-full shadow-inner",
          errorText
            ? "bg-destructive/6 text-destructive"
            : "bg-background/70 text-foreground"
        )}
      >
        {customContent}
        {errorText && <div className="p-1">{errorText}</div>}
        {Output ? <div className="p-1">{Output}</div> : null}
      </div>
    </div>
  );
};
