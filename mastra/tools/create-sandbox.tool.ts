import { createTool } from '@mastra/core/tools';
import type { CreateSandboxFromSnapshotParams } from '@daytonaio/sdk';
import z from 'zod';
import { getDaytonaClient, getSandbox } from './daytona-client';
import {
  DEFAULT_SKILLS_DIR,
  formatSkillList,
  loadSkills,
  pickBestSkillMatch,
  pickTopSkillMatches,
} from './sandbox-helpers';

const sandboxByThread = new Map<string, string>();

type SandboxResolutionContext = {
  agent?: {
    requestContext?: { get?: (key: string) => unknown };
    threadId?: string;
    resourceId?: string;
  };
  requestContext?: { get?: (key: string) => unknown };
  runtimeContext?: { get?: (key: string) => unknown };
  context?: {
    requestContext?: { get?: (key: string) => unknown };
  };
  threadId?: string;
  resourceId?: string;
};

function readSandboxIdFromContext(context?: SandboxResolutionContext): string | undefined {
  const candidates = [
    context?.agent?.requestContext,
    context?.requestContext,
    context?.runtimeContext,
    context?.context?.requestContext,
  ];

  for (const candidate of candidates) {
    const value = candidate?.get?.('sandboxId');
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function resolveSandboxKey(
  inputData: { threadId?: string; resourceId?: string },
  context?: SandboxResolutionContext,
) {
  const threadId = context?.agent?.threadId ?? context?.threadId ?? inputData.threadId;
  if (threadId) return `thread:${threadId}`;
  const resourceId = context?.agent?.resourceId ?? context?.resourceId ?? inputData.resourceId;
  if (resourceId) return `resource:${resourceId}`;
  return null;
}

export function getCachedSandboxId(
  inputData: { threadId?: string; resourceId?: string },
  context?: SandboxResolutionContext,
): string | undefined {
  const cacheKey = resolveSandboxKey(inputData, context);
  return cacheKey ? sandboxByThread.get(cacheKey) : undefined;
}

export function rememberSandboxId(
  sandboxId: string,
  inputData: { threadId?: string; resourceId?: string },
  context?: SandboxResolutionContext,
) {
  const cacheKey = resolveSandboxKey(inputData, context);
  if (cacheKey) sandboxByThread.set(cacheKey, sandboxId);
}

export function resolveSandboxIdFromInputOrContext(
  inputData: { sandboxId?: string; threadId?: string; resourceId?: string },
  context?: SandboxResolutionContext,
  fallbackSandboxId = process.env.DAYTONA_SANDBOX_ID,
): string | undefined {
  if (typeof inputData.sandboxId === 'string' && inputData.sandboxId.trim()) {
    return inputData.sandboxId.trim();
  }

  const fromContext = readSandboxIdFromContext(context);
  if (fromContext) return fromContext;

  const cachedId = getCachedSandboxId(inputData, context);
  if (cachedId) return cachedId;

  return fallbackSandboxId;
}

async function buildSandboxResult(
  sandboxId: string,
  capabilityNeeds?: string,
  matchOptions?: { minScore?: number; minDelta?: number },
) {
  let skillsHint: string | undefined;
  let skillsCount: number | undefined;
  let matchedSkillNames: string[] | undefined;
  let matchedSkillScores: number[] | undefined;
  try {
    const skills = await loadSkills(sandboxId, DEFAULT_SKILLS_DIR);
    skillsHint = formatSkillList(skills);
    skillsCount = skills.length;
    if (capabilityNeeds && skills.length > 0) {
      const matches = pickTopSkillMatches(capabilityNeeds, skills, {
        minScore: matchOptions?.minScore,
        limit: 5,
      });
      if (matches.length > 0) {
        matchedSkillNames = matches.map(match => match.skill.name);
        matchedSkillScores = matches.map(match => match.score);
      } else {
        const { skill, score } = pickBestSkillMatch(capabilityNeeds, skills, matchOptions);
        if (skill) {
          matchedSkillNames = [skill.name];
          matchedSkillScores = [score];
        }
      }
    }
  } catch {
    // Ignore skill discovery errors to avoid blocking sandbox creation.
  }

  return {
    sandboxId,
    skillsDir: DEFAULT_SKILLS_DIR,
    skillsHint,
    skillsCount,
    matchedSkillNames,
    matchedSkillScores,
  };
}

export const createSandbox = createTool({
  id: 'createSandbox',
  description:
    'Create a Daytona sandbox. When this is in response to a user request, include a skill-oriented summary in `capabilityNeeds` so skill auto-matching can suggest relevant skills (e.g., frontend design, UI/UX, architecture, testing, docs).',
  inputSchema: z.object({
    language: z.enum(['typescript']).optional().describe('Language preset for the sandbox'),
    metadata: z.record(z.string(), z.string()).optional().describe('Custom metadata for the sandbox'),
    envs: z.record(z.string(), z.string()).optional().describe(`
      Custom environment variables for the sandbox.
      Used when executing commands and code in the sandbox.
      Can be overridden with the \`envs\` argument when executing commands or code.
    `),
    timeoutMS: z.number().optional().describe(`
      Timeout for the sandbox in **milliseconds**.
      Maximum time a sandbox can be kept alive is 24 hours (86_400_000 milliseconds) for Pro users and 1 hour (3_600_000 milliseconds) for Hobby users.
      @default 300_000 // 5 minutes
    `),
    threadId: z.string().optional().describe('Optional thread ID to reuse a sandbox per chat thread'),
    resourceId: z.string().optional().describe('Optional resource ID to reuse a sandbox per resource'),
    capabilityNeeds: z.string().optional().describe(`
      Skill-oriented summary of the user request.
      Extract the key capabilities needed (e.g., frontend-design, ui-ux-pro-max, architecture,
      deployment-procedures, webapp-testing, documentation-templates).
      Keep it short and explicit so skill matching can pick the right skills.
      Example: "Design a beautiful English SaaS marketing site about cloud services (frontend-design, ui-ux-pro-max)."
    `),
    skillMatchMinScore: z.number().optional().describe('Minimum score required to auto-match a skill.'),
    skillMatchMinDelta: z.number().optional().describe('Minimum score delta from runner-up to auto-match a skill.'),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    skillsDir: z.string().optional(),
    skillsHint: z.string().optional(),
    skillsCount: z.number().optional(),
    matchedSkillNames: z.array(z.string()).optional(),
    matchedSkillScores: z.array(z.number()).optional(),
  }),
  execute: async (inputData, context) => {
    try {
      const daytona = getDaytonaClient();
      const cacheKey = resolveSandboxKey(inputData, context);
      const cachedId = getCachedSandboxId(inputData, context);
      if (cachedId) {
        try {
          const sandbox = await getSandbox(cachedId);
          const state = (sandbox as { state?: string }).state;
          if (state === 'stopped') {
            await sandbox.start();
          }
          return buildSandboxResult(cachedId, inputData.capabilityNeeds, {
            minScore: inputData.skillMatchMinScore,
            minDelta: inputData.skillMatchMinDelta,
          });
        } catch {
          if (cacheKey) {
            sandboxByThread.delete(cacheKey);
          }
        }
      }

      const options = { ...inputData };
      const envVars: Record<string, string> | undefined = options.envs ?? undefined;
      const labels: Record<string, string> | undefined = options.metadata ?? undefined;
      const language = options.language ?? 'typescript';
      const snapshot = process.env.DAYTONA_SNAPSHOT;
      const autoStopSecondsDefault = 900;
      const autoStopSeconds = options.timeoutMS
        ? Math.ceil(options.timeoutMS / 1000)
        : autoStopSecondsDefault;
      const autoStopInterval = Math.max(0, Math.ceil(autoStopSeconds / 60));
      const createParams: CreateSandboxFromSnapshotParams = {
        snapshot,
        envVars,
        labels,
        autoStopInterval,
        language,
      };
      console.log('Creating sandbox with options:', createParams);
      console.log('DAYTONA_API_KEY set:', Boolean(process.env.DAYTONA_API_KEY));
      const sandbox = await daytona.create(createParams);
      console.log('Sandbox created:', sandbox);
      const sandboxId =
        (sandbox as { sandboxId?: string; id?: string }).sandboxId ??
        (sandbox as { id?: string }).id;

      if (!sandboxId) {
        throw new Error('Sandbox id not returned from Daytona SDK.');
      }

      rememberSandboxId(sandboxId, inputData, context);

      return buildSandboxResult(sandboxId, inputData.capabilityNeeds, {
        minScore: inputData.skillMatchMinScore,
        minDelta: inputData.skillMatchMinDelta,
      });
    } catch (e) {
      const error = e as Error & { cause?: unknown };
      console.error('createSandbox error:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        cause: error?.cause,
      });
      throw new Error(error?.message ?? 'Create sandbox failed.');
    }
  },
});
