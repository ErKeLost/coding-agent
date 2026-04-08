import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_INSTRUCTION_FILES = ["AGENTS.md", "README.md"] as const;
const README_CHAR_LIMIT = 6_000;
const FILE_CHAR_LIMIT = 12_000;

type LoadedInstructionFile = {
  filepath: string;
  label: string;
  content: string;
  truncated: boolean;
};

function truncateContent(content: string, maxChars: number) {
  if (content.length <= maxChars) {
    return { content, truncated: false };
  }

  return {
    content: `${content.slice(0, maxChars)}\n\n[truncated]`,
    truncated: true,
  };
}

async function tryReadInstructionFile(filepath: string) {
  try {
    const stat = await fs.stat(filepath);
    if (!stat.isFile()) return null;

    const raw = await fs.readFile(filepath, "utf8");
    const limit = path.basename(filepath).toLowerCase() === "readme.md" ? README_CHAR_LIMIT : FILE_CHAR_LIMIT;
    const { content, truncated } = truncateContent(raw.trim(), limit);
    if (!content.trim()) return null;

    return {
      filepath,
      label: path.basename(filepath),
      content,
      truncated,
    } satisfies LoadedInstructionFile;
  } catch {
    return null;
  }
}

export async function loadWorkspaceInstructionFiles(workspaceRoot: string) {
  const files = await Promise.all(
    ROOT_INSTRUCTION_FILES.map((filename) =>
      tryReadInstructionFile(path.join(workspaceRoot, filename)),
    ),
  );

  return files.filter((value): value is LoadedInstructionFile => Boolean(value));
}

export function renderWorkspaceInstructionFiles(
  files: LoadedInstructionFile[],
) {
  if (files.length === 0) return "";

  return [
    "Repository instruction files:",
    ...files.map((file) =>
      [
        `Instructions from: ${file.filepath}`,
        file.content,
        file.truncated ? "(This file was truncated before injection.)" : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}
