"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import {
  commitWorkspaceStagedChanges,
  getWorkspaceGitChanges,
  getWorkspaceGitDiff,
  stageWorkspaceFile,
  type WorkspaceBranchPayload,
  type WorkspaceGitChange,
  type WorkspaceGitDiffPayload,
  unstageWorkspaceFile,
} from "@/lib/desktop-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type GitChangesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceRoot: string | null;
  branchState: WorkspaceBranchPayload | null;
  onCommitComplete?: (payload: WorkspaceBranchPayload) => void | Promise<void>;
  onPush?: () => void | Promise<void>;
};

function inferLanguage(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "js":
      return "javascript";
    case "jsx":
      return "jsx";
    case "json":
      return "json";
    case "rs":
      return "rust";
    case "py":
      return "python";
    case "md":
      return "markdown";
    case "css":
      return "css";
    case "html":
      return "html";
    case "sh":
      return "bash";
    case "toml":
      return "toml";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "text";
  }
}

export function GitChangesDialog({
  open,
  onOpenChange,
  workspaceRoot,
  branchState,
  onCommitComplete,
  onPush,
}: GitChangesDialogProps) {
  const [changes, setChanges] = useState<WorkspaceGitChange[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffPayload, setDiffPayload] = useState<WorkspaceGitDiffPayload | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [actionPath, setActionPath] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffView, setDiffView] = useState<"staged" | "unstaged">("unstaged");

  const loadChanges = async (preferredPath?: string | null) => {
    if (!workspaceRoot) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await getWorkspaceGitChanges(workspaceRoot);
      setChanges(payload);
      const nextPath =
        preferredPath && payload.some((entry) => entry.path === preferredPath)
          ? preferredPath
          : payload[0]?.path ?? null;
      setSelectedPath(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取改动");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !workspaceRoot) return;
    void loadChanges();
  }, [open, workspaceRoot]);

  useEffect(() => {
    if (!open || !workspaceRoot || !selectedPath) {
      setDiffPayload(null);
      return;
    }
    let cancelled = false;
    setDiffLoading(true);
    void getWorkspaceGitDiff(workspaceRoot, selectedPath)
      .then((payload) => {
        if (cancelled) return;
        setDiffPayload(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "无法读取 diff");
      })
      .finally(() => {
        if (cancelled) return;
        setDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedPath, workspaceRoot]);

  useEffect(() => {
    if (!diffPayload) return;
    if (diffPayload.unstaged.trim()) {
      setDiffView("unstaged");
      return;
    }
    if (diffPayload.staged.trim()) {
      setDiffView("staged");
    }
  }, [diffPayload]);

  const stagedCount = useMemo(
    () => changes.filter((entry) => entry.stagedStatus !== "clean").length,
    [changes],
  );

  const selectedChange = changes.find((entry) => entry.path === selectedPath) ?? null;
  const hasStagedDiff = Boolean(diffPayload?.staged.trim());
  const hasUnstagedDiff = Boolean(diffPayload?.unstaged.trim());
  const activeDiffText =
    diffView === "staged" ? diffPayload?.staged ?? "" : diffPayload?.unstaged ?? "";

  const handleStageToggle = async (change: WorkspaceGitChange) => {
    if (!workspaceRoot) return;
    setActionPath(change.path);
    setError(null);
    try {
      const payload =
        change.stagedStatus !== "clean"
          ? await unstageWorkspaceFile(workspaceRoot, change.path)
          : await stageWorkspaceFile(workspaceRoot, change.path);
      setChanges(payload);
      if (selectedPath === change.path) {
        const nextDiff = await getWorkspaceGitDiff(workspaceRoot, change.path);
        setDiffPayload(nextDiff);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新暂存状态失败");
    } finally {
      setActionPath(null);
    }
  };

  const handleCommit = async () => {
    if (!workspaceRoot || !commitMessage.trim()) return;
    setCommitting(true);
    setError(null);
    try {
      const payload = await commitWorkspaceStagedChanges(workspaceRoot, commitMessage.trim());
      setCommitMessage("");
      await onCommitComplete?.(payload);
      await loadChanges(selectedPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="app-popup-surface max-w-[calc(100vw-5rem)] overflow-hidden rounded-[26px] border border-[color:var(--app-panel-border)] p-0 shadow-[0_30px_90px_rgba(15,23,42,0.18)] sm:max-w-[1180px]"
      >
        <DialogHeader className="border-b border-[color:var(--app-hairline)] px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-[15px] font-semibold tracking-tight text-foreground/92">
                提交改动
              </DialogTitle>
              <DialogDescription className="sr-only">
                查看当前工作区改动、暂存文件并提交到 Git。
              </DialogDescription>
              <div className="mt-1 text-[11px] text-muted-foreground/76">
                {branchState?.currentBranch ?? "main"} · 已暂存 {stagedCount} 个文件
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void onPush?.()}
                disabled={!branchState?.hasRemote}
                className="h-9 rounded-[12px] px-3 text-[12px]"
              >
                <Icon icon="solar:upload-linear" className="size-3.5" aria-hidden="true" />
                推送
              </Button>
              <Button
                type="button"
                onClick={() => void handleCommit()}
                disabled={committing || stagedCount === 0 || !commitMessage.trim()}
                className="h-9 rounded-[12px] px-3 text-[12px]"
              >
                {committing ? (
                  <Icon icon="solar:refresh-linear" className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Icon icon="solar:code-square-linear" className="size-3.5" aria-hidden="true" />
                )}
                提交已暂存
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid h-[min(80vh,760px)] grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
          <aside className="border-r border-[color:var(--app-hairline)] bg-[color:var(--app-soft-fill)]/55">
            <div className="border-b border-[color:var(--app-hairline)] px-4 py-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/72">
              Changed Files
            </div>
            <div className="max-h-full overflow-auto px-2 py-2">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />
                </div>
              ) : changes.length === 0 ? (
                <div className="px-3 py-6 text-[12px] text-muted-foreground">
                  当前没有改动
                </div>
              ) : (
                changes.map((change) => {
                  const staged = change.stagedStatus !== "clean";
                  return (
                    <div
                      key={change.path}
                      className={`mb-1 rounded-[14px] border px-3 py-2 transition-colors ${
                        selectedPath === change.path
                          ? "border-[color:var(--app-panel-border)] bg-[color:var(--app-soft-fill-strong)]"
                          : "border-transparent bg-transparent hover:bg-[color:var(--app-soft-fill)]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedPath(change.path)}
                        className="w-full text-left"
                      >
                        <div className="truncate text-[12px] font-medium text-foreground/88">
                          {change.path}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/72">
                          <span>{change.unstagedStatus}</span>
                          {staged ? (
                            <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                              staged
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/66">
                          {staged ? "index" : "workspace"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={actionPath === change.path}
                          onClick={() => void handleStageToggle(change)}
                          className="h-7 rounded-[9px] px-2 text-[11px]"
                        >
                          {actionPath === change.path ? (
                            <Icon icon="solar:refresh-linear" className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : staged ? (
                            <>
                              <Icon icon="solar:minus-circle-linear" className="size-3.5" aria-hidden="true" />
                              取消暂存
                            </>
                          ) : (
                            <>
                              <Icon icon="solar:add-circle-linear" className="size-3.5" aria-hidden="true" />
                              暂存
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-[color:var(--app-hairline)] px-5 py-4">
              <Textarea
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder="输入 commit message，只会提交已暂存改动"
                className="min-h-[88px] rounded-[18px] border-[color:var(--app-panel-border)] bg-[color:var(--app-soft-fill)]/70 px-4 py-3 text-[13px] shadow-none"
              />
              {error ? (
                <div className="mt-2 text-[12px] text-destructive">{error}</div>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              {selectedChange ? (
                diffLoading ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[20px] border border-[color:var(--app-panel-border)] bg-[color:var(--app-panel-bg)]">
                    <div className="flex items-center justify-between gap-3 border-b border-[color:var(--app-hairline)] bg-[color:var(--app-soft-fill-strong)] px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[12px] text-foreground/88">
                          {selectedChange.path}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground/72">
                          Git patch preview
                        </div>
                      </div>
                      <div className="rounded-full border border-[color:var(--app-hairline)] bg-[color:var(--app-soft-fill)] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/78">
                        {inferLanguage(selectedChange.path)}
                      </div>
                    </div>
                    {hasStagedDiff || hasUnstagedDiff ? (
                      <Tabs
                        value={diffView}
                        onValueChange={(value) => setDiffView(value as "staged" | "unstaged")}
                        className="flex min-h-0 flex-1 flex-col"
                      >
                        <div className="border-b border-[color:var(--app-hairline)] px-4 py-3">
                          <TabsList className="h-9 rounded-[12px] bg-[color:var(--app-soft-fill)]/80 p-1">
                            <TabsTrigger
                              value="unstaged"
                              disabled={!hasUnstagedDiff}
                              className="rounded-[9px] px-3 text-[11px]"
                            >
                              工作区
                            </TabsTrigger>
                            <TabsTrigger
                              value="staged"
                              disabled={!hasStagedDiff}
                              className="rounded-[9px] px-3 text-[11px]"
                            >
                              已暂存
                            </TabsTrigger>
                          </TabsList>
                        </div>
                        <TabsContent value="unstaged" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                          <div className="scrollbar-frost h-full overflow-auto bg-[color:var(--background)]/65 p-4">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-foreground/86">
                              {hasUnstagedDiff ? activeDiffText : "当前没有未暂存 diff"}
                            </pre>
                          </div>
                        </TabsContent>
                        <TabsContent value="staged" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
                          <div className="scrollbar-frost h-full overflow-auto bg-[color:var(--background)]/65 p-4">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-foreground/86">
                              {hasStagedDiff ? activeDiffText : "当前没有已暂存 diff"}
                            </pre>
                          </div>
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                        当前文件没有可预览的 diff
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                  选择一个文件查看 diff
                </div>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
