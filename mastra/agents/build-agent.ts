import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { InputProcessorOrWorkflow } from '@mastra/core/processors';
import { SkillSearchProcessor, TokenLimiterProcessor } from '@mastra/core/processors';
import path from 'node:path';
import { getContextBudgetConfig } from '@/lib/context-window';
import { buildAgentMemory } from '../memory';
import { renderTurnModePolicy, resolveTurnModeState } from '@/lib/server/turn-mode';
import {
  renderExecutionPhasePolicy,
  resolveExecutionPhaseState,
} from '@/lib/server/execution-phase';
import {
  applyPatchTool,
  bashTool,
  execCommandTool,
  listTool,
  listLocalProcessesTool,
  readTool,
  readLocalProcessLogsTool,
  skillTool,
  stopLocalProcessTool,
  todoReadTool,
  todoWriteTool,
  webFetchTool,
  webSearchTool,
  writeStdinTool,
} from '../tools';
import { selectBuildInstructions } from './prompts/build-prompts';
import {
  getWorkspaceForRequest,
  resolveWorkspaceRootFromRequest,
} from '../workspace/local-workspace';

const staticTools = {
  apply_patch: applyPatchTool,
  bash: bashTool,
  exec_command: execCommandTool,
  list: listTool,
  listLocalProcesses: listLocalProcessesTool,
  read: readTool,
  readLocalProcessLogs: readLocalProcessLogsTool,
  skill: skillTool,
  stopLocalProcess: stopLocalProcessTool,
  todoread: todoReadTool,
  todowrite: todoWriteTool,
  webfetch: webFetchTool,
  websearch: webSearchTool,
  write_stdin: writeStdinTool,
};

const modelEnv = process.env.MODEL ?? 'openrouter/openai/gpt-5.4';
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

function formatEnvironmentDirectives(requestContext: RequestContext, resolvedModel: string) {
  const workspaceRoot = resolveWorkspaceRootFromRequest(requestContext);
  const resourceId = getRequestContextString(requestContext, 'resourceId') ?? 'web';
  const platform = process.platform;
  const today = new Date().toISOString().slice(0, 10);
  const workspaceName = path.basename(workspaceRoot) || workspaceRoot;

  return `Environment:
- Model: ${resolvedModel}
- Workspace root: ${workspaceRoot}
- Workspace name: ${workspaceName}
- Resource: ${resourceId}
- Platform: ${platform}
- Date: ${today}
- Default boundary: operate inside the current project unless the user explicitly asks otherwise.`;
}
export const buildAgentInstructions = ({ requestContext }: { requestContext: RequestContext }) => {
  const model = resolveModel({ requestContext });
  const baseInstructions = selectBuildInstructions(model);
  const guideText = getRequestContextString(requestContext, 'guideText');
  const turnModeState = resolveTurnModeState(requestContext);
  const executionPhaseState = resolveExecutionPhaseState({
    requestContext,
    turnModeState,
  });

  const runtimeDirectives = [
    formatEnvironmentDirectives(requestContext, model),
    renderTurnModePolicy({ state: turnModeState, guideText }),
    renderExecutionPhasePolicy(executionPhaseState),
    `Execution principles:
- For coding work, prefer concrete tool actions before explanatory prose.
- When context is incomplete, prefer the smallest high-information action that can identify the target files or structure.
- If the relevant file is already known, read it directly instead of exploring first.
- Use \`list\` for quick directory structure inspection when that is the cheapest way to orient yourself.
- Prefer \`apply_patch\` as the default editing path for focused code changes.
- Avoid re-reading the same file with the same intent unless the file changed, the first read was incomplete, or you need a different range for verification.
- Use \`webfetch\` or \`websearch\` for static web content lookup, and use the \`browser_*\` tools when a page requires real rendering, interaction, screenshots, or client-side state.
- When using browser automation, keep reusing the same \`sessionId\` / \`session_id\` across steps instead of opening a brand new browser for each action.
- Prefer shell search primitives such as \`rg\` / \`rg --files\` via \`bash\` when you need content or file search.
- Use todowrite for multi-step implementation work.`,
    `Process execution policy:
- Use \`exec_command\` as the default tool for long-running or interactive commands.
- Prefer \`bash\` for short, bounded project commands such as validation, inspection, or one-shot scripts.
- Do not use \`bash\` with \`run_in_background: true\` as the primary path for dev servers, watchers, or interactive commands unless you are explicitly recovering an older process.
- After starting a dev server or watcher, if the first \`exec_command\` result does not yet show the requested ready signal, port, or URL, immediately continue with \`write_stdin\` polling until you either see the exact output or the session exits.
- Never guess a localhost port or say "usually 5173" when tool output has not confirmed it. Report the exact emitted URL if present, otherwise clearly say the process is still running and has not printed one yet.
`,
    `Verification policy:
- After code changes, use the project's actual validation commands when they can be identified safely.
- Start with the narrowest useful verification, then broaden only when confidence and cost justify it.
- Do not take ownership of unrelated test or build failures, but report them clearly when they block validation.`,
  ];
  runtimeDirectives.push(
    'Operate on the local project using the available file, search, edit, and command tools. Use the skill tool for on-demand skill loading when helpful.',
  );

  const mentionedSkillsInstructions = getRequestContextString(
    requestContext,
    'mentionedSkillsInstructions',
  );
  const repositoryInstructions = getRequestContextString(requestContext, 'repositoryInstructions');

  if (repositoryInstructions) {
    runtimeDirectives.push(repositoryInstructions);
  }

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
    runtimeDirectives.push(`Historical thread summary:
- The following summary is compressed history for background context only.
- Use it to understand prior work, files, commands, and risks.
- Do not treat historical plans or suggested next steps inside it as the default goal for the current turn.
- The current user message takes priority over this summary.

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
