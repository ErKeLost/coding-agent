"use client";

import type { ReactNode } from "react";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { Plan } from "@/components/tool-ui/plan";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

type WorkspaceComposerShellProps = {
  chatColumnClassName: string;
  activePlan: React.ComponentProps<typeof Plan> | null;
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
