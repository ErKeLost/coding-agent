export type WorkflowNodeStatus = "idle" | "active" | "done" | "error";
export type WorkflowNodeKind = "entry" | "agent" | "tool" | "error";

export type WorkflowNodeData = {
  label: string;
  kind: WorkflowNodeKind;
  meta?: string;
  active?: boolean;
  status?: WorkflowNodeStatus;
};

export type WorkflowGraphNode = {
  id: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
  type?: string;
};

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  markerEnd?: {
    type: string;
    width?: number;
    height?: number;
    color?: string;
  };
  style?: Record<string, unknown>;
};

export type WorkflowGraphSnapshot = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowTraceStep = {
  toolCallId: string;
  toolName: string;
  agentLabel?: string;
  status: "pending" | "done" | "error";
  meta?: string;
};

export const initialWorkflowGraph: WorkflowGraphSnapshot = {
  nodes: [
    {
      id: "1",
      position: { x: 80, y: 80 },
      data: { label: "Thread", kind: "entry", meta: "conversation started" },
      type: "workflow",
    },
    {
      id: "2",
      position: { x: 260, y: 220 },
      data: { label: "Build Agent", kind: "agent", meta: "orchestration" },
      type: "workflow",
    },
    {
      id: "3",
      position: { x: 480, y: 80 },
      data: { label: "Workspace Tool", kind: "tool", meta: "local execution surface" },
      type: "workflow",
    },
  ],
  edges: [
    { id: "e1-2", source: "1", target: "2" },
    { id: "e2-3", source: "2", target: "3" },
  ],
};

export const summarizeThreadTitle = (value: string) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled thread";
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
};

export const inferWorkflowAgentLabel = (toolName?: string) => {
  const normalized = toolName?.toLowerCase() ?? "";
  if (
    normalized.includes("websearch") ||
    normalized.includes("webfetch") ||
    normalized.includes("codesearch") ||
    normalized.includes("grep")
  ) {
    return "Explore Agent";
  }
  if (normalized.includes("image")) {
    return "Image Agent";
  }
  if (
    normalized.includes("deploy") ||
    normalized.includes("sandbox") ||
    normalized.includes("bash") ||
    normalized.includes("write") ||
    normalized.includes("patch") ||
    normalized.includes("edit") ||
    normalized.includes("read") ||
    normalized.includes("run")
  ) {
    return "Build Agent";
  }
  return "Network Agent";
};

export const mapToolStatusToWorkflowStatus = (
  status: WorkflowTraceStep["status"]
): WorkflowNodeStatus => {
  if (status === "error") return "error";
  if (status === "done") return "done";
  return "active";
};

export const isWorkflowGraphSnapshot = (value: unknown): value is WorkflowGraphSnapshot => {
  if (!value || typeof value !== "object") return false;
  const record = value as { nodes?: unknown; edges?: unknown };
  return Array.isArray(record.nodes) && Array.isArray(record.edges);
};

