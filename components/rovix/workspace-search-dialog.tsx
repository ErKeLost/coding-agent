"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShikiFilePreview } from "@/components/rovix/shiki-file-preview";
import type {
  DesktopWorkspaceFile,
  DesktopWorkspaceNode,
  WorkspaceContentSearchFile,
} from "@/lib/desktop-workspace";
import {
  isTauriDesktop,
  readDesktopWorkspaceFile,
  searchWorkspaceContent,
} from "@/lib/desktop-workspace";
import { cn } from "@/lib/utils";
import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";

type WorkspaceSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceRoot: string | null;
  workspaceTree?: DesktopWorkspaceNode[];
  onSelectFile: (path: string) => void;
};

type FileNameSearchResult = {
  path: string;
  name: string;
};

const flattenWorkspaceFiles = (nodes: DesktopWorkspaceNode[]): FileNameSearchResult[] => {
  const files: FileNameSearchResult[] = [];

  const walk = (items: DesktopWorkspaceNode[]) => {
    items.forEach((node) => {
      if (node.isDir) {
        walk(node.children ?? []);
        return;
      }
      files.push({ path: node.path, name: node.name });
    });
  };

  walk(nodes);
  return files;
};

export function WorkspaceSearchDialog({
  open,
  onOpenChange,
  workspaceRoot,
  workspaceTree = [],
  onSelectFile,
}: WorkspaceSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<WorkspaceContentSearchFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<DesktopWorkspaceFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fallbackResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    return flattenWorkspaceFiles(workspaceTree)
      .filter((file) => file.path.toLowerCase().includes(normalizedQuery))
      .slice(0, 12)
      .map((file) => ({
        path: file.path,
        name: file.name,
        totalMatches: 1,
        matches: [],
      }));
  }, [query, workspaceTree]);

  useEffect(() => {
    if (!open) return;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return;
    }

    if (!isTauriDesktop() || !workspaceRoot) {
      return;
    }

    const timer = window.setTimeout(() => {
      void searchWorkspaceContent(workspaceRoot, normalizedQuery)
        .then((payload) => {
          setResults(payload);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }, 140);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, query, workspaceRoot]);

  const visibleResults = isTauriDesktop() && workspaceRoot ? results : fallbackResults;

  useEffect(() => {
    if (!open) return;
    const firstPath = visibleResults[0]?.path ?? null;
    setSelectedPath((current) => {
      const nextPath =
        current && visibleResults.some((entry) => entry.path === current)
          ? current
          : firstPath;
      const nextResult = visibleResults.find((entry) => entry.path === nextPath);
      setSelectedLine(nextResult?.matches[0]?.line ?? null);
      return nextPath;
    });
  }, [open, visibleResults]);

  useEffect(() => {
    if (!open || !selectedPath) {
      setPreviewFile(null);
      setPreviewLoading(false);
      return;
    }

    const fallback = visibleResults.find((entry) => entry.path === selectedPath);
    if (!isTauriDesktop()) {
      if (!fallback) {
        setPreviewFile(null);
        setPreviewLoading(false);
        return;
      }
      setPreviewFile({
        name: fallback.name,
        path: fallback.path,
        language: "text",
        content: fallback.matches.map((match) => match.text).join("\n") || fallback.path,
      });
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    void readDesktopWorkspaceFile(selectedPath)
      .then((file) => {
        if (cancelled) return;
        setPreviewFile(file);
      })
      .catch(() => {
        if (cancelled) return;
        if (!fallback) {
          setPreviewFile(null);
          return;
        }
        setPreviewFile({
          name: fallback.name,
          path: fallback.path,
          language: "text",
          content: fallback.matches.map((match) => match.text).join("\n") || fallback.path,
        });
      })
      .finally(() => {
        if (cancelled) return;
        setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedPath, visibleResults]);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setSelectedPath(null);
      setSelectedLine(null);
      setPreviewFile(null);
      setPreviewLoading(false);
    }
    onOpenChange(nextOpen);
  };

  const selectedResult =
    visibleResults.find((entry) => entry.path === selectedPath) ?? visibleResults[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="app-popup-surface overflow-hidden rounded-[22px] p-0 text-foreground"
        style={{
          width: "min(88vw, 1080px)",
          maxWidth: "1080px",
          maxHeight: "82vh",
        }}
      >
        <DialogHeader
          className="gap-0.5 border-b px-4 py-3 text-left"
          style={{
            borderColor: "color-mix(in srgb, var(--app-panel-border) 82%, transparent)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--app-soft-fill-strong) 78%, transparent), color-mix(in srgb, var(--app-panel-bg) 94%, transparent))",
          }}
        >
          <DialogTitle className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <span className="app-control inline-flex size-7 items-center justify-center rounded-lg text-foreground/78">
              <Icon icon="solar:magnifer-linear" className="size-3.5" aria-hidden="true" />
            </span>
            搜索
          </DialogTitle>
          <DialogDescription className="text-[11px] text-muted-foreground/78">
            搜索当前目录中的文件内容，左侧筛选，右侧直接预览代码。
          </DialogDescription>
        </DialogHeader>

        <div
          className="border-b px-4 py-2.5"
          style={{ borderColor: "color-mix(in srgb, var(--app-panel-border) 76%, transparent)" }}
        >
          <div className="app-control relative rounded-[12px] px-0.5 py-0.5">
            <Icon
              icon="solar:magnifer-linear"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/70"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={query}
              onChange={(event) => {
                const nextValue = event.target.value;
                setQuery(nextValue);
                if (!nextValue.trim()) {
                  setResults([]);
                  setLoading(false);
                  setSelectedPath(null);
                  setSelectedLine(null);
                  setPreviewFile(null);
                } else if (isTauriDesktop() && workspaceRoot) {
                  setLoading(true);
                }
              }}
              placeholder="搜索当前目录文件内容..."
              className="h-8 rounded-[10px] border-0 bg-transparent pl-8 text-[11px] text-foreground shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="grid h-[min(62vh,560px)] min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <div
            className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r"
            style={{
              borderColor: "color-mix(in srgb, var(--app-panel-border) 76%, transparent)",
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--app-soft-fill) 50%, transparent), color-mix(in srgb, var(--app-panel-bg) 88%, transparent))",
            }}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <div className="mt-0.5 text-[11px] text-muted-foreground/72">
                  {query.trim()
                    ? loading
                      ? "正在扫描当前目录..."
                      : `${visibleResults.length} 个文件命中`
                    : "输入关键词开始搜索"}
                </div>
              </div>
              {query.trim() && !loading ? (
                <div className="app-control rounded-full px-2 py-0.5 text-[10px] text-muted-foreground/75">
                  {visibleResults.reduce((sum, file) => sum + file.totalMatches, 0)} matches
                </div>
              ) : null}
            </div>

            <div className="scrollbar-frost min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
              {!query.trim() ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-5 text-center">
                  <span className="app-control inline-flex size-10 items-center justify-center rounded-xl text-muted-foreground/80">
                    <Icon icon="solar:magic-stick-3-linear" className="size-4" aria-hidden="true" />
                  </span>
                  <div className="text-[12px] font-medium text-foreground/86">
                    搜索当前目录里的代码与配置
                  </div>
                  <div className="max-w-[22rem] text-[11px] leading-5 text-muted-foreground/72">
                    结果会按文件分组展示，右侧会直接显示代码预览，方便你在打开前先看内容。
                  </div>
                </div>
              ) : loading ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-5 text-center text-muted-foreground/72">
                  <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />
                  <div className="text-[11px]">正在搜索...</div>
                </div>
              ) : visibleResults.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-5 text-center">
                  <div className="text-[12px] font-medium text-foreground/86">没有匹配结果</div>
                  <div className="text-[11px] leading-5 text-muted-foreground/72">
                    试试更短的关键词，或者换一个文件名、函数名、配置项。
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[18px] border"
                  style={{ borderColor: "color-mix(in srgb, var(--app-panel-border) 72%, transparent)" }}
                >
                  {visibleResults.map((file) => {
                    const selected = file.path === selectedPath;
                    return (
                      <section
                        key={file.path}
                        className={cn(
                          "overflow-hidden border-b last:border-b-0 transition-colors",
                          selected
                            ? "bg-black/[0.035] dark:bg-white/[0.035]"
                            : "bg-transparent hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                        )}
                        style={{ borderColor: "color-mix(in srgb, var(--app-panel-border) 68%, transparent)" }}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setSelectedPath(file.path);
                            setSelectedLine(file.matches[0]?.line ?? null);
                          }}
                          className="h-auto w-full justify-start items-start gap-2 px-2.5 py-2 text-left shadow-none transition-colors hover:bg-transparent"
                        >
                          <span className="mt-0.5 flex size-7 items-center justify-center rounded-lg text-muted-foreground/72">
                            <Icon icon="solar:file-code-linear" className="size-3.5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-[12px] font-medium text-foreground/90">
                                {file.name}
                              </div>
                              <div className="rounded-full px-1 py-0 text-[9px] text-muted-foreground/72">
                                {file.totalMatches}
                              </div>
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/68">
                              {file.path}
                            </div>
                          </div>
                        </Button>

                        {file.matches.length > 0 ? (
                          <div
                            className="space-y-0.5 border-t px-2.5 pb-2 pt-1"
                            style={{
                              borderColor:
                                "color-mix(in srgb, var(--app-panel-border) 72%, transparent)",
                            }}
                          >
                            {file.matches.slice(0, 4).map((match) => (
                              <Button
                                key={`${file.path}-${match.line}`}
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedPath(file.path);
                                  setSelectedLine(match.line);
                                }}
                                className={cn(
                                  "h-auto w-full justify-start items-start gap-1.5 rounded-md px-2 py-1 text-left shadow-none transition-colors",
                                  selected ? "bg-black/[0.04] dark:bg-white/[0.04]" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                                )}
                              >
                                <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/60">
                                  L{match.line}
                                </span>
                                <span className="line-clamp-2 text-[11px] leading-4.5 text-foreground/76">
                                  {match.text}
                                </span>
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div
            className="flex min-h-0 flex-col"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in srgb, var(--app-panel-bg) 92%, transparent), color-mix(in srgb, var(--background) 42%, transparent))",
            }}
          >
            <div className="scrollbar-frost min-h-0 flex-1 overflow-auto p-2.5">
              {!query.trim() ? (
                <div className="flex h-full min-h-[240px] items-center justify-center px-5 text-center text-[11px] leading-5 text-muted-foreground/72">
                  搜索后会在这里显示代码预览。
                </div>
              ) : previewLoading ? (
                <div className="flex h-full min-h-[240px] items-center justify-center text-muted-foreground/72">
                  <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />
                </div>
              ) : previewFile ? (
                <ShikiFilePreview
                  code={previewFile.content}
                  filename={previewFile.path}
                  language={previewFile.language}
                  targetLine={selectedLine}
                />
              ) : (
                <div className="flex h-full min-h-[240px] items-center justify-center px-5 text-center text-[11px] leading-5 text-muted-foreground/72">
                  暂时没有可展示的代码预览。
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
