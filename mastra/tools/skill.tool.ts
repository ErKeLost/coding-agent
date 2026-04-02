import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  DEFAULT_SKILLS_DIR,
  HowOneResultSchema,
  getSandboxIdOrThrow,
  formatSkillList,
  loadSkills,
  parseFrontmatter,
  readSandboxTextFile,
} from './sandbox-helpers';

export const skillTool = createTool({
  id: 'skill',
  description:
    'Load a skill from the sandbox skills directory. If no name is provided, returns an <available_skills> list to pick from. If auto-matched skill names are available, call this tool once per name to load each skill before proceeding.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    name: z.string().min(1).optional(),
    skillsDir: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const normalizedName = inputData.name?.trim();
    const wantsList = !normalizedName || normalizedName.toLowerCase() === 'list';
    const normalizedSkillsDir = inputData.skillsDir?.trim();
    const baseDir = path.posix.resolve(
      normalizedSkillsDir && normalizedSkillsDir.length > 0
        ? normalizedSkillsDir
        : DEFAULT_SKILLS_DIR
    );
    const skills = await loadSkills(sandboxId, baseDir);

    if (wantsList) {
      return {
        title: 'Available skills',
        output: formatSkillList(skills),
        metadata: { dir: baseDir, count: skills.length },
      };
    }

    const found = skills.find(s => s.name === normalizedName);
    if (!found) {
      const available = skills.map(s => s.name).join(', ');
      throw new Error(`Skill "${normalizedName}" not found. Available: ${available || 'none'}`);
    }

    const raw = await readSandboxTextFile(sandboxId, found.filePath);
    const parsed = parseFrontmatter(raw);
    const dir = path.posix.dirname(found.filePath);

    const output = [
      `## Skill: ${found.name}`,
      '',
      `**Base directory**: ${dir}`,
      '',
      parsed.body.trim(),
    ].join('\n');
    return {
      title: `Loaded skill: ${normalizedName}`,
      output,
      metadata: { name: found.name, dir },
    };
  },
});
