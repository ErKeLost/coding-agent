import "server-only";

export type AgentInputMode = "chat" | "image-analysis";

type AgentMessagePart = {
  type?: unknown;
  text?: unknown;
  mediaType?: unknown;
  image?: unknown;
  data?: unknown;
  filename?: unknown;
};

type AgentMessage = {
  role?: unknown;
  content?: unknown;
};

export const normalizeImageMessageParts = (messages: unknown) => {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => {
    if (!message || typeof message !== "object") {
      return message;
    }

    const typedMessage = message as AgentMessage;
    if (!Array.isArray(typedMessage.content)) {
      return message;
    }

    return {
      ...typedMessage,
      content: typedMessage.content.map((part) => {
        if (!part || typeof part !== "object") {
          return part;
        }

        const typedPart = part as AgentMessagePart;
        if (
          typedPart.type === "file" &&
          typeof typedPart.mediaType === "string" &&
          typedPart.mediaType.startsWith("image/") &&
          typeof typedPart.data === "string"
        ) {
          return {
            type: "image" as const,
            mediaType: typedPart.mediaType,
            image: typedPart.data,
          };
        }

        return part;
      }),
    };
  });
};

export const currentTurnIncludesImageInput = (input: unknown) => {
  if (!Array.isArray(input)) {
    return false;
  }

  return input.some((message) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      return false;
    }

    return content.some((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }

      const typedPart = part as {
        type?: unknown;
        mediaType?: unknown;
      };

      return (
        typedPart.type === "image" ||
        (typedPart.type === "file" &&
          typeof typedPart.mediaType === "string" &&
          typedPart.mediaType.startsWith("image/"))
      );
    });
  });
};

const extractTextFromMessageParts = (content: unknown) => {
  if (typeof content === "string") {
    return content.trim() || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .map((part) => {
      if (!part || typeof part !== "object") {
        return "";
      }
      const typedPart = part as { type?: unknown; text?: unknown };
      return typedPart.type === "text" && typeof typedPart.text === "string"
        ? typedPart.text
        : "";
    })
    .join("\n")
    .trim();

  return text || undefined;
};

export const deriveAgentInputMode = (input: unknown): AgentInputMode =>
  currentTurnIncludesImageInput(input) ? "image-analysis" : "chat";

export const injectImageAnalysisDirective = (messages: unknown) => {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => {
    if (!message || typeof message !== "object") {
      return message;
    }

    const typedMessage = message as AgentMessage;
    if (typedMessage.role !== "user" || !Array.isArray(typedMessage.content)) {
      return message;
    }

    const imageParts = typedMessage.content.filter((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }
      return (part as { type?: unknown }).type === "image";
    });

    if (imageParts.length === 0) {
      return message;
    }

    const currentText = extractTextFromMessageParts(typedMessage.content);
    const hasDirective = typedMessage.content.some((part) => {
      if (!part || typeof part !== "object") {
        return false;
      }
      const typedPart = part as { type?: unknown; text?: unknown };
      return (
        typedPart.type === "text" &&
        typeof typedPart.text === "string" &&
        typedPart.text.includes("Attachment analysis directive:")
      );
    });

    if (hasDirective) {
      return message;
    }

    return {
      ...typedMessage,
      content: [
        {
          type: "text" as const,
          text:
            `Attachment analysis directive:\n` +
            `- The uploaded image attachment is the primary subject of this request.\n` +
            `- Resolve brief phrases like "this image" or "the picture" against the attachment.\n` +
            `- Start by describing and analyzing what is visible in the image.\n` +
            `- Do not switch to project/workspace analysis unless the user explicitly asks for it.\n` +
            `- If relevant, answer the user's question about the image directly.\n` +
            `${currentText ? `- User question: ${currentText}` : "- User question may be implicit in the uploaded image."}`,
        },
        ...typedMessage.content,
      ],
    };
  });
};

export const normalizeAgentMessageInput = (input: unknown) => {
  const normalizedImages = normalizeImageMessageParts(input);
  if (!Array.isArray(normalizedImages)) {
    return normalizedImages;
  }

  return injectImageAnalysisDirective(normalizedImages);
};

