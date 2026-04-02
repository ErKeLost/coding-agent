"use client";

import { useTheme } from "@/components/theme-provider";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  CheckIcon,
  ChevronsUpDownIcon,
  FolderIcon,
  LaptopIcon,
  MessageSquareIcon,
  MoonIcon,
  PlusIcon,
  Settings2Icon,
  SunIcon,
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
  recentThreads,
  workspaceRoot,
}: AppSidebarProps) {
  const { theme, setTheme } = useTheme();
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
      className="border-r border-border bg-background"
      style={
        {
          "--sidebar-width": "18rem",
          "--sidebar-width-icon": "3.5rem",
        } as React.CSSProperties
      }
    >
      <SidebarHeader className="bg-background px-4 pb-2 pt-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2.5">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="text-[15px] font-semibold tracking-tight text-foreground">
              对话
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNewThread()}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground group-data-[collapsible=icon]:hidden"
              aria-label="新建对话"
            >
              <PlusIcon className="size-4" />
            </button>
            <SidebarTrigger className="size-8 rounded-lg border-0 bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground" />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-frost-thin bg-background px-3 pb-3 pt-2">
        <div className="space-y-5 group-data-[collapsible=icon]:hidden">
          {groupedThreads.map((group) => (
            <section key={group.name} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1 text-foreground/82">
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
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
                              "h-auto items-start rounded-xl px-3 py-2.5",
                              isActive
                                ? "bg-muted text-foreground"
                                : "text-foreground/88 hover:bg-muted/80 hover:text-foreground"
                            )}
                          >
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-[12px] font-medium leading-5">
                                  {thread.title}
                                </div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {thread.subtitle}
                                </div>
                              </div>
                              <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">
                                {formatRelativeTime(thread.updatedAt)}
                              </span>
                            </div>
                          </SidebarMenuButton>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="min-w-[180px] rounded-xl border-border bg-popover/95 p-1 shadow-lg backdrop-blur">
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
                <div className="px-1 text-[13px] font-semibold text-foreground/82">
                  {getWorkspaceLabel(workspaceRoot)}
                </div>
              ) : null}
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/30 px-4 py-8 text-center transition-colors hover:bg-muted/35"
              >
                <span className="flex size-11 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                  <MessageSquareIcon className="size-5" />
                </span>
                <div className="space-y-1">
                  <div className="text-[13px] font-medium text-foreground/82">
                    还没有对话
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    选择目录后创建新的对话。
                  </div>
                </div>
              </button>
            </section>
          ) : null}
        </div>

        <div className="hidden items-center justify-center py-3 group-data-[collapsible=icon]:flex">
          <button
            type="button"
            onClick={() => onNewThread()}
            className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground transition-colors hover:bg-accent"
            aria-label="新建对话"
          >
            <PlusIcon className="size-4" />
          </button>
        </div>
      </SidebarContent>

      <SidebarSeparator className="bg-border" />

      <SidebarFooter className="bg-background px-3 py-3 group-data-[collapsible=icon]:px-2.5">
        <div className="space-y-2 group-data-[collapsible=icon]:hidden">
          <div className="rounded-xl bg-muted/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8.5 w-full items-center gap-2 rounded-lg px-3 text-[11px] text-foreground/78 transition-colors hover:bg-background/70 hover:text-foreground"
                >
                  {theme === "dark" ? (
                    <MoonIcon className="size-3.5 text-foreground/72" />
                  ) : theme === "light" ? (
                    <SunIcon className="size-3.5 text-foreground/72" />
                  ) : (
                    <LaptopIcon className="size-3.5 text-foreground/72" />
                  )}
                  <span className="flex-1 text-left">
                    {theme === "dark"
                      ? "暗色主题"
                      : theme === "light"
                        ? "浅色主题"
                        : "跟随系统"}
                  </span>
                  <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[180px] rounded-2xl border-border/60 bg-popover/96 p-1.5 shadow-xl backdrop-blur"
              >
                {[
                  { value: "system", label: "跟随系统", icon: LaptopIcon },
                  { value: "light", label: "浅色主题", icon: SunIcon },
                  { value: "dark", label: "暗色主题", icon: MoonIcon },
                ].map((option) => {
                  const Icon = option.icon;
                  const active = theme === option.value;
                  return (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className="flex h-9 items-center gap-2.5 rounded-xl px-3 text-[12px]"
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{option.label}</span>
                      {active ? <CheckIcon className="size-4 text-primary" /> : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="rounded-xl bg-muted/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <button
              type="button"
              className="flex h-8.5 w-full items-center gap-2 rounded-lg px-3 text-[11px] text-foreground/78 transition-colors hover:bg-background/70 hover:text-foreground"
            >
              <Settings2Icon className="size-3.5 text-foreground/72" />
              <span className="flex-1 text-left">设置</span>
            </button>
          </div>
        </div>

        <SidebarMenu className="hidden gap-1 group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="设置"
              className="size-10 justify-center rounded-xl px-0 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
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
