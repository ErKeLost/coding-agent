"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  DesktopWorkspaceNode,
  WorkspaceContentSearchFile,
} from "@/lib/desktop-workspace";
import { isTauriDesktop, searchWorkspaceContent } from "@/lib/desktop-workspace";
import { cn } from "@/lib/utils";
import { FileCode2Icon, SearchIcon } from "lucide-react";
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
  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-3xl overflow-hidden rounded-3xl border border-border/60 bg-background/96 p-0 text-foreground shadow-2xl backdrop-blur-2xl"
      >
        <DialogHeader className="gap-1 border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="text-[15px] font-semibold text-foreground">
            搜索
          </DialogTitle>
          <DialogDescription className="text-[12px] text-muted-foreground/80">
            搜索当前目录中的文件内容并打开文件。
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => {
                const nextValue = event.target.value;
                setQuery(nextValue);
                if (!nextValue.trim()) {
                  setResults([]);
                  setLoading(false);
                } else if (isTauriDesktop() && workspaceRoot) {
                  setLoading(true);
                }
              }}
              placeholder="搜索当前目录文件内容..."
              className="h-11 rounded-2xl border-border/60 bg-muted/30 pl-10 text-[14px] text-foreground shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto border-t border-border/60 px-3 py-3">
          {!query.trim() ? (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground/70">
              输入关键词搜索当前目录文件内容
            </div>
          ) : loading ? (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground/70">
              正在搜索...
            </div>
          ) : visibleResults.length === 0 ? (
            <div className="px-3 py-10 text-center text-[13px] text-muted-foreground/70">
              没有匹配结果
            </div>
          ) : (
            <div className="space-y-3">
              {visibleResults.map((file) => (
                <section
                  key={file.path}
                  className="overflow-hidden rounded-2xl border border-border/60 bg-card/50"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectFile(file.path);
                      onOpenChange(false);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                      <FileCode2Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-foreground/92">
                        {file.name}
                      </div>
                      <div className="truncate text-[12px] text-muted-foreground/70">
                        {file.path}
                      </div>
                    </div>
                    <div className="rounded-full bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground">
                      {file.totalMatches}
                    </div>
                  </button>

                  {file.matches.length > 0 ? (
                    <div className="space-y-1 border-t border-border/60 px-2 py-2">
                      {file.matches.map((match) => (
                        <button
                          key={`${file.path}-${match.line}`}
                          type="button"
                          onClick={() => {
                            onSelectFile(file.path);
                            onOpenChange(false);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/60"
                          )}
                        >
                          <span className="shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground/55">
                            {match.line}
                          </span>
                          <span className="truncate text-[12px] text-foreground/72">
                            {match.text}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
