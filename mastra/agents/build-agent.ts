import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import { SkillSearchProcessor, TokenLimiterProcessor } from '@mastra/core/processors';
import { getContextBudgetConfig } from '@/lib/context-window';
import { buildAgentMemory } from '../memory';
import {
  applyPatchTool,
  batchTool,
  bashTool,
  browserClickTool,
  browserCloseTool,
  browserListSessionsTool,
  browserOpenTool,
  browserSnapshotTool,
  browserTypeTool,
  browserWaitTool,
  codeSearchTool,
  editTool,
  execCommandTool,
  globTool,
  grepTool,
  listLocalProcessesTool,
  questionTool,
  readTool,
  readLocalProcessLogsTool,
  skillTool,
  stopLocalProcessTool,
  taskTool,
  todoWriteTool,
  webFetchTool,
  webSearchTool,
  writeStdinTool,
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
  batch: batchTool,
  bash: bashTool,
  browser_click: browserClickTool,
  browser_close: browserCloseTool,
  browser_list_sessions: browserListSessionsTool,
  browser_open: browserOpenTool,
  browser_snapshot: browserSnapshotTool,
  browser_type: browserTypeTool,
  browser_wait: browserWaitTool,
  codesearch: codeSearchTool,
  edit: editTool,
  exec_command: execCommandTool,
  glob: globTool,
  grep: grepTool,
  listLocalProcesses: listLocalProcessesTool,
  question: questionTool,
  read: readTool,
  readLocalProcessLogs: readLocalProcessLogsTool,
  skill: skillTool,
  stopLocalProcess: stopLocalProcessTool,
  task: taskTool,
  todowrite: todoWriteTool,
  webfetch: webFetchTool,
  websearch: webSearchTool,
  write_stdin: writeStdinTool,
  write: writeTool,
};

const modelEnv = process.env.MODEL ?? 'openrouter/qwen/qwen3.6-plus:free';
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
const continuationProcessor = new ContinuationProcessor();

export const buildAgentInstructions = ({ requestContext }: { requestContext: RequestContext }) => {
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
  const inputMode = getRequestContextString(requestContext, 'inputMode');
  const currentTurnIncludesImages = getRequestContextString(
    requestContext,
    'currentTurnIncludesImages',
  );

  const runtimeDirectives = [
    `Execution contract:
- For coding work, prefer concrete tool actions before explanatory prose.
- Start by reading or locating the relevant files with read/glob/grep when context is incomplete.
- Use write/edit only after you understand the target files.
- Avoid re-reading the same file with the same intent unless the file changed, the first read was incomplete, or you need a different range for verification.
- Use bash for validation or project commands.
- Use \`exec_command\` as the default protocol for long-running or interactive commands.
- Use \`webfetch\` or \`websearch\` for static web content lookup, and use the \`browser_*\` tools when a page requires real rendering, interaction, screenshots, or client-side state.
- When using browser automation, keep reusing the same \`sessionId\` / \`session_id\` across steps instead of opening a brand new browser for each action.
- For \`exec_command\`, prefer Codex-style arguments: \`cmd\`, \`workdir\`, and optional \`yield_time_ms\`.
- Treat the returned \`session_id\` / \`sessionId\` from \`exec_command\` as the canonical follow-up session handle.
- Use \`write_stdin\` with empty \`chars\` to poll more output, or non-empty \`chars\` to send input.
- Do not use \`bash\` with \`run_in_background: true\` as the primary path for dev servers, watchers, or interactive commands unless you are explicitly recovering an older process.
- After starting a dev server or watcher, if the first \`exec_command\` result does not yet show the requested ready signal, port, or URL, immediately continue with \`write_stdin\` polling until you either see the exact output or the session exits.
- Never guess a localhost port or say "usually 5173" when tool output has not confirmed it. Report the exact emitted URL if present, otherwise clearly say the process is still running and has not printed one yet.
- Use \`readLocalProcessLogs\` only as a compatibility fallback for older \`bash\` background sessions.
- Use \`listLocalProcesses\`, \`readLocalProcessLogs\`, and \`stopLocalProcess\` mainly for recovery, inspection, or compatibility with older background sessions.
- Use glob to find files by pattern and grep/codesearch to locate code quickly.
- Prefer apply_patch for deterministic code edits; use edit/write when patch is not the best fit.
- Use task for explicit subagent delegation only when delegation materially helps.
- Use batch to run independent tool calls in parallel.
- Use question only when required details are missing and a safe assumption is risky.
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

  if (currentTurnIncludesImages === '1' || inputMode === 'image-analysis') {
    runtimeDirectives.push(`Image analysis policy:
- The current user turn includes one or more uploaded images.
- The primary task for this turn is to analyze the uploaded image, not the workspace.
- Resolve phrases like "this image", "this picture", or "analyze it" against the uploaded attachment.
- Treat the latest uploaded attachment in the current turn as the source of truth.
- Ignore earlier image discussions from the thread unless the user explicitly asks for comparison, continuation, or multi-image reasoning.
- Your first response must describe and answer based on the visible image content.
- Do not switch to repository, workspace, or project analysis unless the user explicitly asks for that.`);
  }

  runtimeDirectives.push(
    `Current project path: ${workspaceRoot}
Operate on the local project using the available file, search, edit, and command tools. Stay inside the project by default. If a task appears to require touching unrelated parts of the machine, confirm intent first. Use the skill tool for on-demand skill loading when helpful.`,
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

  const compactionSummary = getRequestContextString(requestContext, 'compactionSummary');
  if (compactionSummary) {
    runtimeDirectives.push(`Compacted thread summary:
${compactionSummary}`.trim());
  }

  return `${baseInstructions}\n\n${runtimeDirectives.join('\n\n')}`;
};

export const buildAgent = new Agent({
  id: 'build-agent',
  name: 'Build Agent',
  instructions: buildAgentInstructions,
  model: ({ requestContext }) => resolveModel({ requestContext }),
  memory: buildAgentMemory,
  inputProcessors: ({ requestContext }) => {
    const workspace = getWorkspaceForRequest(requestContext);
    const model = resolveModel({ requestContext });
    const processors: InputProcessorOrWorkflow[] = [
      new TokenLimiterProcessor(getContextBudgetConfig(model).usableLimitTokens),
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
