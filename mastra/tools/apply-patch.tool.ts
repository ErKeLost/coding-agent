import path from 'node:path';
import { promises as fs } from 'node:fs';
import { applyPatch as applyUnifiedPatch, parsePatch } from 'diff';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema } from './sandbox-helpers';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';

type FreeformPatchOp =
  | { kind: 'add'; filePath: string; lines: string[] }
  | { kind: 'delete'; filePath: string }
  | {
      kind: 'update';
      filePath: string;
      moveTo?: string;
      hunks: Array<{
        header?: string;
        lines: Array<{ kind: 'context' | 'delete' | 'add'; text: string }>;
        endOfFile?: boolean;
      }>;
    };

function cleanPatchPath(value?: string) {
  if (!value || value === '/dev/null') return null;
  return value.replace(/^[ab]\//, '');
}

function summarizePatchForLog(patchText: string) {
  const lines = patchText.split('\n');
  return {
    lineCount: lines.length,
    preview: lines.slice(0, 12).join('\n'),
  };
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n/g, '\n');
}

function splitContentLines(value: string) {
  const normalized = normalizeLineEndings(value);
  const hasTrailingNewline = normalized.endsWith('\n');
  const lines = normalized.split('\n');
  if (hasTrailingNewline) {
    lines.pop();
  }
  return lines;
}

