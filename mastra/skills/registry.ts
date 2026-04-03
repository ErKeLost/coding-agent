import path from 'node:path';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { SkillDiscoveryResult, SkillLoadError, SkillMetadata, SkillRoot, SkillScope } from './types';

const SKILL_FILE_NAME = 'SKILL.md';
const SKILL_PATH_PREFIX = 'skill://';
const RELATIVE_SKILL_DIRS = ['.agents/skills', '.codex/skills', '.mastra/skills'];
const SKILLS_INSTRUCTIONS_OPEN_TAG = '<skills_instructions>';
const SKILLS_INSTRUCTIONS_CLOSE_TAG = '</skills_instructions>';
const MENTIONED_SKILLS_OPEN_TAG = '<mentioned_skills>';
const MENTIONED_SKILLS_CLOSE_TAG = '</mentioned_skills>';

type ParsedFrontmatter = {
  body: string;
  metadata: Record<string, string>;
};

type DiscoverSkillOptions = {
  workspaceRoot: string;
  skillsDir?: string;
};

type SkillTextMentions = {
  plainNames: Set<string>;
  paths: Set<string>;
};

export type MentionedSkillContent = {
  skill: SkillMetadata;
  body: string;
};

function sanitizeSingleLine(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizePath(value: string) {
  return path.resolve(value);
}

function normalizeSkillName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeSkillPathMention(value: string) {
  const trimmed = value.trim();
  const withoutPrefix = trimmed.startsWith(SKILL_PATH_PREFIX)
    ? trimmed.slice(SKILL_PATH_PREFIX.length)
    : trimmed;
  return normalizePath(withoutPrefix);
}

function dedupeRoots(roots: SkillRoot[]) {
  const seen = new Set<string>();
  return roots.filter(root => {
    const normalized = normalizePath(root.path);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function cleanFrontmatterValue(raw: string) {
  return raw.trim().replace(/^['"]|['"]$/g, '');
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith('---\n')) {
    throw new Error('missing YAML frontmatter delimited by ---');
  }

  const closingIndex = raw.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    throw new Error('missing YAML frontmatter delimited by ---');
  }

  const frontmatter = raw.slice(4, closingIndex);
  const body = raw.slice(closingIndex + 5).trim();
  const metadata: Record<string, string> = {};
  let activeSection: string | null = null;

  for (const line of frontmatter.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = cleanFrontmatterValue(trimmed.slice(separatorIndex + 1));
    if (!key) continue;

    if (indent === 0) {
      activeSection = value ? null : key;
      if (value) metadata[key] = value;
      continue;
    }

    if (activeSection && value) {
      metadata[`${activeSection}.${key}`] = value;
    }
  }

  return { body, metadata };
}

function extractSkillMentions(text: string): SkillTextMentions {
  const plainNames = new Set<string>();
  const paths = new Set<string>();
  const linkedMentionPattern = /\[\$([A-Za-z0-9_-]+)\]\s*\(([^)]+)\)/g;
  const plainMentionPattern = /(^|[^A-Za-z0-9_])\$([A-Za-z0-9_-]+)/g;

  for (const match of text.matchAll(linkedMentionPattern)) {
    const name = match[1]?.trim();
    const rawPath = match[2]?.trim();
    if (name) {
      plainNames.add(normalizeSkillName(name));
    }
    if (rawPath) {
      paths.add(normalizeSkillPathMention(rawPath));
    }
  }

  for (const match of text.matchAll(plainMentionPattern)) {
    const name = match[2]?.trim();
    if (name) {
      plainNames.add(normalizeSkillName(name));
    }
  }

  return {
    plainNames,
    paths,
  };
}

function resolveSkillName(filePath: string, metadata: Record<string, string>) {
  const fromMetadata = metadata.name ? sanitizeSingleLine(metadata.name) : '';
  if (fromMetadata) return fromMetadata;
  return sanitizeSingleLine(path.basename(path.dirname(filePath)));
}

function resolveSkillId(root: SkillRoot, filePath: string) {
  const relativePath = path.relative(root.path, filePath).replace(/\\/g, '/');
  return `${root.scope}:${relativePath}`;
}

async function collectSkillFiles(baseDir: string, results: string[]) {
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolutePath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      await collectSkillFiles(absolutePath, results);
      continue;
    }

    if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
      results.push(absolutePath);
    }
  }
}

