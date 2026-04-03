"use client";

import { useTheme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
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
  CheckIcon,
  FolderIcon,
  FolderOpenIcon,
  PaletteIcon,
  MessageSquareIcon,
  MoonIcon,
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
  recentThreads: ThreadEntry[];
  workspaceRoot?: string | null;
};

const colorThemeLabels = {
  sand: "沙丘",
  ocean: "海洋",
  forest: "森林",
  rose: "玫瑰",
} as const;

const colorThemeSwatches = {
  sand: ["#b68252", "#d4b27d", "#f3e7d1"],
  ocean: ["#2777c8", "#4bb4d8", "#d8edf5"],
  forest: ["#3f8e68", "#78b28a", "#d9ebdc"],
  rose: ["#b04a62", "#d27a8d", "#f3d9df"],
} as const;

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
  const { colorTheme, colorThemes, resolvedTheme, setColorTheme, setTheme } = useTheme();
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
  const darkModeEnabled = resolvedTheme === "dark";
  const activeColorThemeLabel = colorThemeLabels[colorTheme];

  const renderSettingsMenu = () => (
    <DropdownMenuContent
      align="start"
      side="top"
      sideOffset={10}
      className="w-[276px] rounded-[14px] p-1.5 text-foreground"
    >
      <DropdownMenuLabel className="px-2.5 py-1.5 text-[10px] font-medium tracking-[0.02em] text-muted-foreground">
        设置
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="mx-1.5 my-1 bg-border/70" />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="rounded-[10px] px-3 py-2.5 text-[13px] font-medium text-foreground [&_svg]:text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <PaletteIcon className="size-4" />
            <span>主题</span>
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {activeColorThemeLabel}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-[208px] rounded-[12px] p-1 text-foreground">
          {colorThemes.map(({ value }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => setColorTheme(value)}
              className="rounded-[10px] px-2.5 py-2 text-[12px] text-foreground"
            >
              <div className="flex items-center gap-1.5">
                {colorThemeSwatches[value].map((swatch) => (
                  <span
                    key={swatch}
                    className="size-3 rounded-full border border-border/70"
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
              <span>{colorThemeLabels[value]}</span>
              {colorTheme === value ? <CheckIcon className="ml-auto size-4 text-foreground" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <div className="mt-1 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-foreground">
        <span className="flex size-7 items-center justify-center rounded-full bg-accent/70 text-muted-foreground">
          <MoonIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">暗黑模式</div>
          <div className="text-[11px] text-muted-foreground">
            {darkModeEnabled ? "当前为深色界面" : "当前为浅色界面"}
          </div>
        </div>
        <Switch
          checked={darkModeEnabled}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          aria-label="切换暗黑模式"
          className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
        />
      </div>
    </DropdownMenuContent>
  );

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
              className="app-control flex size-8 items-center justify-center rounded-lg border-0 text-sidebar-foreground/72 transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
              aria-label="新开文件夹"
            >
              <FolderOpenIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onNewThread()}
              className="app-control flex size-8 items-center justify-center rounded-lg border-0 text-sidebar-foreground/72 transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
              aria-label="新建对话"
            >
              <PlusIcon className="size-4" />
            </button>
            <SidebarTrigger className="app-control size-8 rounded-lg border-0 text-sidebar-foreground/72 shadow-none hover:text-sidebar-foreground" />
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
                                ? "app-sidebar-item-active"
                                : "app-sidebar-item"
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
                className="app-sidebar-item flex w-full flex-col items-center justify-center gap-3 rounded-xl border-dashed px-4 py-8 text-center transition-colors"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="app-sidebar-item flex h-10 w-full items-center gap-3 rounded-[16px] px-3 text-sidebar-foreground/78 transition-colors hover:text-sidebar-foreground"
              >
                <span className="flex size-8 items-center justify-center rounded-[12px] bg-sidebar-foreground/[0.06] text-sidebar-foreground/72">
                  <Settings2Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-left text-[12px] font-medium">设置</span>
              </button>
            </DropdownMenuTrigger>
            {renderSettingsMenu()}
          </DropdownMenu>
        </div>

        <SidebarMenu className="hidden gap-1 group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip="设置"
                  className="app-control-ghost size-10 justify-center rounded-lg px-0 text-[12px] text-sidebar-foreground/60 hover:text-sidebar-foreground"
                >
                  <Settings2Icon className="size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              {renderSettingsMenu()}
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
