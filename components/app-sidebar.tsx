"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  FolderIcon,
  FolderOpenIcon,
  MessageSquareIcon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
} from "lucide-react";

type ThreadEntry = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: number;
  workspaceRoot?: string | null;
};

type AppSidebarProps = {
  currentThreadId?: string;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread?: (threadId: string) => void;
  onOpenWorkspace?: () => void;
  onOpenSettings?: () => void;
  activeSection?: "chat" | "settings";
  recentThreads: ThreadEntry[];
  workspaceRoot?: string | null;
};

const formatRelativeTime = (updatedAt: number) => {
  if (!updatedAt) return "";
  const diffMs = Date.now() - updatedAt;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} 天前`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks} 周前`;
};

const getWorkspaceLabel = (workspaceRoot?: string | null) => {
  if (!workspaceRoot) return "workspace";
  const normalized = workspaceRoot.replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
};

export function AppSidebar({
  currentThreadId,
  onNewThread,
  onSelectThread,
  onDeleteThread,
  onOpenWorkspace,
  onOpenSettings,
  activeSection = "chat",
  recentThreads,
  workspaceRoot,
}: AppSidebarProps) {
  const groupedThreads = recentThreads.reduce<Array<{ name: string; threads: ThreadEntry[] }>>(
    (groups, thread) => {
      const name = thread.workspaceRoot ? getWorkspaceLabel(thread.workspaceRoot) : null;
      if (!name) {
        return groups;
      }
      const existing = groups.find((group) => group.name === name);
      if (existing) {
        existing.threads.push(thread);
      } else {
        groups.push({ name, threads: [thread] });
      }
      return groups;
    },
    []
  );
  const hasWorkspace = Boolean(workspaceRoot);
  const hasGroupedThreads = groupedThreads.length > 0;

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      className="app-sidebar-surface border-r border-border bg-transparent"
      style={
        {
          "--sidebar-width": "18rem",
          "--sidebar-width-icon": "3.5rem",
        } as React.CSSProperties
      }
    >
      <SidebarHeader className="bg-transparent px-4 pb-2 pt-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2.5">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">
              对话
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="app-control flex size-8 items-center justify-center rounded-lg border-0 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
              aria-label="新开文件夹"
            >
              <FolderOpenIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onNewThread()}
              className="app-control flex size-8 items-center justify-center rounded-lg border-0 text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
              aria-label="新建对话"
            >
              <PlusIcon className="size-4" />
            </button>
            <SidebarTrigger className="app-control size-8 rounded-lg border-0 text-sidebar-foreground/60 shadow-none hover:text-sidebar-foreground" />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-frost-thin bg-transparent px-3 pb-3 pt-2">
        <div className="space-y-5 group-data-[collapsible=icon]:hidden">
          {groupedThreads.map((group) => (
            <section key={group.name} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1 text-sidebar-foreground/70">
                <FolderIcon className="size-4 shrink-0 text-sidebar-foreground/50" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  {group.name}
                </span>
              </div>

              <SidebarMenu className="gap-0.5">
                {group.threads.map((thread) => {
                  const isActive = thread.id === currentThreadId;
                  return (
                    <SidebarMenuItem key={thread.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <SidebarMenuButton
                            tooltip={thread.title}
                            onClick={() => onSelectThread(thread.id)}
                            className={cn(
                              "h-auto items-start rounded-lg px-3 py-2.5",
                              isActive
                                ? "app-soft-card border border-primary/25 bg-primary/[0.10] text-sidebar-foreground shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                                : "app-soft-hover text-sidebar-foreground/80 hover:text-sidebar-foreground"
                            )}
                          >
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-[12px] font-medium leading-5">
                                  {thread.title}
                                </div>
                                <div className="truncate text-[11px] text-sidebar-foreground/50">
                                  {thread.subtitle}
                                </div>
                              </div>
                              <span className="shrink-0 pt-0.5 text-[11px] text-sidebar-foreground/50">
                                {formatRelativeTime(thread.updatedAt)}
                              </span>
                            </div>
                          </SidebarMenuButton>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="min-w-[180px] rounded-lg border-border bg-popover p-1 shadow-lg">
                          <ContextMenuItem
                            variant="destructive"
                            onClick={() => onDeleteThread?.(thread.id)}
                            className="rounded-lg"
                          >
                            <Trash2Icon className="size-4" />
                            删除线程
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </section>
          ))}

          {!hasGroupedThreads ? (
            <section className="space-y-2.5">
              {hasWorkspace ? (
                <div className="px-1 text-[13px] font-semibold text-sidebar-foreground/70">
                  {getWorkspaceLabel(workspaceRoot)}
                </div>
              ) : null}
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="app-soft-card flex w-full flex-col items-center justify-center gap-3 rounded-xl border-dashed px-4 py-8 text-center transition-colors"
              >
                <span className="app-control flex size-11 items-center justify-center rounded-xl border-0 text-sidebar-foreground/50">
                  <MessageSquareIcon className="size-5" />
                </span>
                <div className="space-y-1">
                  <div className="text-[13px] font-medium text-sidebar-foreground/70">
                    还没有对话
                  </div>
                  <div className="text-[12px] text-sidebar-foreground/50">
                    选择目录后创建新的对话。
                  </div>
                </div>
              </button>
            </section>
          ) : null}
        </div>

        <div className="hidden flex-col items-center justify-center gap-2 py-3 group-data-[collapsible=icon]:flex">
          <button
            type="button"
            onClick={onOpenWorkspace}
            className="app-control flex size-10 items-center justify-center rounded-lg border-0 text-sidebar-foreground transition-colors"
            aria-label="新开文件夹"
          >
            <FolderOpenIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onNewThread()}
            className="app-control flex size-10 items-center justify-center rounded-lg border-0 text-sidebar-foreground transition-colors"
            aria-label="新建对话"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      </SidebarContent>

      <SidebarSeparator className="bg-border" />

      <SidebarFooter className="bg-transparent px-3 py-3 group-data-[collapsible=icon]:px-2.5">
        <div className="space-y-2 group-data-[collapsible=icon]:hidden">
          <button
            type="button"
            onClick={onOpenSettings}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-[11px] transition-colors",
              activeSection === "settings"
                ? "app-soft-card border border-primary/25 bg-primary/[0.10] text-sidebar-foreground shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                : "app-soft-hover text-sidebar-foreground/60 hover:text-sidebar-foreground",
            )}
          >
            <Settings2Icon className="size-3.5 text-sidebar-foreground/50" />
            <span className="flex-1 text-left">设置</span>
          </button>
        </div>

        <SidebarMenu className="hidden gap-1 group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="设置"
              onClick={onOpenSettings}
              className={cn(
                "size-10 justify-center rounded-lg px-0 text-[12px]",
                activeSection === "settings"
                  ? "app-control border-primary/30 bg-primary/[0.12] text-sidebar-foreground"
                  : "app-control-ghost text-sidebar-foreground/60 hover:text-sidebar-foreground",
              )}
            >
              <Settings2Icon className="size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