function joinContentLines(lines: string[]) {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

function isFreeformPatch(patchText: string) {
  return patchText.trimStart().startsWith('*** Begin Patch');
}

function readHeaderLine(rawLine: string) {
  return rawLine.trimStart();
}

function parseFreeformPatch(patchText: string): FreeformPatchOp[] {
  const lines = normalizeLineEndings(patchText).split('\n');
  const firstLine = readHeaderLine(lines[0] ?? '');
  if (firstLine !== '*** Begin Patch') {
    throw new Error('Invalid patch: missing "*** Begin Patch"');
  }

  const ops: FreeformPatchOp[] = [];
  let index = 1;

  const parsePathHeader = (prefix: string, line: string) => {
    const trimmed = readHeaderLine(line);
    if (!trimmed.startsWith(prefix)) return null;
    return trimmed.slice(prefix.length).trim();
  };

  while (index < lines.length) {
    const current = lines[index] ?? '';
    const trimmed = readHeaderLine(current);

    if (!trimmed) {
      index += 1;
      continue;
    }
    if (trimmed === '*** End Patch') {
      return ops;
    }

    const addFile = parsePathHeader('*** Add File: ', current);
    if (addFile) {
      index += 1;
      const addLines: string[] = [];
      while (index < lines.length) {
        const next = lines[index] ?? '';
        const nextTrimmed = readHeaderLine(next);
        if (
          nextTrimmed === '*** End Patch' ||
          nextTrimmed.startsWith('*** Add File: ') ||
          nextTrimmed.startsWith('*** Delete File: ') ||
          nextTrimmed.startsWith('*** Update File: ')
        ) {
          break;
        }
        if (!next.startsWith('+')) {
          throw new Error(`Invalid add file line ${index + 1}: "${next}"`);
        }
        addLines.push(next.slice(1));
        index += 1;
      }
      ops.push({ kind: 'add', filePath: addFile, lines: addLines });
      continue;
    }

    const deleteFile = parsePathHeader('*** Delete File: ', current);
    if (deleteFile) {
      ops.push({ kind: 'delete', filePath: deleteFile });
      index += 1;
      continue;
    }

    const updateFile = parsePathHeader('*** Update File: ', current);
    if (updateFile) {
      index += 1;
      let moveTo: string | undefined;
      const hunks: Array<{
        header?: string;
        lines: Array<{ kind: 'context' | 'delete' | 'add'; text: string }>;
        endOfFile?: boolean;
      }> = [];

      if (index < lines.length) {
        const maybeMove = parsePathHeader('*** Move to: ', lines[index] ?? '');
        if (maybeMove) {
          moveTo = maybeMove;
          index += 1;
        }
      }

      while (index < lines.length) {
        const hunkLine = lines[index] ?? '';
        const hunkTrimmed = readHeaderLine(hunkLine);
        if (
          hunkTrimmed === '*** End Patch' ||
          hunkTrimmed.startsWith('*** Add File: ') ||
          hunkTrimmed.startsWith('*** Delete File: ') ||
          hunkTrimmed.startsWith('*** Update File: ')
        ) {
          break;
        }
        if (!hunkTrimmed.startsWith('@@')) {
          throw new Error(`Invalid patch hunk on line ${index + 1}: "${hunkLine}"`);
        }
        const header = hunkTrimmed === '@@' ? undefined : hunkTrimmed.slice(2).trim();
        index += 1;

        const hunkEntries: Array<{ kind: 'context' | 'delete' | 'add'; text: string }> = [];
        let endOfFile = false;

        while (index < lines.length) {
          const next = lines[index] ?? '';
          const nextTrimmed = readHeaderLine(next);
          if (
            nextTrimmed === '*** End Patch' ||
            nextTrimmed.startsWith('*** Add File: ') ||
            nextTrimmed.startsWith('*** Delete File: ') ||
            nextTrimmed.startsWith('*** Update File: ') ||
            nextTrimmed.startsWith('@@')
          ) {
            break;
          }
          if (nextTrimmed === '*** End of File') {
            endOfFile = true;
            index += 1;
            break;
          }
          const marker = next[0];
          const text = next.slice(1);
          if (marker === ' ') {
            hunkEntries.push({ kind: 'context', text });
          } else if (marker === '-') {
            hunkEntries.push({ kind: 'delete', text });
          } else if (marker === '+') {
            hunkEntries.push({ kind: 'add', text });
          } else {
            throw new Error(`Invalid patch change line ${index + 1}: "${next}"`);
          }
          index += 1;
        }

        while (
          hunkEntries.length > 0 &&
          hunkEntries[hunkEntries.length - 1]?.kind === 'context' &&
          hunkEntries[hunkEntries.length - 1]?.text === ''
        ) {
          hunkEntries.pop();
        }

        hunks.push({ header, lines: hunkEntries, endOfFile });
      }

      if (hunks.length === 0) {
        throw new Error(`Invalid patch hunk: Update file hunk for path '${updateFile}' is empty`);
      }
      ops.push({ kind: 'update', filePath: updateFile, moveTo, hunks });
      continue;
    }

    throw new Error(
      `Invalid patch hunk on line ${index + 1}: "${current}" is not a valid hunk header.`,
    );
  }

  throw new Error('Invalid patch: missing "*** End Patch"');
}

function findSequenceIndex(
  sourceLines: string[],
  expectedLines: string[],
  startIndex: number,
) {
  if (expectedLines.length === 0) return startIndex;
  for (let index = startIndex; index <= sourceLines.length - expectedLines.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < expectedLines.length; offset += 1) {
      if (sourceLines[index + offset] !== expectedLines[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function applyFreeformUpdate(
  currentContent: string,
  op: Extract<FreeformPatchOp, { kind: 'update' }>,
) {
  const sourceLines = splitContentLines(currentContent);
  const outputLines: string[] = [];
  let cursor = 0;

  for (const hunk of op.hunks) {
    const expectedLines = hunk.lines
      .filter((line) => line.kind !== 'add')
      .map((line) => line.text);
    const replacementLines = hunk.lines
      .filter((line) => line.kind !== 'delete')
      .map((line) => line.text);

    const matchIndex =
      expectedLines.length === 0
        ? sourceLines.length
        : findSequenceIndex(sourceLines, expectedLines, cursor);
    if (matchIndex < 0) {
      const preview = expectedLines.join('\n') || '(empty hunk)';
      throw new Error(`Failed to find expected lines in ${op.filePath}:\n${preview}`);
    }

    outputLines.push(...sourceLines.slice(cursor, matchIndex));
    outputLines.push(...replacementLines);
    cursor = matchIndex + expectedLines.length;
  }

  outputLines.push(...sourceLines.slice(cursor));
  return joinContentLines(outputLines);
}

async function applyFreeformPatch(workspaceRoot: string, patchText: string) {
  const ops = parseFreeformPatch(patchText);
  const intendedFiles = ops.map((op) =>
    op.kind === 'update' && op.moveTo ? op.moveTo : op.filePath,
  );
  const changedFiles: string[] = [];

  for (const op of ops) {
    if (op.kind === 'add') {
      const diskPath = resolveWorkspaceDiskPath(workspaceRoot, op.filePath);
      await fs.mkdir(path.dirname(diskPath), { recursive: true });
      await fs.writeFile(diskPath, joinContentLines(op.lines), 'utf8');
      changedFiles.push(op.filePath);
      continue;
    }

    if (op.kind === 'delete') {
      const diskPath = resolveWorkspaceDiskPath(workspaceRoot, op.filePath);
      await fs.rm(diskPath);
      changedFiles.push(op.filePath);
      continue;
    }

    const sourceDiskPath = resolveWorkspaceDiskPath(workspaceRoot, op.filePath);
    const currentContent = await fs.readFile(sourceDiskPath, 'utf8');
    const nextContent = applyFreeformUpdate(currentContent, op);
    const destinationPath = op.moveTo ?? op.filePath;
    const destinationDiskPath = resolveWorkspaceDiskPath(workspaceRoot, destinationPath);

    await fs.mkdir(path.dirname(destinationDiskPath), { recursive: true });
    await fs.writeFile(destinationDiskPath, nextContent, 'utf8');
    if (op.moveTo && destinationDiskPath !== sourceDiskPath) {
      await fs.rm(sourceDiskPath, { force: true });
    }
    changedFiles.push(destinationPath);
  }

  return { intendedFiles, changedFiles };
}

async function applyUnifiedDiffPatch(workspaceRoot: string, patchText: string) {
  const patches = parsePatch(patchText);
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

  return { intendedFiles, changedFiles };
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
    const patchSummary = summarizePatchForLog(inputData.patch);
    const startedAt = Date.now();
    console.info('[apply-patch-debug] execute:start', {
      workspaceRoot,
      patchLineCount: patchSummary.lineCount,
      patchPreview: patchSummary.preview,
      patchFormat: isFreeformPatch(inputData.patch) ? 'freeform' : 'unified',
    });

    try {
      const { intendedFiles, changedFiles } = isFreeformPatch(inputData.patch)
        ? await applyFreeformPatch(workspaceRoot, inputData.patch)
        : await applyUnifiedDiffPatch(workspaceRoot, inputData.patch);

      console.info('[apply-patch-debug] execute:parsed', {
        workspaceRoot,
        intendedFiles,
      });

      if (changedFiles.length === 0) {
        const intendedSummary =
          intendedFiles.length > 0 ? ` Intended files: ${intendedFiles.join(', ')}` : '';
        console.error('[apply-patch-debug] execute:no-changes', {
          workspaceRoot,
          intendedFiles,
        });
        throw new Error(`Patch parsed but no file changes were applied.${intendedSummary}`);
      }

      const result = {
        title: 'apply_patch',
        output: changedFiles.map((file) => `Patched ${file}`).join('\n'),
        metadata: {
          files: changedFiles,
          count: changedFiles.length,
        },
      };
      console.info('[apply-patch-debug] execute:success', {
        workspaceRoot,
        changedFiles,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      console.error('[apply-patch-debug] execute:error', {
        workspaceRoot,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