export const createWorkflowGraphSnapshot = (params: {
  threadId?: string;
  title?: string;
  previewUrl?: string | null;
  status: "idle" | "streaming" | "done" | "error";
  steps: WorkflowTraceStep[];
  activeAgentLabel?: string;
  activeAgentMeta?: string;
}): WorkflowGraphSnapshot => {
  const derivedNodes: WorkflowGraphNode[] = [
    {
      id: "entry",
      position: { x: 44, y: 94 },
      data: {
        label: params.title?.trim() ? summarizeThreadTitle(params.title) : "Thread",
        kind: "entry",
        meta: params.threadId ? `thread ${params.threadId.slice(0, 18)}` : "conversation started",
        active: params.status === "streaming",
        status: params.status === "error" ? "error" : params.status === "streaming" ? "active" : "done",
      },
      type: "workflow",
    },
  ];

  if (params.steps.length === 0) {
    const idleNodes: WorkflowGraphNode[] = [
      {
        id: "agent-idle",
        position: { x: 286, y: 94 },
        data: {
          label: params.activeAgentLabel ?? "Network Agent",
          kind: "agent",
          meta:
            params.activeAgentMeta ??
            (params.previewUrl ? "preview attached" : "idle orchestration"),
          active: params.status === "streaming",
          status: params.status === "error" ? "error" : params.status === "streaming" ? "active" : "idle",
        },
        type: "workflow",
      },
      {
        id: "tool-idle",
        position: { x: 514, y: 94 },
        data: {
          label: params.previewUrl ? "Workspace Preview" : "Execution Surface",
          kind: "tool",
          meta: params.previewUrl ? "preview available" : "waiting for tool call",
          active: false,
          status: params.previewUrl ? "done" : "idle",
        },
        type: "workflow",
      },
    ];

    return {
      nodes: [...derivedNodes, ...idleNodes],
      edges: createWorkflowEdges([...derivedNodes, ...idleNodes], params.status, params.previewUrl),
    };
  }

  let currentX = 286;
  let previousAgentLabel = "";

  params.steps.slice(-6).forEach((step, index) => {
    const effectiveStatus =
      params.status === "done" && step.status === "pending" ? "done" : step.status;
    const agentLabel = step.agentLabel ?? inferWorkflowAgentLabel(step.toolName);
    const shouldCreateAgent = index === 0 || agentLabel !== previousAgentLabel;
    const isLast = index === params.steps.slice(-6).length - 1;

    if (shouldCreateAgent) {
      derivedNodes.push({
        id: `agent-${index}`,
        position: { x: currentX, y: 94 },
        data: {
          label: agentLabel,
          kind: "agent",
          meta:
            effectiveStatus === "error"
              ? "handoff blocked by tool failure"
              : params.status === "streaming" && isLast
                ? "delegating execution"
                : "completed handoff",
          active: params.status === "streaming" && isLast,
          status:
            effectiveStatus === "error"
              ? "error"
              : params.status === "streaming" && isLast
                ? "active"
                : "done",
        },
        type: "workflow",
      });
      currentX += 228;
    }

    derivedNodes.push({
      id: `tool-${step.toolCallId}`,
      position: { x: currentX, y: 94 },
        data: {
          label: step.toolName,
          kind: effectiveStatus === "error" ? "error" : "tool",
          meta: step.meta ?? effectiveStatus,
          active: effectiveStatus === "pending",
          status: mapToolStatusToWorkflowStatus(effectiveStatus),
        },
        type: "workflow",
      });
    currentX += 228;
    previousAgentLabel = agentLabel;
  });

  return {
    nodes: derivedNodes,
    edges: createWorkflowEdges(derivedNodes, params.status, params.previewUrl),
  };
};

const createWorkflowEdges = (
  nodes: WorkflowGraphNode[],
  streamStatus: "idle" | "streaming" | "done" | "error",
  previewUrl?: string | null
): WorkflowGraphEdge[] => {
  const nextEdges: WorkflowGraphEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const sourceNode = nodes[index];
    const targetNode = nodes[index + 1];
    const targetStatus = targetNode.data?.status;
    const isHighlighted = Boolean(
      targetStatus === "active" ||
        targetStatus === "done" ||
        (previewUrl && index === nodes.length - 2)
    );
    const isError = targetStatus === "error";

    nextEdges.push({
      id: `${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      animated: streamStatus === "streaming" && (isHighlighted || isError),
      markerEnd: {
        type: "arrowclosed",
        width: 18,
        height: 18,
        color: isError
          ? "rgba(220,38,38,0.8)"
          : isHighlighted
            ? "rgba(16,185,129,0.75)"
            : "hsl(var(--border))",
      },
      style: {
        stroke: isError
          ? "rgba(220,38,38,0.8)"
          : isHighlighted
            ? "rgba(16,185,129,0.75)"
            : "hsl(var(--border))",
        strokeWidth: isHighlighted || isError ? 2 : 1.5,
        opacity: isHighlighted || isError ? 1 : 0.7,
      },
    });
  }
  return nextEdges;
};
