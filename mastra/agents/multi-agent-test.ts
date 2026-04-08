import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import {
  codeSearchTool,
  globTool,
  grepTool,
  readTool,
  webFetchTool,
  webSearchTool,
} from "../tools";

const modelEnv = process.env.MODEL ?? "openrouter/qwen/qwen3.6-plus:free";

const getRequestContextString = (requestContext: RequestContext, key: string) => {
  const value = (requestContext as { get?: (name: string) => unknown }).get?.(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const resolveModel = ({ requestContext }: { requestContext: RequestContext }) =>
  getRequestContextString(requestContext, "model") ?? modelEnv;

export const MULTI_AGENT_TEST_ID = "multi-agent-supervisor";

const plannerAgent = new Agent({
  id: "research-planner-agent",
  name: "Research Planner Agent",
  description:
    "Breaks the task into a short plan, identifies which evidence is needed, and decides whether web research or repo research is necessary.",
  instructions: `You are the planning specialist for a deep research team.

Your job:
- Read the user task and produce a concise research plan.
- Call out the open questions that still need evidence.
- Explicitly say whether the task needs external web research, local repository research, or both.

Rules:
- Be concise and structured.
- Do not invent facts.
- Do not browse the web or inspect files yourself.`,
  model: ({ requestContext }) => resolveModel({ requestContext }),
  defaultOptions: {
    maxSteps: 4,
  },
});

const webResearchAgent = new Agent({
  id: "web-research-agent",
  name: "Web Research Agent",
  description:
    "Finds external facts on the web using search and fetch tools, then returns a source-backed summary with links.",
  instructions: `You are the external research specialist.

Use the available web tools to gather evidence.

Rules:
- Prefer primary or official sources when possible.
- Return a concise source-backed summary.
- Include links inline in markdown when you cite a source.
- If a source is weak or ambiguous, say so clearly.`,
  model: ({ requestContext }) => resolveModel({ requestContext }),
  tools: {
    websearch: webSearchTool,
    webfetch: webFetchTool,
  },
  defaultOptions: {
    maxSteps: 6,
  },
});

const repoResearchAgent = new Agent({
  id: "repo-research-agent",
  name: "Repo Research Agent",
  description:
    "Inspects the local codebase to explain how agent streaming works, which files implement it, and what events are emitted.",
  instructions: `You are the repository research specialist.

Use the local code search tools to inspect the workspace and answer questions about implementation details.

Rules:
- Cite concrete file paths when you make claims.
- Prefer grep, glob, read, and code search over broad speculation.
- Focus on the files that directly prove the behavior.`,
  model: ({ requestContext }) => resolveModel({ requestContext }),
  tools: {
    glob: globTool,
    grep: grepTool,
    read: readTool,
    codesearch: codeSearchTool,
  },
  defaultOptions: {
    maxSteps: 6,
  },
});

const synthesisAgent = new Agent({
  id: "research-synthesis-agent",
  name: "Research Synthesis Agent",
  description:
    "Combines the planner, web, and repo findings into a final answer that clearly separates conclusions from evidence.",
  instructions: `You are the synthesis specialist.

Your job:
- Merge the gathered findings into one polished answer.
- Separate confirmed evidence from inference.
- If repo findings and web findings disagree, say that explicitly.
- End with a short verdict on whether the current implementation can surface sub-agent output in one stream.`,
  model: ({ requestContext }) => resolveModel({ requestContext }),
  defaultOptions: {
    maxSteps: 4,
  },
});

export const multiAgentSupervisor = new Agent({
  id: MULTI_AGENT_TEST_ID,
  name: "Multi-Agent Deep Research Supervisor",
  instructions: `You are a supervisor agent coordinating a deep research team.

Available specialists:
- research-planner-agent: creates the plan and decides what evidence is needed.
- web-research-agent: gathers external facts with web tools.
- repo-research-agent: inspects the local repository implementation.
- research-synthesis-agent: combines the findings into the final answer.

Execution policy:
- Always delegate to research-planner-agent first.
- If the task asks about the current app, Codex behavior, stream events, or implementation details, delegate to repo-research-agent.
- If the task needs external facts or framework behavior beyond the local codebase, delegate to web-research-agent.
- Before you finish, delegate to research-synthesis-agent to produce the final response.
- Do not skip delegation unless the user asks something trivial.

Output policy:
- Produce a useful final answer for the user.
- Keep the final answer readable, but preserve important technical specifics.
- Mention whether your conclusion comes from local code inspection, external research, or both.`,
  model: ({ requestContext }) => resolveModel({ requestContext }),
  agents: {
    plannerAgent,
    webResearchAgent,
    repoResearchAgent,
    synthesisAgent,
  },
  defaultOptions: {
    maxSteps: 12,
  },
});
