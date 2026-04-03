import path from 'node:path';
import { NextResponse } from 'next/server';
import { discoverSkills, loadSkillContent } from '@/mastra/skills';

export const runtime = 'nodejs';

function resolveWorkspaceRoot(value: string | null) {
  return value?.trim() ? path.resolve(value) : process.cwd();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const workspaceRoot = resolveWorkspaceRoot(searchParams.get('workspaceRoot'));
  const skillsDir = searchParams.get('skillsDir')?.trim() || undefined;
  const name = searchParams.get('name')?.trim();

  try {
    if (name) {
      const loaded = await loadSkillContent({
        workspaceRoot,
        skillsDir,
        name,
      });

      if (!loaded.skill || !loaded.body) {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
      }

      return NextResponse.json({
        skill: loaded.skill,
        body: loaded.body,
        roots: loaded.discovery.roots,
        errors: loaded.discovery.errors,
      });
    }

    const discovery = await discoverSkills({
      workspaceRoot,
      skillsDir,
    });
    return NextResponse.json(discovery);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load skills';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}