"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ThreadRecord } from "@/lib/thread-session";
import { Icon } from "@iconify/react";

type WorkspaceSidebarProps = {
  collapsed: boolean;
  activeView: "chat" | "editor";
  currentThreadId: string;
  currentWorkspaceName: string;
  isDesktopRuntime: boolean;
  recentThreads: ThreadRecord[];
  editorTree: ReactNode;
  onChangeWorkspaceRoot: () => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onSelectView: (view: "chat" | "editor") => void;
  onToggleCollapsed: () => void;
};

const navItems = [
  { key: "chat", label: "Sessions", icon: "solar:chat-round-dots-linear" },
  { key: "editor", label: "Editor", icon: "solar:code-linear" },
] as const;

const summarizeWorkspaceGroup = (value: string | null | undefined) => {
  if (!value) return "project";
  const normalized = value.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
};

const formatUpdatedAt = (updatedAt: number) => {
  if (!updatedAt) return "";
  const diffMs = Date.now() - updatedAt;
  const diffHours = Math.max(1, Math.floor(diffMs / 3600000));
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks} 周前`;
};

export function WorkspaceSidebar({
  collapsed,
  activeView,
  currentThreadId,
  currentWorkspaceName,
  isDesktopRuntime,
  recentThreads,
  editorTree,
  onChangeWorkspaceRoot,
  onNewThread,
  onSelectThread,
  onSelectView,
  onToggleCollapsed,
}: WorkspaceSidebarProps) {
  const groupedThreads = recentThreads.reduce<
    Array<{ workspace: string; threads: ThreadRecord[] }>
  >((groups, thread) => {
    const workspace = summarizeWorkspaceGroup(thread.workspaceRoot ?? thread.subtitle);
    const existing = groups.find((group) => group.workspace === workspace);
    if (existing) {
      existing.threads.push(thread);
      return groups;
    }
    groups.push({ workspace, threads: [thread] });
    return groups;
  }, []);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[#0c1422] text-white">
      <div
        className={cn(
          "flex items-center border-b border-white/[0.05] px-3 py-4",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-[0_14px_30px_rgba(91,76,255,0.35)]">
              <Icon icon="solar:bolt-linear" className="size-4 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold tracking-tight text-white">
                Rovix
              </div>
            </div>
          </div>
        ) : (
          <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-[0_14px_30px_rgba(91,76,255,0.35)]">
            <Icon icon="solar:bolt-linear" className="size-4 text-white" aria-hidden="true" />
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={onToggleCollapsed}
          className={cn(
            "size-9 rounded-xl border border-white/[0.06] bg-white/[0.03] text-[#7f8ca3] shadow-none transition-colors hover:bg-white/[0.07] hover:text-white",
            collapsed && "absolute left-1/2 top-16 -translate-x-1/2"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon
            icon="solar:sidebar-minimalistic-linear"
            className={cn("size-4 transition-transform", collapsed && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
      </div>

      {!collapsed ? (
        <div className="px-3 pb-3 pt-3">
          <Button
            type="button"
            variant="default"
            onClick={onNewThread}
            className="h-11 w-full rounded-2xl bg-[#4b5ef3] px-4 text-[14px] font-semibold text-white shadow-[0_12px_30px_rgba(75,94,243,0.26)] transition-colors hover:bg-[#5a6cff]"
            title="New Session"
          >
            <Icon icon="solar:add-circle-linear" className="size-4" aria-hidden="true" />
            <span>New Session</span>
          </Button>
        </div>
      ) : null}

      <div className={cn("space-y-1 px-3", collapsed && "px-2")}>
        {navItems.map(({ key, label, icon }) => {
          const selected = activeView === key;
          return (
            <Button
              key={key}
              type="button"
              variant="ghost"
              onClick={() => onSelectView(key)}
              className={cn(
                "h-auto w-full rounded-xl shadow-none transition-colors",
                collapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-2.5 px-3 py-2.5 text-left",
                selected
                  ? "bg-[#1a2540] text-white"
                  : "text-[#6d7a92] hover:bg-[#111c2e] hover:text-white"
              )}
              title={label}
            >
              <Icon icon={icon} className="size-[15px] shrink-0" aria-hidden="true" />
              {!collapsed ? <span className="text-[13px] font-medium">{label}</span> : null}
            </Button>
          );
        })}

        {!collapsed ? (
          <Button
            type="button"
            variant="ghost"
            onClick={onChangeWorkspaceRoot}
            className="h-auto w-full justify-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-[#6d7a92] shadow-none transition-colors hover:bg-[#111c2e] hover:text-white"
            title={isDesktopRuntime ? "Pick folder..." : "Set directory"}
          >
            <Icon
              icon="solar:folder-with-files-linear"
              className="size-[15px] shrink-0"
              aria-hidden="true"
            />
            <span className="truncate text-[13px] font-medium">
              {currentWorkspaceName}
            </span>
          </Button>
        ) : null}
      </div>

      <ScrollArea className="scrollbar-frost-thin mt-3 min-h-0 flex-1">
        <div className={cn("space-y-2 px-3 pb-3", collapsed && "px-2")}>
          {collapsed ? null : activeView === "editor" ? (
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-2">
              {editorTree}
            </div>
          ) : (
            groupedThreads.slice(0, 8).map((group) => (
              <div key={group.workspace} className="space-y-1.5">
                {!collapsed ? (
                  <div className="flex items-center gap-2 px-1 pb-1 pt-2 text-[#7f8ca3]">
                    <Icon
                      icon="solar:folder-with-files-linear"
                      className="size-[14px]"
                      aria-hidden="true"
                    />
                    <span className="truncate text-[12px] font-semibold">
                      {group.workspace}
                    </span>
                  </div>
                ) : null}
                {group.threads.slice(0, 10).map((thread) => {
                  const selected = thread.id === currentThreadId;
                  return (
                    <Button
                      key={thread.id}
                      type="button"
                      variant="ghost"
                      onClick={() => onSelectThread(thread.id)}
                      className={cn(
                        "h-auto w-full rounded-2xl border shadow-none transition-colors",
                        collapsed
                          ? "justify-center px-0 py-2.5"
                          : "flex-col items-start gap-1 px-3 py-3 text-left",
                        selected
                          ? "border-[#4357df] bg-[#1a2540] text-white"
                          : "border-white/[0.05] bg-white/[0.02] text-[#dbe5ff] hover:bg-[#111c2e]"
                      )}
                      title={thread.title}
                    >
                      {collapsed ? (
                        <span className="text-[12px] font-semibold">
                          {thread.title.slice(0, 1).toUpperCase()}
                        </span>
                      ) : (
                        <>
                          <span className="w-full truncate text-[13px] font-medium">
                            {thread.title}
                          </span>
                          <span className="w-full truncate text-[11px] text-[#52617b]">
                            {formatUpdatedAt(thread.updatedAt) || group.workspace}
                          </span>
                        </>
                      )}
                    </Button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {!collapsed ? (
        <div className="border-t border-white/[0.05] p-3">
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 shadow-none transition-colors hover:bg-white/[0.05]"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#11182a] text-[15px] font-semibold text-white">
            N
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[13px] font-semibold text-white">
              AlphaDev_99
            </div>
            <div className="text-[11px] text-[#52617b]">Pro Plan</div>
          </div>
          <Icon
            icon="solar:alt-arrow-down-linear"
            className="size-4 shrink-0 text-[#52617b]"
            aria-hidden="true"
          />
        </Button>
        </div>
      ) : null}
    </aside>
  );
}
