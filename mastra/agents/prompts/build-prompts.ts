import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPT_BY_NAME: Record<string, string> = {
  'build-anthropic.txt': readFileSync(new URL('./build-anthropic.txt', import.meta.url), 'utf8'),
  'build-base.txt': readFileSync(new URL('./build-base.txt', import.meta.url), 'utf8'),
  'build-codex.txt': readFileSync(new URL('./build-codex.txt', import.meta.url), 'utf8'),
  'build-environment.txt': readFileSync(new URL('./build-environment.txt', import.meta.url), 'utf8'),
  'build-gemini.txt': readFileSync(new URL('./build-gemini.txt', import.meta.url), 'utf8'),
  'build-intent-gate.txt': readFileSync(new URL('./build-intent-gate.txt', import.meta.url), 'utf8'),
  'build-skill-autoload.txt': readFileSync(new URL('./build-skill-autoload.txt', import.meta.url), 'utf8'),
  'build-skill-judge.txt': readFileSync(new URL('./build-skill-judge.txt', import.meta.url), 'utf8'),
};

function findProjectPromptsDir() {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(current, 'mastra/agents/prompts');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const PROJECT_PROMPTS_DIR =
  process.env.NODE_ENV === 'production' ? null : findProjectPromptsDir();

function loadPrompt(filename: string): string {
  if (PROJECT_PROMPTS_DIR) {
    const sourcePath = join(PROJECT_PROMPTS_DIR, filename);
    if (existsSync(sourcePath)) return readFileSync(sourcePath, 'utf8');
  }

  const bundledPrompt = PROMPT_BY_NAME[filename];
  if (bundledPrompt) return bundledPrompt;

  throw new Error(`Missing build prompt file: ${filename}`);
}

export const BUILD_PROMPT_CODEX = loadPrompt('build-codex.txt');
export const BUILD_PROMPT_ANTHROPIC = loadPrompt('build-anthropic.txt');
export const BUILD_PROMPT_GEMINI = loadPrompt('build-gemini.txt');
export const BUILD_PROMPT_BASE = loadPrompt('build-base.txt');
export const BUILD_PROMPT_ENV = loadPrompt('build-environment.txt');
export const BUILD_PROMPT_SKILL_AUTOLOAD = loadPrompt('build-skill-autoload.txt');
export const BUILD_PROMPT_SKILL_JUDGE = loadPrompt('build-skill-judge.txt');
export const BUILD_PROMPT_INTENT_GATE = loadPrompt('build-intent-gate.txt');

export function selectBuildInstructions(model: string | undefined): string {
  const normalized = (model ?? '').toLowerCase();
  const modelPrompt = normalized.includes('gemini')
    ? BUILD_PROMPT_GEMINI
    : normalized.includes('claude') || normalized.includes('anthropic')
      ? BUILD_PROMPT_ANTHROPIC
      : BUILD_PROMPT_CODEX;

  return `${BUILD_PROMPT_BASE}\n\n${modelPrompt}\n\n${BUILD_PROMPT_ENV}`;
}
