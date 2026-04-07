"use client";

import type { ReactNode } from "react";
import type { ThreadContextWindowState } from "@/lib/context-window";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { Plan } from "@/components/tool-ui/plan";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

type WorkspaceComposerShellProps = {
  chatColumnClassName: string;
  activePlan: React.ComponentProps<typeof Plan> | null;
  contextWindow?: ThreadContextWindowState | null;
  queuedSubmissionPreview: {
    text?: string;
    files?: Array<{ filename?: string | null } | null>;
  } | null;
  queuedSubmissionSummary: string | null;
  guideBanner: { text: string } | null;
  canStartConversation: boolean;
  onPromoteQueuedSubmissionToGuide: () => void | Promise<void>;
  children: ReactNode;
};

export function WorkspaceComposerShell({
  chatColumnClassName,
  activePlan,
  contextWindow,
  queuedSubmissionPreview,
  queuedSubmissionSummary,
  guideBanner,
  canStartConversation,
  onPromoteQueuedSubmissionToGuide,
  children,
}: WorkspaceComposerShellProps) {
  return (
    <PromptInputProvider initialInput="">
      <div className={cn(chatColumnClassName)}>
        <div
          className={cn(
            "app-input-shell app-frosted overflow-hidden",
            activePlan ? "rounded-[18px]" : "rounded-[16px]",
          )}
        >
          {activePlan ? (
            <Plan
              {...activePlan}
              maxVisibleTodos={2}
              showProgress
              className="w-full rounded-none border-0 border-b border-border/45 bg-transparent py-0 shadow-none"
            />
          ) : null}

          {queuedSubmissionPreview || guideBanner ? (
            <div className="w-full border-b border-border/40 bg-transparent">
              {queuedSubmissionPreview ? (
                <div className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-[12px] text-muted-foreground">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Icon
                      icon="solar:refresh-linear"
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    <span className="truncate">{queuedSubmissionSummary}</span>
                  </div>
                  <WorkspacePromptGuideButton
                    disabled={!canStartConversation}
                    onClick={() => void onPromoteQueuedSubmissionToGuide()}
                  />
                </div>
              ) : null}

              {guideBanner ? (
                <div
                  className={cn(
                    "flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3 text-[12px] text-muted-foreground",
                    queuedSubmissionPreview ? "border-t border-border/35" : "",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Icon
                      icon="solar:magic-stick-3-linear"
                      className="size-3.5 shrink-0 text-primary/80"
                      aria-hidden="true"
                    />
                    <span className="truncate">{guideBanner.text}</span>
                  </div>
                  {queuedSubmissionPreview ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void onPromoteQueuedSubmissionToGuide()}
                      className="h-auto shrink-0 px-0 py-0 text-[11px] text-foreground/75 shadow-none transition-colors hover:bg-transparent hover:text-foreground"
                    >
                      转为引导
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {children}

          {contextWindow ? (
            <div className="flex w-full items-center justify-between border-t border-border/35 px-5 py-2 text-[11px] text-muted-foreground/80">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">当前上下文</span>
                <span className="font-mono text-foreground/84">
                  {new Intl.NumberFormat("en-US", {
                    notation: "compact",
                  }).format(
                    contextWindow.actualPromptTokens ??
                      contextWindow.estimatedPromptTokens,
                  )}
                  {" / "}
                  {new Intl.NumberFormat("en-US", {
                    notation: "compact",
                  }).format(contextWindow.limitTokens)}
                </span>
                <span className="shrink-0 rounded-full border border-border/55 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em]">
                  {Math.round(contextWindow.percentage * 100)}%
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span>{contextWindow.source === "actual" ? "实测" : "估算"}</span>
                {contextWindow.summaryActive ? (
                  <span className="rounded-full border border-amber-300/40 bg-amber-500/[0.08] px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-500/25 dark:text-amber-300">
                    compact
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </PromptInputProvider>
  );
}

export const WorkspacePromptGuideButton = ({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) => {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className="app-control h-9 rounded-full border-0 px-3 text-[12px] font-medium text-foreground/88 shadow-none disabled:cursor-not-allowed"
    >
      <Icon
        icon="solar:magic-stick-3-linear"
        className="size-3.5 text-primary/80"
        aria-hidden="true"
      />
      引导
    </Button>
  );
};
