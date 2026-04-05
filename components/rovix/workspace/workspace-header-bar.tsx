"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BranchPicker } from "@/components/rovix/branch-picker";
import type { WorkspaceBranchPayload } from "@/lib/desktop-workspace";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

type WorkspaceHeaderBarProps = {
  chatColumnClassName: string;
  title: string;
  workspaceLabel: string;
  updatedLabel: string;
  workspaceBranches: WorkspaceBranchPayload | null;
  workspaceBranchLoading: boolean;
  onOpenSearch: () => void;
  onSelectBranch: (branch: string) => void | Promise<void>;
  onCreateBranch: () => void | Promise<void>;
  onOpenGitDialog: () => void;
  onPushWorkspace: () => void | Promise<void>;
};

export function WorkspaceHeaderBar({
  chatColumnClassName,
  title,
  workspaceLabel,
  updatedLabel,
  workspaceBranches,
  workspaceBranchLoading,
  onOpenSearch,
  onSelectBranch,
  onCreateBranch,
  onOpenGitDialog,
  onPushWorkspace,
}: WorkspaceHeaderBarProps) {
  return (
    <div
      className={cn(
        chatColumnClassName,
        "flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-3 xl:flex-nowrap xl:items-center",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 max-md:w-full md:max-w-[380px] lg:max-w-[440px] xl:max-w-[500px]">
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-medium tracking-tight text-foreground/92">
              {title}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 overflow-hidden text-[11px] text-muted-foreground/72">
            <span className="truncate">{workspaceLabel}</span>
            <span className="text-border">•</span>
            <span className="truncate">{updatedLabel}</span>
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 flex-wrap items-center justify-end gap-2 md:flex xl:flex-nowrap">
        <Button
          type="button"
          variant="ghost"
          onClick={onOpenSearch}
          className="app-control h-9 rounded-lg border-0 px-3 text-[12px] font-normal text-foreground/78 shadow-none transition-colors hover:text-foreground"
        >
          <Icon icon="solar:magnifer-linear" className="size-4" aria-hidden="true" />
          搜索
        </Button>

        {workspaceBranches?.hasGit ? (
          <div className="flex h-9 max-w-full items-center overflow-hidden rounded-[14px] border border-border/60 bg-background/75 p-1 shadow-[0_8px_20px_rgba(0,0,0,0.07)] backdrop-blur-xl dark:bg-background/55">
            <BranchPicker
              branches={workspaceBranches.branches}
              currentBranch={workspaceBranches.currentBranch}
              loading={workspaceBranchLoading}
              onSelect={onSelectBranch}
              onCreate={onSelectBranch}
            />
            <div className="mx-1 h-4 w-px bg-border/55" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 rounded-[10px] bg-[color:var(--app-soft-fill)] px-3 text-[11px] font-medium text-foreground/92 shadow-none transition-colors hover:bg-[color:var(--app-control-hover)]"
                >
                  <Icon
                    icon="solar:settings-linear"
                    className="size-3 text-foreground/72"
                    aria-hidden="true"
                  />
                  提交
                  <Icon
                    icon="solar:alt-arrow-down-linear"
                    className="size-3 text-muted-foreground/75"
                    aria-hidden="true"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-[168px] rounded-[12px] p-1 text-popover-foreground shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
              >
                <DropdownMenuLabel className="px-2 py-1 text-[10px] font-medium tracking-[0.01em] text-muted-foreground/78">
                  Git 操作
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={onOpenGitDialog}
                  disabled={
                    workspaceBranchLoading || !workspaceBranches.hasChanges
                  }
                  className="rounded-[8px] px-2 py-1.5 text-[11px] font-medium"
                >
                  <Icon
                    icon="solar:settings-linear"
                    className="size-3.5 text-foreground/72"
                    aria-hidden="true"
                  />
                  提交
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void onPushWorkspace()}
                  disabled={
                    workspaceBranchLoading || !workspaceBranches.hasRemote
                  }
                  className="rounded-[8px] px-2 py-1.5 text-[11px] font-medium"
                >
                  <Icon icon="solar:upload-linear" className="size-3.5" aria-hidden="true" />
                  推送
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-0.75" />
                <DropdownMenuItem
                  onClick={() => void onCreateBranch()}
                  className="rounded-[8px] px-2 py-1.5 text-[11px] font-medium"
                >
                  <Icon
                    icon="solar:git-branch-linear"
                    className="size-3.5"
                    aria-hidden="true"
                  />
                  Create branch
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void onSelectBranch("main")}
            className="app-control h-9 rounded-lg border-0 px-3 text-[12px] font-normal text-foreground/78 shadow-none transition-colors hover:text-foreground"
          >
            <Icon
              icon="solar:git-branch-linear"
              className="size-4"
              aria-hidden="true"
            />
            初始化 main
          </Button>
        )}
      </div>
    </div>
  );
}
