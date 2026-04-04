"use client";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import { usePromptInputAttachments } from "@/components/ai-elements/prompt-input";

export function WorkspacePromptAttachments() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments
      variant="grid"
      className="ml-0 w-full justify-start gap-3 px-5 pt-4"
    >
      {attachments.files.map((attachment) => (
        <Attachment
          data={attachment}
          key={attachment.id}
          onRemove={() => attachments.remove(attachment.id)}
          className="size-14 overflow-hidden rounded-lg border border-border/45 bg-background/70 shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          <AttachmentPreview className="rounded-lg bg-muted/30" />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}
