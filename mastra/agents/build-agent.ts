import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import { SkillSearchProcessor, TokenLimiterProcessor } from '@mastra/core/processors';
import { buildAgentMemory } from '../memory';
import {
  imageGenerateTool,
  listLocalProcessesTool,
  readLocalProcessLogsTool,
  runWorkspaceCommandTool,
  startLocalDevServerTool,
  stopLocalProcessTool,
  todoReadTool,
  todoWriteTool,
  webFetchTool,
  webSearchTool,
} from '../tools';
import { selectBuildInstructions } from './prompts/build-prompts';
import {
  getWorkspaceForRequest,
  resolveWorkspaceRootFromRequest,
} from '../workspace/local-workspace';
import { ContinuationProcessor } from './processors/continuation-processor';

const staticTools = {
  imageGenerate: imageGenerateTool,
  listLocalProcesses: listLocalProcessesTool,
  readLocalProcessLogs: readLocalProcessLogsTool,
  runCommand: runWorkspaceCommandTool,
  startLocalDevServer: startLocalDevServerTool,
  stopLocalProcess: stopLocalProcessTool,
  todoread: todoReadTool,
  todowrite: todoWriteTool,
  webfetch: webFetchTool,
  websearch: webSearchTool,
};

const modelEnv = process.env.MODEL ?? 'openrouter/qwen/qwen3.6-plus-preview:free';
function getRequestContextString(requestContext: RequestContext, key: string) {
  const value = (requestContext as { get: (name: string) => unknown }).get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const resolveModel = ({ requestContext }: { requestContext: RequestContext }) => {
  const override = getRequestContextString(requestContext, 'model');
  if (override) {
    return override;
  }
  return modelEnv;
};
const CONTEXT_WINDOW_TOKENS = 300000;
const CONTEXT_USAGE_RATIO = 0.6;
const CONTEXT_LIMIT_TOKENS = Math.floor(CONTEXT_WINDOW_TOKENS * CONTEXT_USAGE_RATIO);
const tokenLimiterProcessor = new TokenLimiterProcessor(CONTEXT_LIMIT_TOKENS);
const continuationProcessor = new ContinuationProcessor();

const buildInstructions = ({ requestContext }: { requestContext: RequestContext }) => {
  const baseInstructions = selectBuildInstructions(resolveModel({ requestContext }));
  const workspaceRoot = resolveWorkspaceRootFromRequest(requestContext);
  console.info('[workspace-debug] build-agent:instructions', {
    workspaceRoot,
    model: resolveModel({ requestContext }),
    threadId: getRequestContextString(requestContext, 'threadId') ?? null,
  });
  const continuationMode = getRequestContextString(requestContext, 'continuationMode');
  const continuationLastUserGoal = getRequestContextString(
    requestContext,
    'continuationLastUserGoal',
  );
  const continuationPlanTitle = getRequestContextString(requestContext, 'continuationPlanTitle');
  const continuationPlanStep = getRequestContextString(requestContext, 'continuationPlanStep');
  const emptyTurnRetry = getRequestContextString(requestContext, 'emptyTurnRetry');

  const runtimeDirectives = [
    `Execution contract:
- For coding work, prefer concrete tool actions before explanatory prose.
- Start by reading or locating the relevant files with read/list/grep/lsp_inspect when context is incomplete.
- Use write/edit/ast_edit only after you understand the target files.
- Use runCommand for validation or project commands.
- Use startLocalDevServer for long-running dev servers such as bun dev, npm run dev, pnpm dev, or yarn dev.
- Use listLocalProcesses, readLocalProcessLogs, and stopLocalProcess to manage long-running services after they start.
- Do not use getProcessOutput with wait=true to watch a long-running dev server.
- Use todowrite for multi-step implementation work.`,
  ];

  if (continuationMode === 'resume') {
    runtimeDirectives.push(`Continuation policy:
- This user message is a continuation/resume signal for an existing task.
- Treat it as authorization to continue execution immediately.
- Do not end the turn with an acknowledgement-only reply such as "收到，马上开始" or "I’ll start now."
- Your first visible response should describe the next concrete action, then proceed to tool use.
${continuationLastUserGoal ? `- Last explicit user goal: ${continuationLastUserGoal}` : ''}
${continuationPlanTitle ? `- Existing plan: ${continuationPlanTitle}` : ''}
${continuationPlanStep ? `- Next unfinished step: ${continuationPlanStep}` : ''}`.trim());
  }

  if (emptyTurnRetry === '1') {
    runtimeDirectives.push(`Retry policy:
- The previous attempt stopped without concrete progress.
- This retry must begin with action, not acknowledgement or meta commentary.`);
  }

  runtimeDirectives.push(
    `Current project path: ${workspaceRoot}
Operate on the local project using the available file, search, edit, and command tools. Stay inside the project by default. If a task appears to require touching unrelated parts of the machine, confirm intent first. Use lsp_inspect for semantic lookup and search_skills/load_skill for on-demand skill discovery when helpful.`,
  );

  return `${baseInstructions}\n\n${runtimeDirectives.join('\n\n')}`;
};

export const buildAgent = new Agent({
  id: 'build-agent',
  name: 'Build Agent',
  instructions: buildInstructions,
  model: ({ requestContext }) => resolveModel({ requestContext }),
  memory: buildAgentMemory,
  workspace: ({ requestContext }) => getWorkspaceForRequest(requestContext),
  inputProcessors: ({ requestContext }) => {
    const processors: InputProcessorOrWorkflow[] = [
      tokenLimiterProcessor,
      continuationProcessor,
    ];
    processors.push(
      new SkillSearchProcessor({
        workspace: getWorkspaceForRequest(requestContext)!,
        search: {
          topK: 5,
          minScore: 0.1,
        },
        ttl: 5 * 60_000,
      }),
    );

    return processors;
  },
  tools: staticTools,
  defaultOptions: {
    maxSteps: 80,
  },
});
