import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { discoverSkills, loadSkillContent } from '../skills';
import { HowOneResultSchema } from './sandbox-helpers';
import { getRequestContextFromToolContext, getWorkspaceFromToolContext } from './local-tool-runtime';

function formatSkillList(
  skills: Array<{ name: string; description?: string; filePath: string; scope: string }>,
  enabledIds: string[],
) {
  if (skills.length === 0) {
    return 'No skills found.';
  }

  return skills
    .map(skill =>
      skill.description
        ? `- ${skill.name}${enabledIds.includes((skill as { id?: string }).id ?? '') ? ' [enabled]' : ''}: ${skill.description} (scope: ${skill.scope}, file: ${skill.filePath})`
        : `- ${skill.name}${enabledIds.includes((skill as { id?: string }).id ?? '') ? ' [enabled]' : ''} (scope: ${skill.scope}, file: ${skill.filePath})`,
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
    const requestContext = getRequestContextFromToolContext(context, 'skill');
    const normalizedName = inputData.name?.trim();
    const wantsList = !normalizedName || normalizedName.toLowerCase() === 'list';
    const enabledSkillIds = (() => {
      const value = requestContext.get('enabledSkillIds');
      if (typeof value !== 'string' || !value.trim()) return [] as string[];
      try {
        const parsed = JSON.parse(value) as unknown;
        return Array.isArray(parsed)
          ? parsed.filter((entry): entry is string => typeof entry === 'string')
          : [];
      } catch {
        return [] as string[];
      }
    })();
    const discovery = await discoverSkills({
      workspaceRoot,
      skillsDir: inputData.skillsDir?.trim(),
    });
    const skills = discovery.skills;

    if (wantsList) {
      return {
        title: 'Available skills',
        output: formatSkillList(skills, enabledSkillIds),
        metadata: {
          directories: discovery.roots.map(root => root.path),
          count: skills.length,
          errors: discovery.errors,
          enabledSkillIds,
        },
      };
    }

    const loaded = await loadSkillContent({
      workspaceRoot,
      skillsDir: inputData.skillsDir?.trim(),
      name: normalizedName,
    });

    if (!loaded.skill || !loaded.body) {
      const available = skills.map(s => s.name).join(', ');
      throw new Error(`Skill "${normalizedName}" not found. Available: ${available || 'none'}`);
    }

    const output = [
      `<skill_content name="${loaded.skill.name}">`,
      `# Skill: ${loaded.skill.name}`,
      '',
      loaded.body.trim(),
      '',
      `Base directory for this skill: ${loaded.skill.dir}`,
      'Relative paths in this skill are resolved from this base directory.',
      '</skill_content>',
      '',
    ].join('\n');
    return {
      title: `Loaded skill: ${normalizedName}`,
      output,
      metadata: {
        name: loaded.skill.name,
        dir: loaded.skill.dir,
        filePath: loaded.skill.filePath,
        scope: loaded.skill.scope,
      },
    };
  },
});
