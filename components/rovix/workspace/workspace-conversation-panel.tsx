"use client";

import type { ReactNode } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { cn } from "@/lib/utils";

type WorkspaceConversationPanelProps = {
  chatColumnClassName: string;
  children: ReactNode;
};

export function WorkspaceConversationPanel({
  chatColumnClassName,
  children,
}: WorkspaceConversationPanelProps) {
  return (
    <Conversation className="flex min-h-0 flex-1 overflow-hidden">
      <ConversationContent
        className={cn(
          chatColumnClassName,
          "min-h-0 flex-1 gap-2 overflow-y-auto pt-5 pb-4 sm:pt-6 sm:pb-5",
        )}
      >
        {children}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