async function loadSkillFile(filePath: string, root: SkillRoot): Promise<SkillMetadata> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = parseFrontmatter(raw);
  const description = parsed.metadata.description
    ? sanitizeSingleLine(parsed.metadata.description)
    : '';

  if (!description) {
    throw new Error('missing field `description`');
  }

  return {
    id: resolveSkillId(root, filePath),
    name: resolveSkillName(filePath, parsed.metadata),
    description,
    shortDescription: parsed.metadata['metadata.short-description']
      ? sanitizeSingleLine(parsed.metadata['metadata.short-description'])
      : undefined,
    filePath,
    dir: path.dirname(filePath),
    scope: root.scope,
    relativePath: path.relative(root.path, filePath).replace(/\\/g, '/'),
    userInvocable: parsed.metadata['user-invocable'] === 'true',
    argumentHint: parsed.metadata['argument-hint']
      ? sanitizeSingleLine(parsed.metadata['argument-hint'])
      : undefined,
  };
}

function sortSkills(skills: SkillMetadata[]) {
  const scopeRank = (scope: SkillScope) => (scope === 'workspace' ? 0 : 1);
  return [...skills].sort((left, right) => {
    return (
      scopeRank(left.scope) - scopeRank(right.scope) ||
      left.name.localeCompare(right.name) ||
      left.filePath.localeCompare(right.filePath)
    );
  });
}

function dedupeSkills(skills: SkillMetadata[]) {
  const seen = new Set<string>();
  return skills.filter(skill => {
    const key = `${skill.name.toLowerCase()}::${skill.scope}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveWorkspaceSkillDirectories(workspaceRoot: string) {
  const normalizedRoot = normalizePath(workspaceRoot);
  return RELATIVE_SKILL_DIRS
    .map(relativePath => path.join(normalizedRoot, relativePath))
    .filter(candidate => existsSync(candidate));
}

export function resolveUserSkillDirectories(homeDir = process.env.HOME) {
  if (!homeDir) return [] as string[];
  const normalizedHome = normalizePath(homeDir);
  return RELATIVE_SKILL_DIRS
    .map(relativePath => path.join(normalizedHome, relativePath))
    .filter(candidate => existsSync(candidate));
}

export function resolveSkillRoots(options: DiscoverSkillOptions): SkillRoot[] {
  if (options.skillsDir?.trim()) {
    return [
      {
        path: normalizePath(
          path.isAbsolute(options.skillsDir) ? options.skillsDir : path.join(options.workspaceRoot, options.skillsDir),
        ),
        scope: 'workspace',
      },
    ];
  }

  return dedupeRoots([
    ...resolveWorkspaceSkillDirectories(options.workspaceRoot).map(pathValue => ({
      path: pathValue,
      scope: 'workspace' as const,
    })),
    ...resolveUserSkillDirectories().map(pathValue => ({
      path: pathValue,
      scope: 'user' as const,
    })),
  ]);
}

export async function discoverSkills(options: DiscoverSkillOptions): Promise<SkillDiscoveryResult> {
  const roots = resolveSkillRoots(options);
  const skills: SkillMetadata[] = [];
  const errors: SkillLoadError[] = [];

  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    const files: string[] = [];
    await collectSkillFiles(root.path, files);

    for (const filePath of files) {
      try {
        skills.push(await loadSkillFile(filePath, root));
      } catch (error) {
        errors.push({
          path: filePath,
          message: error instanceof Error ? error.message : 'failed to load skill',
        });
      }
    }
  }

  return {
    skills: dedupeSkills(sortSkills(skills)),
    errors,
    roots,
  };
}

export async function loadSkillContent(options: DiscoverSkillOptions & { name: string }) {
  const discovery = await discoverSkills(options);
  const normalizedName = options.name.trim().toLowerCase();
  const skill = discovery.skills.find(candidate => {
    return (
      candidate.name.trim().toLowerCase() === normalizedName ||
      candidate.id.trim().toLowerCase() === normalizedName
    );
  });

  if (!skill) {
    return {
      skill: null,
      discovery,
    };
  }

  const raw = await fs.readFile(skill.filePath, 'utf8');
  const parsed = parseFrontmatter(raw);
  return {
    skill,
    body: parsed.body,
    discovery,
  };
}

export function selectSkillsByMentionText(skills: SkillMetadata[], text: string) {
  const mentions = extractSkillMentions(text);
  if (mentions.paths.size === 0 && mentions.plainNames.size === 0) {
    return [] as SkillMetadata[];
  }

  const selected: SkillMetadata[] = [];
  const seenPaths = new Set<string>();
  const nameCounts = new Map<string, number>();

  for (const skill of skills) {
    const normalizedName = normalizeSkillName(skill.name);
    nameCounts.set(normalizedName, (nameCounts.get(normalizedName) ?? 0) + 1);
  }

  for (const skill of skills) {
    const normalizedFilePath = normalizePath(skill.filePath);
    if (mentions.paths.has(normalizedFilePath) && !seenPaths.has(normalizedFilePath)) {
      selected.push(skill);
      seenPaths.add(normalizedFilePath);
    }
  }

  for (const skill of skills) {
    const normalizedFilePath = normalizePath(skill.filePath);
    const normalizedName = normalizeSkillName(skill.name);
    if (seenPaths.has(normalizedFilePath)) continue;
    if (!mentions.plainNames.has(normalizedName)) continue;
    if ((nameCounts.get(normalizedName) ?? 0) !== 1) continue;
    selected.push(skill);
    seenPaths.add(normalizedFilePath);
  }

  return selected;
}

export async function loadMentionedSkills(skills: SkillMetadata[]) {
  const loaded: MentionedSkillContent[] = [];
  const errors: SkillLoadError[] = [];

  for (const skill of skills) {
    try {
      const raw = await fs.readFile(skill.filePath, 'utf8');
      const parsed = parseFrontmatter(raw);
      loaded.push({
        skill,
        body: parsed.body,
      });
    } catch (error) {
      errors.push({
        path: skill.filePath,
        message: error instanceof Error ? error.message : 'failed to load skill body',
      });
    }
  }

  return {
    loaded,
    errors,
  };
}

export function renderSkillsInstructions(skills: SkillMetadata[]) {
  if (skills.length === 0) return undefined;

  const lines: string[] = [];
  lines.push('## Skills');
  lines.push(
    'A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills available in this session, including each skill\'s name, description, and file path.',
  );
  lines.push('### Available skills');

  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description} (file: ${skill.filePath})`);
  }

  lines.push('### How to use skills');
  lines.push(
    '- Discovery: The list above is the set of skills available in this session. Skill bodies live on disk at the listed paths.\n- Trigger rules: If the user explicitly names a skill or the task clearly matches a skill\'s description, use the `skill` tool to load that skill for the current turn.\n- Progressive disclosure: Read the skill body only after choosing it. Then load referenced `references/`, `scripts/`, or `assets/` files only when needed.\n- Resource resolution: Resolve relative paths from the skill directory first.\n- Fallback: If a skill cannot be loaded cleanly, state the issue briefly and continue with the best fallback approach.',
  );

  return `${SKILLS_INSTRUCTIONS_OPEN_TAG}\n${lines.join('\n')}\n${SKILLS_INSTRUCTIONS_CLOSE_TAG}`;
}

