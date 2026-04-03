import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema } from './sandbox-helpers';
import { getWorkspaceFromToolContext } from './local-tool-runtime';

const DEFAULT_SKILL_DIR_NAMES = [
  '.codex/skills',
  '.agents/skills',
  '.mastra/skills',
  '.howone',
];

type SkillEntry = {
  name: string;
  description?: string;
  filePath: string;
  dir: string;
};

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map(candidate => path.resolve(candidate)))];
}

function parseFrontmatter(raw: string) {
  if (!raw.startsWith('---\n')) {
    return { body: raw.trim(), metadata: {} as Record<string, string> };
  }

  const closingIndex = raw.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    return { body: raw.trim(), metadata: {} as Record<string, string> };
  }

  const frontmatter = raw.slice(4, closingIndex);
  const body = raw.slice(closingIndex + 5).trim();
  const metadata: Record<string, string> = {};

  for (const line of frontmatter.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) {
      metadata[key] = value;
    }
  }

  return { body, metadata };
}

async function collectSkillFiles(baseDir: string, results: SkillEntry[]) {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      await collectSkillFiles(absolutePath, results);
      continue;
    }

    if (!entry.isFile() || entry.name !== 'SKILL.md') {
      continue;
    }

    const raw = await fs.readFile(absolutePath, 'utf8');
    const parsed = parseFrontmatter(raw);
    const skillDir = path.dirname(absolutePath);
    results.push({
      name: parsed.metadata.name?.trim() || path.basename(skillDir),
      description: parsed.metadata.description?.trim() || undefined,
      filePath: absolutePath,
      dir: skillDir,
    });
  }
}

async function loadSkillsFromDirectories(directories: string[]) {
  const results: SkillEntry[] = [];
  for (const directory of uniquePaths(directories)) {
    await collectSkillFiles(directory, results);
  }
  return results.sort((left, right) => left.name.localeCompare(right.name));
}

function formatSkillList(skills: SkillEntry[]) {
  if (skills.length === 0) {
    return 'No skills found.';
  }

  return skills
    .map(skill =>
      skill.description
        ? `- ${skill.name}: ${skill.description}`
        : `- ${skill.name}`,
    )
    .join('\n');
}

export const skillTool = createTool({
  id: 'skill',
  description:
    'Load a skill from the local skill directories. If no name is provided, returns a list of available skills to pick from.',
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    skillsDir: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'skill');
    const normalizedName = inputData.name?.trim();
    const wantsList = !normalizedName || normalizedName.toLowerCase() === 'list';
    const configuredDir = inputData.skillsDir?.trim();
    const homeDir = process.env.HOME;
    const baseDirectories = configuredDir
      ? [path.isAbsolute(configuredDir) ? configuredDir : path.resolve(workspaceRoot, configuredDir)]
      : DEFAULT_SKILL_DIR_NAMES.map(dir => path.resolve(homeDir ?? workspaceRoot, dir));

    const workspaceDirectories = DEFAULT_SKILL_DIR_NAMES.map(dir =>
      path.resolve(workspaceRoot, dir),
    );
    const skills = await loadSkillsFromDirectories([...baseDirectories, ...workspaceDirectories]);

    if (wantsList) {
      return {
        title: 'Available skills',
        output: formatSkillList(skills),
        metadata: { directories: uniquePaths([...baseDirectories, ...workspaceDirectories]), count: skills.length },
      };
    }

    const found = skills.find(s => s.name.toLowerCase() === normalizedName.toLowerCase());
    if (!found) {
      const available = skills.map(s => s.name).join(', ');
      throw new Error(`Skill "${normalizedName}" not found. Available: ${available || 'none'}`);
    }

    const raw = await fs.readFile(found.filePath, 'utf8');
    const parsed = parseFrontmatter(raw);

    const output = [
      `## Skill: ${found.name}`,
      '',
      `**Base directory**: ${found.dir}`,
      '',
      parsed.body.trim(),
    ].join('\n');
    return {
      title: `Loaded skill: ${normalizedName}`,
      output,
      metadata: { name: found.name, dir: found.dir, filePath: found.filePath },
    };
  },
});
