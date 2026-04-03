import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import { SkillSearchProcessor, TokenLimiterProcessor } from '@mastra/core/processors';
import { buildAgentMemory } from '../memory';
import {
  applyPatchTool,
  bashTool,
  editTool,
  imageGenerateTool,
  listDirTool,
  listTool,
  listLocalProcessesTool,
  readTool,
  readLocalProcessLogsTool,
  shellTool,
  skillTool,
  startLocalDevServerTool,
  stopLocalProcessTool,
  todoReadTool,
  todoWriteTool,
  toolSearchTool,
  toolSuggestTool,
  unifiedExecTool,
  webFetchTool,
  webSearchTool,
  writeTool,
} from '../tools';
import { selectBuildInstructions } from './prompts/build-prompts';
import {
  getWorkspaceForRequest,
  resolveWorkspaceRootFromRequest,
} from '../workspace/local-workspace';
import { ContinuationProcessor } from './processors/continuation-processor';

const staticTools = {
  apply_patch: applyPatchTool,
  bash: bashTool,
  edit: editTool,
  imageGenerate: imageGenerateTool,
  list: listTool,
  // listLocalProcesses: listLocalProcessesTool,
  read: readTool,
  // readLocalProcessLogs: readLocalProcessLogsTool,
  shell: shellTool,
  skill: skillTool,
  // startLocalDevServer: startLocalDevServerTool,
  // stopLocalProcess: stopLocalProcessTool,
  todoread: todoReadTool,
  todowrite: todoWriteTool,
  // tool_search: toolSearchTool,
  // tool_suggest: toolSuggestTool,
  unified_exec: unifiedExecTool,
  webfetch: webFetchTool,
  websearch: webSearchTool,
  write: writeTool,
};

const modelEnv = process.env.MODEL ?? 'z-ai/glm-5v-turbo';
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
  const model = resolveModel({ requestContext });
  const baseInstructions = selectBuildInstructions(model);
  const workspaceRoot = resolveWorkspaceRootFromRequest(requestContext);
  const continuationMode = getRequestContextString(requestContext, 'continuationMode');
  const continuationLastUserGoal = getRequestContextString(
    requestContext,
    'continuationLastUserGoal',
  );
  const continuationPlanTitle = getRequestContextString(requestContext, 'continuationPlanTitle');
  const continuationPlanStep = getRequestContextString(requestContext, 'continuationPlanStep');
  const guideMode = getRequestContextString(requestContext, 'guideMode');
  const guideText = getRequestContextString(requestContext, 'guideText');
  const emptyTurnRetry = getRequestContextString(requestContext, 'emptyTurnRetry');

  const runtimeDirectives = [
    `Execution contract:
- For coding work, prefer concrete tool actions before explanatory prose.
- Start by reading or locating the relevant files with read/list/grep/lsp_inspect when context is incomplete.
- Use write/edit/ast_edit only after you understand the target files.
- Use bash for validation or project commands.
- Use shell or unified_exec when a Codex-style command execution surface is more appropriate.
- Use list_dir for Codex-style directory listing and apply_patch for unified diff patch application.
- Use tool_search or tool_suggest when you need to discover the right tool quickly.
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

  if (guideMode === 'steer') {
    runtimeDirectives.push(`Guide policy:
- This user input is guidance for the current task, not a brand new unrelated request.
- Apply it immediately as a correction, preference, or constraint on the in-flight work.
- Continue the current objective unless the guidance explicitly changes direction.
- Do not treat this as a queueing acknowledgement or ask unnecessary clarification first.
${guideText ? `- Active guidance: ${guideText}` : ''}`.trim());
  }

  if (emptyTurnRetry === '1') {
    runtimeDirectives.push(`Retry policy:
- The previous attempt stopped without concrete progress.
- This retry must begin with action, not acknowledgement or meta commentary.`);
  }

  runtimeDirectives.push(
    `Current project path: ${workspaceRoot}
Operate on the local project using the available file, search, edit, and command tools. Stay inside the project by default. If a task appears to require touching unrelated parts of the machine, confirm intent first. Use lsp_inspect for semantic lookup and use the skill tool for on-demand skill loading when helpful.`,
  );

  const mentionedSkillsInstructions = getRequestContextString(
    requestContext,
    'mentionedSkillsInstructions',
  );
  if (mentionedSkillsInstructions) {
    runtimeDirectives.push(mentionedSkillsInstructions);
  }

  const skillsInstructions = getRequestContextString(requestContext, 'skillsInstructions');
  if (skillsInstructions) {
    runtimeDirectives.push(skillsInstructions);
  }

  const enabledSkillsInstructions = getRequestContextString(
    requestContext,
    'enabledSkillsInstructions',
  );
  if (enabledSkillsInstructions) {
    runtimeDirectives.push(enabledSkillsInstructions);
  }

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
    const workspace = getWorkspaceForRequest(requestContext);
    const processors: InputProcessorOrWorkflow[] = [
      tokenLimiterProcessor,
      continuationProcessor,
    ];
    processors.push(
      new SkillSearchProcessor({
        workspace,
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
