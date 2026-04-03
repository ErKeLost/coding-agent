"use client";

import { Button } from "@/components/ui/button";
import {
  PromptInputTextarea,
  type PromptInputMessage,
  usePromptInputAttachments,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import type { DesktopWorkspaceNode } from "@/lib/desktop-workspace";
import { cn } from "@/lib/utils";
import { FileCode2Icon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type FileMentionCandidate = {
  kind: "file";
  path: string;
  name: string;
  parentPath: string;
};

type SkillMentionCandidate = {
  kind: "skill";
  id: string;
  name: string;
  description: string;
  shortDescription?: string;
  filePath: string;
  scope: "workspace" | "user";
};

type MentionCandidate = FileMentionCandidate | SkillMentionCandidate;

type MentionSearchResult = MentionCandidate & {
  score: number;
};

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

type FileMentionTextareaProps = React.ComponentProps<typeof PromptInputTextarea> & {
  workspaceTree?: DesktopWorkspaceNode[];
  workspaceRoot?: string | null;
  lastSubmittedMessage?: PromptInputMessage | null;
};

const flattenWorkspaceFiles = (nodes: DesktopWorkspaceNode[]): FileMentionCandidate[] => {
  const files: FileMentionCandidate[] = [];

  const walk = (items: DesktopWorkspaceNode[]) => {
    items.forEach((node) => {
      if (node.isDir) {
        walk(node.children ?? []);
        return;
      }

      const parentSegments = node.path.split("/").slice(0, -1);
      files.push({
        kind: "file",
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
  workspaceRoot,
  lastSubmittedMessage,
  className,
  onChange,
  onKeyDown,
  ...props
}: FileMentionTextareaProps) {
  const controller = usePromptInputController();
  const attachments = usePromptInputAttachments();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [skills, setSkills] = useState<SkillMentionCandidate[]>([]);
  const lastMentionQueryRef = useRef<string | null>(null);
  const files = useMemo(() => flattenWorkspaceFiles(workspaceTree), [workspaceTree]);
  const availableSkills = useMemo(
    () => (workspaceRoot?.trim() ? skills : []),
    [skills, workspaceRoot],
  );

  useEffect(() => {
    if (!workspaceRoot?.trim()) {
      return;
    }

    const abortController = new AbortController();
    const query = new URLSearchParams({ workspaceRoot });

    void fetch(`/api/skills?${query.toString()}`, {
      cache: "no-store",
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load skills");
        }

        const payload = (await response.json()) as {
          skills?: Array<{
            id: string;
            name: string;
            description: string;
            shortDescription?: string;
            filePath: string;
            scope: "workspace" | "user";
          }>;
        };

        if (!abortController.signal.aborted) {
          setSkills(
            Array.isArray(payload.skills)
              ? payload.skills.map((skill) => ({
                  kind: "skill",
                  id: skill.id,
                  name: skill.name,
                  description: skill.description,
                  shortDescription: skill.shortDescription,
                  filePath: skill.filePath,
                  scope: skill.scope,
                }))
              : [],
          );
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setSkills([]);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [workspaceRoot]);

  const mentionResults = useMemo(() => {
    if (!activeMention) return [] as MentionSearchResult[];
    const query = activeMention.query.trim().toLowerCase();

    const matchedSkills: MentionSearchResult[] = availableSkills
      .map((skill) => {
        const lowerName = skill.name.toLowerCase();
        const lowerDescription = skill.description.toLowerCase();
        const score = !query
          ? 4
          : lowerName.includes(query)
            ? 5
            : lowerDescription.includes(query)
              ? 3
              : query.split("").every((char) => lowerName.includes(char))
                ? 2
                : 0;
        return { ...skill, score };
      })
      .filter((skill) => skill.score > 0);

    const matchedFiles: MentionSearchResult[] = files
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
      .filter((file) => file.score > 0);

    return [...matchedSkills, ...matchedFiles]
      .sort((left, right) => {
        if (left.score !== right.score) return right.score - left.score;
        if (left.kind !== right.kind) return left.kind === "skill" ? -1 : 1;
        if (left.kind === "skill" && right.kind === "skill") {
          return left.name.localeCompare(right.name);
        }
        return left.path.localeCompare((right as FileMentionCandidate).path);
      })
      .slice(0, 8);
  }, [activeMention, availableSkills, files]);

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

    const insertedValue =
      candidate.kind === "skill"
        ? `[$${candidate.name}](skill://${candidate.filePath}) `
        : `@${candidate.path} `;

    const nextValue =
      controller.textInput.value.slice(0, activeMention.start) +
      insertedValue +
      controller.textInput.value.slice(activeMention.end);
    controller.textInput.setInput(nextValue);
    setActiveMention(null);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const nextCaret = activeMention.start + insertedValue.length;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const restorePreviousMessage = () => {
    if (!lastSubmittedMessage) return;

    controller.textInput.setInput(lastSubmittedMessage.text);
    attachments.restore(lastSubmittedMessage.files.map((file) => ({ ...file })));
    setActiveMention(null);

    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const caret = lastSubmittedMessage.text.length;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  };

  const skillResults = mentionResults.filter(
    (candidate): candidate is MentionSearchResult & SkillMentionCandidate => candidate.kind === "skill",
  );
  const fileResults = mentionResults.filter(
    (candidate): candidate is MentionSearchResult & FileMentionCandidate => candidate.kind === "file",
  );

  const getCandidateIndex = (candidate: MentionSearchResult) =>
    mentionResults.findIndex((item) =>
      item.kind === "skill" && candidate.kind === "skill"
        ? item.id === candidate.id
        : item.kind === "file" && candidate.kind === "file"
          ? item.path === candidate.path
          : false,
    );

  return (
    <div className="relative w-full">
      {activeMention ? (
        <div className="mb-[-1px]">
          <div
            className="overflow-hidden rounded-t-[14px] border border-input border-b-0 text-popover-foreground dark:shadow-none"
            style={{
              background: "var(--app-panel-bg)",
              boxShadow: "var(--app-panel-shadow)",
            }}
          >
            <div
              className="border-input border-b px-4 py-2 text-[10px] font-medium tracking-[0.08em] text-primary/70 uppercase"
              style={{
                background:
                  "color-mix(in srgb, var(--app-soft-fill) 78%, transparent)",
              }}
            >
              Resources
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto px-1 py-1">
              {mentionResults.length > 0 ? (
                <>
                  {skillResults.length > 0 ? (
                    <div className="space-y-0.5">
                      <div className="px-3 py-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Skills
                      </div>
                      {skillResults.map((candidate) => {
                        const index = getCandidateIndex(candidate);
                        return (
                          <Button
                            key={candidate.id}
                            type="button"
                            variant="ghost"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              insertMention(candidate);
                            }}
                            className={cn(
                              "h-auto w-full justify-start gap-2 rounded-[9px] px-2 py-1.5 text-left shadow-none transition-colors",
                              index === selectedIndex ? "bg-primary/10" : "hover:bg-primary/[0.06]",
                            )}
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/18 bg-primary/[0.07] text-primary/90">
                              <SparklesIcon className="size-3" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11.5px] font-medium leading-5 text-foreground">
                                {candidate.name}
                              </span>
                              <span className="block truncate text-[10.5px] leading-4 text-muted-foreground">
                                {candidate.shortDescription ?? candidate.description}
                              </span>
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  ) : null}
                  {fileResults.length > 0 ? (
                    <div className="space-y-0.5">
                      <div className="px-3 py-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                        Files
                      </div>
                      {fileResults.map((candidate) => {
                        const index = getCandidateIndex(candidate);
                        return (
                          <Button
                            key={candidate.path}
                            type="button"
                            variant="ghost"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              insertMention(candidate);
                            }}
                            className={cn(
                              "h-auto w-full justify-start gap-2 rounded-[9px] px-2 py-1.5 text-left shadow-none transition-colors",
                              index === selectedIndex ? "bg-primary/10" : "hover:bg-primary/[0.06]",
                            )}
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/18 bg-primary/[0.07] text-primary/90">
                              <FileCode2Icon className="size-3" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11.5px] font-medium leading-5 text-foreground">
                                {candidate.name}
                              </span>
                              <span className="block truncate text-[10.5px] leading-4 text-muted-foreground">
                                {candidate.parentPath || candidate.path}
                              </span>
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="px-3 py-7 text-center text-[12px] text-muted-foreground">
                  没有匹配的文件或技能
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <PromptInputTextarea
        {...props}
        textareaRef={textareaRef}
        className={cn(className, activeMention && "rounded-t-none border-t-0")}
        onChange={(event) => {
          onChange?.(event);
          syncMentionState(
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? event.currentTarget.value.length,
          );
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
                current === 0 ? mentionResults.length - 1 : current - 1,
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

          if (
            event.key === "ArrowUp" &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !event.currentTarget.value &&
            attachments.files.length === 0 &&
            lastSubmittedMessage
          ) {
            event.preventDefault();
            restorePreviousMessage();
            return;
          }

          onKeyDown?.(event);
        }}
      />
    </div>
  );
}
