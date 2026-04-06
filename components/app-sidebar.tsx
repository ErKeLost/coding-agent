"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import type {
  AvatarModelAssetOption,
  AvatarProfile,
} from "@/lib/avatar/models";
import { cn } from "@/lib/utils";
import { Icon } from "@iconify/react";

type ThreadEntry = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: number;
  workspaceRoot?: string | null;
};

type SidebarModelOption = {
  id: string;
  name: string;
  chef?: string;
};

type SidebarAvatarModelOption = {
  id: string;
  name: string;
  description?: string;
};

type AppSidebarProps = {
  currentThreadId?: string;
  onNewThread: (workspaceRoot?: string | null) => void;
  onSelectThread: (threadId: string) => void;
  onDeleteThread?: (threadId: string) => void;
  onOpenWorkspace?: () => void;
  modelOptions?: SidebarModelOption[];
  currentModelId?: string | null;
  onSelectModel?: (modelId: string) => void;
  avatarModelOptions?: SidebarAvatarModelOption[];
  avatarModelAssetOptions?: AvatarModelAssetOption[];
  currentAvatarModelId?: string | null;
  onSelectAvatarModel?: (modelId: string) => void;
  avatarProfiles?: AvatarProfile[];
  onSaveAvatarProfile?: (payload: {
    draft: Partial<AvatarProfile> & { name: string };
    file?: File | null;
  }) => Promise<AvatarProfile>;
  onDeleteAvatarProfile?: (profileId: string) => void;
  behaviorProfileSummary?: string;
  onResetBehaviorProfile?: () => void;
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

const capabilityActionLabels: Record<string, string> = {
  idle: "待机",
  walk: "行走",
  hop: "轻跳",
  dance: "舞动",
  thinking: "思考",
  focus: "专注",
  explain: "解释",
  greet: "打招呼",
  nod: "点头",
  concern: "担心",
  celebrate: "庆祝",
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
  modelOptions = [],
  currentModelId,
  onSelectModel,
  avatarModelOptions = [],
  avatarModelAssetOptions = [],
  currentAvatarModelId,
  onSelectAvatarModel,
  avatarProfiles = [],
  onSaveAvatarProfile,
  onDeleteAvatarProfile,
  behaviorProfileSummary,
  onResetBehaviorProfile,
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
  const ungroupedThreads = recentThreads.filter((thread) => !thread.workspaceRoot);
  const hasWorkspace = Boolean(workspaceRoot);
  const hasGroupedThreads = groupedThreads.length > 0;
  const hasUngroupedThreads = ungroupedThreads.length > 0;
  const darkModeEnabled = resolvedTheme === "dark";
  const activeColorThemeLabel = colorThemeLabels[colorTheme];
  const activeModel = modelOptions.find((entry) => entry.id === currentModelId) ?? null;
  const modelLabel = activeModel?.name ?? "未选择";
  const modelChefLabel = activeModel?.chef ?? "";
  const activeAvatarModel =
    avatarModelOptions.find((entry) => entry.id === currentAvatarModelId) ?? null;
  const avatarModelLabel = activeAvatarModel?.name ?? "未选择";
  const avatarModelDescription = activeAvatarModel?.description ?? "";
  const activeAvatarProfile =
    avatarProfiles.find((entry) => entry.id === currentAvatarModelId) ?? null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState({
    id: "",
    name: "",
    description: "",
    personalityPrompt: "",
    systemPrompt: "",
    modelPath: "",
    capabilities: undefined as AvatarProfile["capabilities"] | undefined,
    builtin: false,
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarFileName, setAvatarFileName] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  useEffect(() => {
    if (!avatarDialogOpen) return;
    const source = activeAvatarProfile;
    setAvatarDraft({
      id: source?.id ?? "",
      name: source?.name ?? "",
      description: source?.description ?? "",
      personalityPrompt: source?.personalityPrompt ?? "",
      systemPrompt: source?.systemPrompt ?? "",
      modelPath: source?.modelPath ?? "",
      capabilities: source?.capabilities,
      builtin: source?.builtin ?? false,
    });
    setAvatarFile(null);
    setAvatarFileName("");
    setAvatarError("");
  }, [activeAvatarProfile, avatarDialogOpen]);

  const currentAvatarAsset =
    avatarModelAssetOptions.find(
      (entry) => entry.modelPath === avatarDraft.modelPath,
    ) ?? null;

  const openNewAvatarDialog = () => {
    setAvatarDraft({
      id: "",
      name: "",
      description: "",
      personalityPrompt: "",
      systemPrompt: "",
      modelPath: "",
      capabilities: undefined,
      builtin: false,
    });
    setAvatarFile(null);
    setAvatarFileName("");
    setAvatarError("");
    setAvatarDialogOpen(true);
  };

  const openEditAvatarDialog = () => {
    setAvatarDialogOpen(true);
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAvatarFile(file);
    setAvatarFileName(file?.name ?? "");
  };

  const handleAvatarSave = async () => {
    if (!onSaveAvatarProfile) return;
    setAvatarSaving(true);
    setAvatarError("");
    try {
      await onSaveAvatarProfile({
        draft: {
          id: avatarDraft.id || undefined,
          name: avatarDraft.name,
          description: avatarDraft.description,
          personalityPrompt: avatarDraft.personalityPrompt,
          systemPrompt: avatarDraft.systemPrompt,
          modelPath: avatarDraft.modelPath,
          capabilities: avatarDraft.capabilities,
          builtin: avatarDraft.builtin,
        },
        file: avatarFile,
      });
      setAvatarDialogOpen(false);
    } catch (error) {
      setAvatarError(
        error instanceof Error ? error.message : "保存角色失败，请再试一次。",
      );
    } finally {
      setAvatarSaving(false);
    }
  };

  const renderSettingsMenu = () => (
    <DropdownMenuContent
      align="start"
      side="top"
      sideOffset={6}
      className="w-[248px] rounded-[12px] p-1 text-foreground backdrop-blur-none supports-[backdrop-filter]:backdrop-blur-none"
      style={{
        background: "var(--app-panel-bg)",
        borderColor:
          "color-mix(in srgb, var(--app-panel-border) 92%, transparent)",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
      }}
    >
      <DropdownMenuLabel className="px-2 py-1 text-[10px] font-medium tracking-[0.02em] text-muted-foreground">
        设置
      </DropdownMenuLabel>
      <DropdownMenuSeparator className="mx-1 my-0.5 bg-border/70" />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground [&_svg]:text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon icon="solar:cpu-bolt-linear" className="size-3.5" aria-hidden="true" />
            <span>模型</span>
          </div>
          <span className="ml-auto max-w-[110px] truncate text-[10px] text-muted-foreground">
            {modelLabel}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="w-[224px] rounded-[10px] p-0.75 text-foreground backdrop-blur-none supports-[backdrop-filter]:backdrop-blur-none"
          style={{
            background: "var(--app-panel-bg)",
            borderColor:
              "color-mix(in srgb, var(--app-panel-border) 92%, transparent)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
        >
          <div className="px-2 py-1 text-[10px] font-medium tracking-[0.02em] text-muted-foreground">
            当前模型
          </div>
          <div className="px-2 pb-1.5 text-[11px] text-foreground/88">
            <div className="truncate font-medium">{modelLabel}</div>
            {modelChefLabel ? (
              <div className="truncate text-[10px] text-muted-foreground">
                {modelChefLabel}
              </div>
            ) : null}
          </div>
          <DropdownMenuSeparator className="mx-1 my-0.5 bg-border/70" />
          <div className="max-h-[240px] overflow-y-auto pr-0.5">
            {modelOptions.map((entry) => {
              const selected = entry.id === currentModelId;
              return (
                <DropdownMenuItem
                  key={entry.id}
                  onClick={() => onSelectModel?.(entry.id)}
                  className="rounded-[8px] px-2 py-1.5 text-[11px] text-foreground"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{entry.name}</div>
                    {entry.chef ? (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {entry.chef}
                      </div>
                    ) : null}
                  </div>
                  {selected ? (
                    <Icon
                      icon="solar:check-circle-linear"
                      className="ml-2 size-4 shrink-0 text-foreground"
                      aria-hidden="true"
                    />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground [&_svg]:text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon icon="solar:user-id-linear" className="size-3.5" aria-hidden="true" />
            <span>本地画像</span>
          </div>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="w-[260px] rounded-[10px] p-1 text-foreground backdrop-blur-none supports-[backdrop-filter]:backdrop-blur-none"
          style={{
            background: "var(--app-panel-bg)",
            borderColor:
              "color-mix(in srgb, var(--app-panel-border) 92%, transparent)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
        >
          <div className="px-2 py-1 text-[10px] font-medium tracking-[0.02em] text-muted-foreground">
            行为画像摘要
          </div>
          <div className="px-2 pb-2 text-[11px] leading-5 text-foreground/88 whitespace-pre-wrap">
            {behaviorProfileSummary?.trim() || "还在观察中，等你多用几轮之后，这里会慢慢长出更稳定的偏好摘要。"}
          </div>
          <DropdownMenuSeparator className="mx-1 my-0.5 bg-border/70" />
          <DropdownMenuItem
            onClick={() => onResetBehaviorProfile?.()}
            className="rounded-[8px] px-2 py-1.5 text-[11px] text-foreground"
          >
            <Icon icon="solar:restart-linear" className="mr-2 size-3.5" aria-hidden="true" />
            清空本地画像
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground [&_svg]:text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon icon="solar:ghost-smile-linear" className="size-3.5" aria-hidden="true" />
            <span>3D 角色</span>
          </div>
          <span className="ml-auto max-w-[110px] truncate text-[10px] text-muted-foreground">
            {avatarModelLabel}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="w-[224px] rounded-[10px] p-0.75 text-foreground backdrop-blur-none supports-[backdrop-filter]:backdrop-blur-none"
          style={{
            background: "var(--app-panel-bg)",
            borderColor:
              "color-mix(in srgb, var(--app-panel-border) 92%, transparent)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
        >
          <div className="px-2 py-1 text-[10px] font-medium tracking-[0.02em] text-muted-foreground">
            当前 3D 角色
          </div>
          <div className="px-2 pb-1.5 text-[11px] text-foreground/88">
            <div className="truncate font-medium">{avatarModelLabel}</div>
            {avatarModelDescription ? (
              <div className="truncate text-[10px] text-muted-foreground">
                {avatarModelDescription}
              </div>
            ) : null}
          </div>
          <DropdownMenuSeparator className="mx-1 my-0.5 bg-border/70" />
          <div className="max-h-[240px] overflow-y-auto pr-0.5">
            {avatarModelOptions.map((entry) => {
              const selected = entry.id === currentAvatarModelId;
              return (
                <DropdownMenuItem
                  key={entry.id}
                  onClick={() => onSelectAvatarModel?.(entry.id)}
                  className="rounded-[8px] px-2 py-1.5 text-[11px] text-foreground"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{entry.name}</div>
                    {entry.description ? (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {entry.description}
                      </div>
                    ) : null}
                  </div>
                  {selected ? (
                    <Icon
                      icon="solar:check-circle-linear"
                      className="ml-2 size-4 shrink-0 text-foreground"
                      aria-hidden="true"
                    />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </div>
          <DropdownMenuSeparator className="mx-1 my-0.5 bg-border/70" />
          <div className="grid gap-1 p-1">
            <DropdownMenuItem
              onClick={openEditAvatarDialog}
              className="rounded-[8px] px-2 py-1.5 text-[11px] text-foreground"
            >
              <Icon icon="solar:pen-2-linear" className="mr-2 size-3.5" aria-hidden="true" />
              编辑当前角色
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={openNewAvatarDialog}
              className="rounded-[8px] px-2 py-1.5 text-[11px] text-foreground"
            >
              <Icon icon="solar:add-circle-linear" className="mr-2 size-3.5" aria-hidden="true" />
              新建自定义角色
            </DropdownMenuItem>
            {!activeAvatarProfile?.builtin ? (
              <DropdownMenuItem
                onClick={() =>
                  currentAvatarModelId
                    ? onDeleteAvatarProfile?.(currentAvatarModelId)
                    : undefined
                }
                className="rounded-[8px] px-2 py-1.5 text-[11px] text-rose-600 dark:text-rose-300"
              >
                <Icon icon="solar:trash-bin-trash-linear" className="mr-2 size-3.5" aria-hidden="true" />
                删除当前角色
              </DropdownMenuItem>
            ) : null}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-foreground [&_svg]:text-muted-foreground">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Icon icon="solar:palette-round-linear" className="size-3.5" aria-hidden="true" />
            <span>主题</span>
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {activeColorThemeLabel}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="w-[184px] rounded-[10px] p-0.75 text-foreground backdrop-blur-none supports-[backdrop-filter]:backdrop-blur-none"
          style={{
            background: "var(--app-panel-bg)",
            borderColor:
              "color-mix(in srgb, var(--app-panel-border) 92%, transparent)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }}
        >
          {colorThemes.map(({ value }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => setColorTheme(value)}
              className="rounded-[8px] px-2 py-1.5 text-[11px] text-foreground"
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
              {colorTheme === value ? (
                <Icon
                  icon="solar:check-circle-linear"
                  className="ml-auto size-4 text-foreground"
                  aria-hidden="true"
                />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <div className="mt-0.5 flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-foreground">
        <span className="flex size-6 items-center justify-center rounded-full bg-accent/70 text-muted-foreground">
          <Icon icon="solar:moon-linear" className="size-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium">暗黑模式</div>
          <div className="text-[10px] text-muted-foreground">
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
    <>
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className="app-sidebar-surface bg-transparent"
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
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onOpenWorkspace}
                className="app-control rounded-lg border-0 text-sidebar-foreground/72 shadow-none transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                aria-label="新开文件夹"
              >
                <Icon
                  icon="solar:folder-open-linear"
                  className="size-4"
                  aria-hidden="true"
                />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onNewThread(workspaceRoot)}
                size="icon-sm"
                className="app-control rounded-lg border-0 text-sidebar-foreground/72 shadow-none transition-colors hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
                aria-label="新建对话"
              >
                <Icon icon="solar:add-circle-linear" className="size-4" aria-hidden="true" />
              </Button>
              <SidebarTrigger className="app-control size-8 rounded-lg border-0 text-sidebar-foreground/72 shadow-none hover:text-sidebar-foreground" />
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="scrollbar-frost-thin bg-transparent px-3 pb-3 pt-2">
        <div className="space-y-5 group-data-[collapsible=icon]:hidden">
          {groupedThreads.map((group) => (
            <section key={group.name} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1 text-sidebar-foreground/70">
                <Icon
                  icon="solar:folder-with-files-linear"
                  className="size-4 shrink-0 text-sidebar-foreground/50"
                  aria-hidden="true"
                />
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
                            <Icon icon="solar:trash-bin-trash-linear" className="size-4" aria-hidden="true" />
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

          {hasUngroupedThreads ? (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1 text-sidebar-foreground/70">
                <Icon
                  icon="solar:chat-round-dots-linear"
                  className="size-4 shrink-0 text-sidebar-foreground/50"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                  未分组
                </span>
              </div>

              <SidebarMenu className="gap-0.5">
                {ungroupedThreads.map((thread) => {
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
                            <Icon icon="solar:trash-bin-trash-linear" className="size-4" aria-hidden="true" />
                            删除线程
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </section>
          ) : null}

          {!hasGroupedThreads && !hasUngroupedThreads ? (
            <section className="space-y-2.5">
              {hasWorkspace ? (
                <div className="px-1 text-[13px] font-semibold text-sidebar-foreground/70">
                  {getWorkspaceLabel(workspaceRoot)}
                </div>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                onClick={onOpenWorkspace}
                className="app-sidebar-item h-auto w-full flex-col items-center justify-center gap-3 rounded-xl border-dashed px-4 py-8 text-center shadow-none transition-colors"
              >
                <span className="app-control flex size-11 items-center justify-center rounded-xl border-0 text-sidebar-foreground/50">
                  <Icon
                    icon="solar:chat-round-dots-linear"
                    className="size-5"
                    aria-hidden="true"
                  />
                </span>
                <div className="space-y-1">
                  <div className="text-[13px] font-medium text-sidebar-foreground/70">
                    还没有对话
                  </div>
                  <div className="text-[12px] text-sidebar-foreground/50">
                    选择目录后创建新的对话。
                  </div>
                </div>
              </Button>
            </section>
          ) : null}

        </div>

        <div className="hidden flex-col items-center justify-center gap-2 py-3 group-data-[collapsible=icon]:flex">
          <Button
            type="button"
            variant="ghost"
            onClick={onOpenWorkspace}
            className="app-control size-10 rounded-lg border-0 text-sidebar-foreground shadow-none transition-colors"
            aria-label="新开文件夹"
          >
            <Icon
              icon="solar:folder-open-linear"
              className="size-4"
              aria-hidden="true"
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onNewThread(workspaceRoot)}
            className="app-control size-10 rounded-lg border-0 text-sidebar-foreground shadow-none transition-colors"
            aria-label="新建对话"
          >
            <Icon icon="solar:add-circle-linear" className="size-4" aria-hidden="true" />
          </Button>
        </div>
        </SidebarContent>

        <SidebarSeparator className="bg-border" />

        <SidebarFooter className="bg-transparent px-3 py-3 group-data-[collapsible=icon]:px-2.5">
        <div className="space-y-2 group-data-[collapsible=icon]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="app-sidebar-item h-10 w-full justify-start gap-3 rounded-[16px] px-3 text-sidebar-foreground/78 shadow-none transition-colors hover:text-sidebar-foreground"
              >
                <span className="flex size-8 items-center justify-center rounded-[12px] bg-sidebar-foreground/[0.06] text-sidebar-foreground/72">
                  <Icon icon="solar:settings-linear" className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-left text-[12px] font-medium">设置</span>
              </Button>
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
                  <Icon icon="solar:settings-linear" className="size-4" aria-hidden="true" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              {renderSettingsMenu()}
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>
      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent className="max-h-[82vh] max-w-[920px] overflow-hidden rounded-[24px] border-border/70 bg-background/98 p-0">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <DialogTitle className="text-[18px]">
              {avatarDraft.id ? "编辑 3D 角色" : "新建 3D 角色"}
            </DialogTitle>
            <DialogDescription>
              这里可以给角色换模型、起名字、写性格设定和额外 system prompt。
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[calc(82vh-148px)] gap-5 overflow-y-auto px-6 py-5 md:grid-cols-[1.15fr_0.95fr]">
            <div className="grid content-start gap-4">
              <div className="grid gap-2">
                <label className="text-[12px] font-medium text-foreground">角色名</label>
                <Input
                  value={avatarDraft.name}
                  onChange={(event) =>
                    setAvatarDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="比如：泡泡、柚柚、Rin"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-[12px] font-medium text-foreground">角色简介</label>
                <Input
                  value={avatarDraft.description}
                  onChange={(event) =>
                    setAvatarDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="一句话描述这个角色给人的感觉"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-[12px] font-medium text-foreground">性格设定</label>
                <Textarea
                  value={avatarDraft.personalityPrompt}
                  onChange={(event) =>
                    setAvatarDraft((current) => ({
                      ...current,
                      personalityPrompt: event.target.value,
                    }))
                  }
                  placeholder="比如：嘴有点坏但不刻薄，遇到报错会先吐槽一句，再给关键判断。"
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-[12px] font-medium text-foreground">额外 System Prompt</label>
                <Textarea
                  value={avatarDraft.systemPrompt}
                  onChange={(event) =>
                    setAvatarDraft((current) => ({
                      ...current,
                      systemPrompt: event.target.value,
                    }))
                  }
                  placeholder="补充这个角色必须遵守的表达方式、禁忌、关注点。"
                  rows={4}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-[12px] font-medium text-foreground">3D 模型文件</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb,.gltf,.vrm,model/gltf-binary,model/gltf+json"
                  className="hidden"
                  onChange={handleAvatarFileChange}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-[10px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon icon="solar:upload-linear" className="mr-2 size-4" aria-hidden="true" />
                    上传模型
                  </Button>
                  <div className="min-w-0 text-[12px] text-muted-foreground">
                    {avatarFileName || avatarDraft.modelPath || "暂未选择文件"}
                  </div>
                </div>
              </div>
              {avatarError ? (
                <div className="rounded-[12px] bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-700 dark:text-rose-200">
                  {avatarError}
                </div>
              ) : null}
            </div>

            <div className="grid content-start gap-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[12px] font-medium text-foreground">模型列表</label>
                  <span className="text-[10px] text-muted-foreground">
                    {avatarModelAssetOptions.length} 个可用模型
                  </span>
                </div>
                <div className="grid max-h-[220px] gap-2 overflow-y-auto rounded-[18px] border border-border/60 bg-background/55 p-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAvatarDraft((current) => ({
                        ...current,
                        modelPath: "",
                      }))
                    }
                    className={`rounded-[14px] border px-3 py-2 text-left transition-colors ${
                      !avatarDraft.modelPath
                        ? "border-foreground/18 bg-foreground/[0.06]"
                        : "border-border/60 bg-background/82"
                    }`}
                  >
                    <div className="text-[12px] font-medium text-foreground">暂不选择现有模型</div>
                    <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      只保留角色配置，稍后再上传新的 3D 文件。
                    </div>
                  </button>
                  {avatarModelAssetOptions.map((entry) => {
                    const selected = entry.modelPath === avatarDraft.modelPath;
                    return (
                      <button
                        key={entry.modelPath}
                        type="button"
                        onClick={() => {
                          setAvatarDraft((current) => ({
                            ...current,
                            modelPath: entry.modelPath,
                            capabilities: entry.capabilities ?? current.capabilities,
                          }));
                          setAvatarFile(null);
                          setAvatarFileName("");
                        }}
                        className={`rounded-[14px] border px-3 py-2 text-left transition-colors ${
                          selected
                            ? "border-foreground/18 bg-foreground/[0.06]"
                            : "border-border/60 bg-background/82"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[12px] font-medium text-foreground">
                              {entry.name}
                            </div>
                            {entry.description ? (
                              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                {entry.description}
                              </div>
                            ) : null}
                          </div>
                          {selected ? (
                            <Icon
                              icon="solar:check-circle-bold"
                              className="mt-0.5 size-4 shrink-0 text-foreground/70"
                              aria-hidden="true"
                            />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {currentAvatarAsset?.description ? (
                  <div className="text-[11px] leading-5 text-muted-foreground">
                    当前选中：{currentAvatarAsset.description}
                  </div>
                ) : null}
              </div>

              {avatarDraft.capabilities ? (
                <div className="grid gap-2">
                  <label className="text-[12px] font-medium text-foreground">
                    模型能力分析
                  </label>
                  <div className="overflow-hidden rounded-[18px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.92))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]">
                    <div className="grid grid-cols-2 gap-px bg-border/55">
                      <div className="bg-background/88 px-3 py-3">
                        <div className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground">
                          ANIMATIONS
                        </div>
                        <div className="mt-1 text-[20px] font-semibold tracking-tight text-foreground">
                          {avatarDraft.capabilities.animationCount}
                        </div>
                      </div>
                      <div className="bg-background/88 px-3 py-3">
                        <div className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground">
                          MORPH TARGETS
                        </div>
                        <div className="mt-1 text-[20px] font-semibold tracking-tight text-foreground">
                          {avatarDraft.capabilities.morphTargetCount}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(avatarDraft.capabilities.clipGroups)
                          .filter(([, indexes]) => Array.isArray(indexes) && indexes.length > 0)
                          .map(([key]) => (
                            <span
                              key={key}
                              className="rounded-full bg-foreground/[0.045] px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-foreground/72"
                            >
                              {capabilityActionLabels[key] ?? key}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              className="rounded-[10px]"
              onClick={() => setAvatarDialogOpen(false)}
              disabled={avatarSaving}
            >
              取消
            </Button>
            <Button
              type="button"
              className="rounded-[10px]"
              onClick={handleAvatarSave}
              disabled={avatarSaving}
            >
              {avatarSaving ? "保存中..." : "保存角色"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
