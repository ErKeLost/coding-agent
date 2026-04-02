import type {
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowGraphSnapshot,
} from "@/lib/workflow-graph";

export type ThreadRecord = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: number;
  workspaceRoot?: string | null;
};

export type SerializablePlan = {
  title: string;
  todos: Array<{
    id: string;
    label: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
    description?: string;
  }>;
};

export type SerializablePreviewLog = {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: string;
};

export type { WorkflowGraphEdge, WorkflowGraphNode, WorkflowGraphSnapshot };

export type ThreadSessionState = {
  workspaceRoot?: string | null;
  sandboxId?: string | null;
  previewUrl?: string | null;
  items?: unknown[];
  plan?: SerializablePlan | null;
  previewLogs?: SerializablePreviewLog[];
  graph?: WorkflowGraphSnapshot | null;
  execution?: {
    status: "idle" | "resumable";
    lastUserGoal?: string;
    pendingPlanTitle?: string;
    pendingPlanStep?: string;
    recentToolCount?: number;
    updatedAt?: number;
  } | null;
};

export type ThreadSession = ThreadRecord & {
  resourceId: string;
  createdAt?: string;
  state: ThreadSessionState;
};