export function selectSkillsByIds(skills: SkillMetadata[], ids: string[]) {
  const selectedIds = new Set(ids.map(id => id.trim()).filter(Boolean));
  if (selectedIds.size === 0) return [] as SkillMetadata[];
  return skills.filter(skill => selectedIds.has(skill.id));
}

export function renderEnabledSkillsInstructions(skills: SkillMetadata[]) {
  if (skills.length === 0) return undefined;

  const lines = ['## Thread Enabled Skills'];
  lines.push(
    'These skills are explicitly enabled for the current thread. Prefer them first when the task matches their descriptions, but continue using the `skill` tool for full skill loading when needed.',
  );

  for (const skill of skills) {
    lines.push(`- ${skill.name}: ${skill.description} (file: ${skill.filePath})`);
  }

  return lines.join('\n');
}

export function renderMentionedSkillsInstructions(skills: MentionedSkillContent[]) {
  if (skills.length === 0) return undefined;

  const lines: string[] = [];
  lines.push('## Explicitly Mentioned Skills');
  lines.push(
    'The user explicitly selected these skills for this turn. Follow them as active turn-scoped instructions before falling back to general skill discovery.',
  );

  for (const { skill, body } of skills) {
    lines.push(`### ${skill.name}`);
    lines.push(`Source: ${skill.filePath}`);
    lines.push(body);
  }

  return `${MENTIONED_SKILLS_OPEN_TAG}\n${lines.join('\n\n')}\n${MENTIONED_SKILLS_CLOSE_TAG}`;
}
