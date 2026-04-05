import path from 'node:path';
import { promises as fs } from 'node:fs';
import { applyPatch as applyUnifiedPatch, parsePatch } from 'diff';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema } from './sandbox-helpers';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';

function cleanPatchPath(value?: string) {
  if (!value || value === '/dev/null') return null;
  return value.replace(/^[ab]\//, '');
}

export const applyPatchTool = createTool({
  id: 'apply_patch',
  description: 'Apply a unified diff patch to local workspace files.',
  inputSchema: z.object({
    patch: z.string().min(1).describe('Unified diff patch text'),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'apply_patch');
    const patches = parsePatch(inputData.patch);
    if (patches.length === 0) {
      throw new Error('No patch hunks were found.');
    }

    const intendedFiles = Array.from(
      new Set(
        patches
          .map((patch) => cleanPatchPath(patch.newFileName) ?? cleanPatchPath(patch.oldFileName))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const changedFiles: string[] = [];

    for (const patch of patches) {
      const nextFile = cleanPatchPath(patch.newFileName);
      const previousFile = cleanPatchPath(patch.oldFileName);
      const targetFile = nextFile ?? previousFile;
      if (!targetFile) continue;

      const diskPath = resolveWorkspaceDiskPath(workspaceRoot, targetFile);
      const deletingFile = patch.newFileName === '/dev/null';
      const creatingFile = patch.oldFileName === '/dev/null';
      const currentContent = creatingFile
        ? ''
        : await fs.readFile(diskPath, 'utf8').catch(() => '');

      if (deletingFile) {
        await fs.rm(diskPath, { force: true });
        changedFiles.push(targetFile);
        continue;
      }

      const nextContent = applyUnifiedPatch(currentContent, patch);
      if (nextContent === false) {
        throw new Error(`Failed to apply patch for ${targetFile}`);
      }

      await fs.mkdir(path.dirname(diskPath), { recursive: true });
      await fs.writeFile(diskPath, nextContent, 'utf8');
      changedFiles.push(targetFile);
    }

    if (changedFiles.length === 0) {
      const intendedSummary =
        intendedFiles.length > 0 ? ` Intended files: ${intendedFiles.join(', ')}` : '';
      throw new Error(`Patch parsed but no file changes were applied.${intendedSummary}`);
    }

    return {
      title: 'apply_patch',
      output: changedFiles.map(file => `Patched ${file}`).join('\n'),
      metadata: {
        files: changedFiles,
        count: changedFiles.length,
      },
    };
  },
});
