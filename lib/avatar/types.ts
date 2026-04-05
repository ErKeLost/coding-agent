export type AvatarAction =
  | "idle"
  | "thinking"
  | "focus"
  | "nod"
  | "greet"
  | "explain"
  | "celebrate"
  | "concern";

export type AvatarEmotion =
  | "neutral"
  | "warm"
  | "focused"
  | "excited"
  | "concerned";

export type AvatarLookAt = "user" | "tool_output" | "composer" | "thread_center";

export type AvatarDirective = {
  bubble: string;
  speak: boolean;
  action: AvatarAction;
  emotion: AvatarEmotion;
  lookAt: AvatarLookAt;
  priority: "low" | "medium" | "high";
  source: "heuristic" | "llm";
};

export type AvatarContextItem = {
  type: "message" | "tool" | "thinking" | "agent";
  role?: "user" | "assistant";
  content?: string;
  name?: string;
  status?: string;
  errorText?: string;
};

export type AvatarDirectorRequest = {
  threadId: string;
  threadTitle?: string | null;
  model?: string | null;
  streamStatus: "submitted" | "streaming" | "ready" | "error";
  workspaceLabel?: string | null;
  recentItems: AvatarContextItem[];
};
