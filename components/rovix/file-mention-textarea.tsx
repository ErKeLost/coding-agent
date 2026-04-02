"use client";

import { PromptInputTextarea, usePromptInputController } from "@/components/ai-elements/prompt-input";
import type { DesktopWorkspaceNode } from "@/lib/desktop-workspace";
import { cn } from "@/lib/utils";
import { FileCode2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MentionCandidate = {
  path: string;
  name: string;
  parentPath: string;
};

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

type FileMentionTextareaProps = React.ComponentProps<typeof PromptInputTextarea> & {
  workspaceTree?: DesktopWorkspaceNode[];
};

const flattenWorkspaceFiles = (nodes: DesktopWorkspaceNode[]): MentionCandidate[] => {
  const files: MentionCandidate[] = [];

  const walk = (items: DesktopWorkspaceNode[]) => {
    items.forEach((node) => {
      if (node.isDir) {
        walk(node.children ?? []);
        return;
      }

      const parentSegments = node.path.split("/").slice(0, -1);
      files.push({
        path: node.path,
        name: node.name,
        parentPath: parentSegments.join("/"),
      });
    });
  };

  walk(nodes);
  return files;
};

const getActiveMention = (value: string, caretIndex: number): ActiveMention | null => {
  const textBeforeCaret = value.slice(0, caretIndex);
  const mentionStart = textBeforeCaret.lastIndexOf("@");
  if (mentionStart < 0) return null;

  const previousChar = mentionStart > 0 ? textBeforeCaret[mentionStart - 1] : "";
  if (previousChar && !/\s|\(|\[|\{/.test(previousChar)) {
    return null;
  }

  const mentionText = textBeforeCaret.slice(mentionStart + 1);
  if (/[\s\n]/.test(mentionText)) {
    return null;
  }

  return {
    start: mentionStart,
    end: caretIndex,
    query: mentionText,
  };
};

export function FileMentionTextarea({
  workspaceTree = [],
  className,
  onChange,
  onKeyDown,
  ...props
}: FileMentionTextareaProps) {
  const controller = usePromptInputController();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);
  const lastMentionQueryRef = useRef<string | null>(null);
  const files = useMemo(() => flattenWorkspaceFiles(workspaceTree), [workspaceTree]);

  const mentionResults = useMemo(() => {
    if (!activeMention) return [];
    const query = activeMention.query.trim().toLowerCase();

    return files
      .map((file) => {
        const lowerName = file.name.toLowerCase();
        const lowerPath = file.path.toLowerCase();
        const score = !query
          ? 1
          : lowerName.includes(query)
            ? 3
            : lowerPath.includes(query)
              ? 2
              : query.split("").every((char) => lowerPath.includes(char))
                ? 1
                : 0;
        return { ...file, score };
      })
      .filter((file) => file.score > 0)
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, 8);
  }, [activeMention, files]);

  const syncMentionState = (nextValue: string, caretIndex: number) => {
    const nextMention = getActiveMention(nextValue, caretIndex);
    if (nextMention?.query !== lastMentionQueryRef.current) {
      setSelectedIndex(0);
      lastMentionQueryRef.current = nextMention?.query ?? null;
    }
    setActiveMention(nextMention);
  };

  const insertMention = (candidate: MentionCandidate) => {
    if (!activeMention) return;

    const nextValue =
      controller.textInput.value.slice(0, activeMention.start) +
      `@${candidate.path} ` +
      controller.textInput.value.slice(activeMention.end);
    controller.textInput.setInput(nextValue);
    setActiveMention(null);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const nextCaret = activeMention.start + candidate.path.length + 2;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  useEffect(() => {
    if (!activeMention) {
      return;
    }

    const updatePanelPosition = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const rect = textarea.getBoundingClientRect();
      setPanelStyle({
        position: "fixed",
        left: rect.left,
        top: rect.top - 12,
        width: rect.width,
        transform: "translateY(-100%)",
        zIndex: 80,
      });
    };

    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);

    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [activeMention]);

  const mentionPanel =
    activeMention && panelStyle
      ? createPortal(
          <div
            style={panelStyle}
            className="overflow-hidden rounded-2xl border border-border/70 bg-popover/96 p-2 text-popover-foreground shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-2 px-2 text-[11px] font-medium text-muted-foreground">
              Files
            </div>
            <div className="space-y-1">
              {mentionResults.length > 0 ? (
                mentionResults.map((candidate, index) => (
                  <button
                    key={candidate.path}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertMention(candidate);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                      index === selectedIndex ? "bg-muted" : "hover:bg-muted/70"
                    )}
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                      <FileCode2Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {candidate.name}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {candidate.parentPath || "workspace"}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                  没有匹配文件
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {mentionPanel}

      <PromptInputTextarea
        {...props}
        textareaRef={textareaRef}
        className={className}
        onChange={(event) => {
          onChange?.(event);
          syncMentionState(event.currentTarget.value, event.currentTarget.selectionStart ?? event.currentTarget.value.length);
        }}
        onKeyDown={(event) => {
          if (activeMention && mentionResults.length > 0) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelectedIndex((current) => (current + 1) % mentionResults.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedIndex((current) =>
                current === 0 ? mentionResults.length - 1 : current - 1
              );
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              insertMention(mentionResults[selectedIndex] ?? mentionResults[0]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setActiveMention(null);
              return;
            }
          }

          onKeyDown?.(event);
        }}
      />
    </>
  );
}
