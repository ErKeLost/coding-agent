import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { RequestContext } from '@mastra/core/request-context';
import { getWorkspaceForRequest, resolveWorkspaceRootFromRequest } from '../workspace/local-workspace';

type RequestContextLike = RequestContext | { get?: (key: string) => unknown };
type ToolRuntimeContext = unknown;

export const DEFAULT_READ_LIMIT = 2_000;
export const DEFAULT_TIMEOUT_MS = 120_000;

export function modelSupportsImageInput(modelId?: string) {
  const id = (modelId ?? '').toLowerCase();
  if (!id) return false;

  return (
    id.includes('gpt-4o') ||
    id.includes('gpt-4.1') ||
    id.includes('gpt-5') ||
    id.includes('claude') ||
    id.includes('gemini') ||
    id.includes('glm-5v') ||
    id.includes('glm-4.7') ||
    id.includes('glm-5')
  );
}

export function getRequestContextFromToolContext(
  context: ToolRuntimeContext | undefined,
  toolName: string,
) {
  const typedContext = context as {
    agent?: { requestContext?: RequestContextLike };
    requestContext?: RequestContextLike;
    runtimeContext?: RequestContextLike;
    context?: { requestContext?: RequestContextLike };
  };

  const requestContext =
    typedContext?.requestContext ??
    typedContext?.runtimeContext ??
    typedContext?.context?.requestContext ??
    typedContext?.agent?.requestContext;

  if (!requestContext || typeof requestContext.get !== 'function') {
    throw new Error(`Missing request context for ${toolName}.`);
  }

  return requestContext as RequestContext;
}

export function getWorkspaceFromToolContext(
  context: ToolRuntimeContext | undefined,
  toolName: string,
) {
  const requestContext = getRequestContextFromToolContext(context, toolName);
  return {
    requestContext,
    workspace: getWorkspaceForRequest(requestContext),
    workspaceRoot: resolveWorkspaceRootFromRequest(requestContext),
  };
}

export function normalizeWorkspacePath(inputPath: string) {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error('A file path is required.');
  }

  const normalized = path.posix.normalize(trimmed.replaceAll('\\', '/'));
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const relativePath = path.posix.normalize(withLeadingSlash).replace(/^\/+/, '');

  if (!relativePath || relativePath === '.' || relativePath.startsWith('..')) {
    throw new Error(`Path must stay inside the workspace: ${inputPath}`);
  }

  return {
    absolutePath: withLeadingSlash,
    relativePath,
  };
}

export function resolveWorkspaceFsPath(inputPath: string) {
  return normalizeWorkspacePath(inputPath).absolutePath;
}

export function resolveWorkspaceDiskPath(workspaceRoot: string, inputPath: string) {
  const { relativePath } = normalizeWorkspacePath(inputPath);
  const absoluteDiskPath = path.resolve(workspaceRoot, relativePath);
  const relativeDiskPath = path.relative(workspaceRoot, absoluteDiskPath);
  if (relativeDiskPath.startsWith('..') || path.isAbsolute(relativeDiskPath)) {
    throw new Error(`Path must stay inside the workspace: ${inputPath}`);
  }
  return absoluteDiskPath;
}

export function formatLineNumberedOutput(raw: string, offset = 0, limit = DEFAULT_READ_LIMIT) {
  const lines = raw.split(/\r?\n/);
  const start = Math.max(0, offset);
  const end = Math.min(lines.length, start + Math.max(1, limit));
  const slice = lines.slice(start, end);
  const width = String(Math.max(end, 1)).length;

  const output = slice
    .map((line, index) => `${String(start + index + 1).padStart(width, ' ')}\t${line}`)
    .join('\n');

  const preview = slice.slice(0, 20).join('\n');

  return {
    output,
    preview,
    totalLines: lines.length,
    startLine: start + 1,
    endLine: end,
  };
}

export function truncateOutput(raw: string, maxChars = 30_000) {
  if (raw.length <= maxChars) {
    return { text: raw, truncated: false };
  }

  return {
    text: `${raw.slice(0, maxChars)}\n\n[output truncated]`,
    truncated: true,
  };
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export function getPreviewMime(filePath: string) {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

export async function readPreviewAttachment(workspaceRoot: string, inputPath: string) {
  const mime = getPreviewMime(inputPath);
  if (!mime) {
    return null;
  }

  const diskPath = resolveWorkspaceDiskPath(workspaceRoot, inputPath);
  const bytes = await fs.readFile(diskPath);
  return {
    mime,
    data: `data:${mime};base64,${bytes.toString('base64')}`,
  };
}
