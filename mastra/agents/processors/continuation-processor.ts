import type {
  ProcessInputArgs,
  ProcessInputResult,
  Processor,
} from "@mastra/core/processors";
import { getThreadSession } from "@/lib/server/thread-session-store";
import { inferContinuationContext } from "@/lib/continuation";

const getRequestContextString = (
  requestContext: ProcessInputArgs["requestContext"],
  key: string
) => {
  const value = (requestContext as { get?: (name: string) => unknown } | undefined)?.get?.(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const extractLatestUserMessage = (messages: ProcessInputArgs["messages"]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const typedPart = part as { text?: unknown };
          return typeof typedPart.text === "string" ? typedPart.text : "";
        })
        .join("")
        .trim();
      if (text) return text;
    }
  }
  return undefined;
};

export class ContinuationProcessor implements Processor<"continuation-context"> {
  readonly id = "continuation-context" as const;

  async processInput({
    messages,
    systemMessages,
    requestContext,
  }: ProcessInputArgs): Promise<ProcessInputResult> {
    const threadId = getRequestContextString(requestContext, "threadId");
    if (!threadId) return { messages, systemMessages };

    const currentInputText = extractLatestUserMessage(messages);
    const session = await getThreadSession(threadId);
    const continuation = inferContinuationContext(session, currentInputText);
    if (!continuation.isContinuation) {
      return { messages, systemMessages };
    }

    requestContext?.set("continuationMode", "resume");
    if (continuation.lastUserGoal) {
      requestContext?.set("continuationLastUserGoal", continuation.lastUserGoal);
    }
    if (continuation.pendingPlanTitle) {
      requestContext?.set("continuationPlanTitle", continuation.pendingPlanTitle);
    }
    if (continuation.pendingPlanStep) {
      requestContext?.set("continuationPlanStep", continuation.pendingPlanStep);
    }

    const continuationContext = [
      "This turn is a continuation of the current thread's active task.",
      continuation.lastUserGoal
        ? `Last explicit user goal: ${continuation.lastUserGoal}`
        : undefined,
      continuation.pendingPlanTitle
        ? `Existing plan: ${continuation.pendingPlanTitle}`
        : undefined,
      continuation.pendingPlanStep
        ? `Next unfinished step: ${continuation.pendingPlanStep}`
        : undefined,
      "Treat short follow-up input as authorization to continue execution immediately.",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      messages,
      systemMessages: [
        ...systemMessages,
        {
          role: "system",
          content: continuationContext,
        },
      ],
    };
  }
}
