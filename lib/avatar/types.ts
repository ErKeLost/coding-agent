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

export type AvatarMoveTarget =
  | "left"
  | "left_center"
  | "center"
  | "right_center"
  | "right"
  | "tool_output"
  | "composer"
  | "wander";

export type AvatarLocomotion = "idle" | "walk" | "hop" | "dance";

export type AvatarBubbleTheme = {
  borderColor?: string;
  textColor?: string;
  backgroundFrom?: string;
  backgroundTo?: string;
  glowColor?: string;
};

export type AvatarDirective = {
  bubble: string;
  speak: boolean;
  action: AvatarAction;
  emotion: AvatarEmotion;
  lookAt: AvatarLookAt;
  moveTo: AvatarMoveTarget;
  locomotion: AvatarLocomotion;
  priority: "low" | "medium" | "high";
  bubbleTheme?: AvatarBubbleTheme;
  source: "heuristic" | "llm";
  sourceDetail?:
    | "default"
    | "openrouter"
    | "no-api-key"
    | "http-error"
    | "empty-content"
    | "invalid-json"
    | "exception";
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
  avatarName?: string | null;
  avatarDescription?: string | null;
  avatarPersonalityPrompt?: string | null;
  avatarSystemPrompt?: string | null;
  avatarCapabilitiesSummary?: string | null;
  userBehaviorSummary?: string | null;
  streamStatus: "submitted" | "streaming" | "ready" | "error";
  workspaceLabel?: string | null;
  ambientTick?: number;
  recentItems: AvatarContextItem[];
};
