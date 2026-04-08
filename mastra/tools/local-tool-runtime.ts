import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { RequestContext } from '@mastra/core/request-context';
import { getWorkspaceForRequest, resolveWorkspaceRootFromRequest } from '../workspace/local-workspace';

type RequestContextLike = RequestContext | { get?: (key: string) => unknown };
type ToolRuntimeContext = unknown;

export const DEFAULT_READ_LIMIT = 2_000;
export const MIN_READ_LIMIT = 200;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const MAX_READ_LINE_LENGTH = 2_000;
export const MAX_READ_LINE_SUFFIX = `... (line truncated to ${MAX_READ_LINE_LENGTH} chars)`;
export const MAX_READ_OUTPUT_BYTES = 50 * 1024;
export const MAX_READ_OUTPUT_LABEL = `${MAX_READ_OUTPUT_BYTES / 1024} KB`;

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
  const trimmed = inputPath.trim();
  const normalizedRoot = path.resolve(workspaceRoot);
  const posixInput = trimmed.replaceAll('\\', '/');

  const toWorkspacePath = (relativeLike: string) =>
    path.resolve(normalizedRoot, normalizeWorkspacePath(relativeLike).relativePath);

  // Compatibility for legacy sandbox-style absolute paths.
  // Old tool prompts frequently use "/workspace" or "/workspace/<file>".
  let absoluteDiskPath: string;
  if (posixInput === '/workspace' || posixInput === '/workspace/') {
    absoluteDiskPath = normalizedRoot;
  } else if (posixInput.startsWith('/workspace/')) {
    const suffix = posixInput.slice('/workspace/'.length);
    absoluteDiskPath = toWorkspacePath(`/${suffix}`);
  } else if (path.isAbsolute(trimmed)) {
    absoluteDiskPath = path.resolve(trimmed);
  } else {
    absoluteDiskPath = toWorkspacePath(trimmed);
  }
  const relativeDiskPath = path.relative(normalizedRoot, absoluteDiskPath);
  if (relativeDiskPath.startsWith('..') || path.isAbsolute(relativeDiskPath)) {
    throw new Error(`Path must stay inside the workspace: ${inputPath}`);
  }
  return absoluteDiskPath;
}

export function formatLineNumberedOutput(raw: string, offset = 0, limit = DEFAULT_READ_LIMIT) {
  const lines = raw.split(/\r?\n/);
  const start = Math.max(0, offset);
  const requestedLimit = Math.max(1, limit);
  const effectiveLimit = Math.max(MIN_READ_LIMIT, requestedLimit);
  const targetEnd = Math.min(lines.length, start + effectiveLimit);
  const width = String(Math.max(targetEnd, 1)).length;
  const slice: string[] = [];
  let bytes = 0;
  let cutByByteCap = false;

  for (let index = start; index < targetEnd; index += 1) {
    const text = lines[index] ?? '';
    const line =
      text.length > MAX_READ_LINE_LENGTH
        ? `${text.slice(0, MAX_READ_LINE_LENGTH)}${MAX_READ_LINE_SUFFIX}`
        : text;
    const rendered = `${String(index + 1).padStart(width, ' ')}\t${line}`;
    const size = Buffer.byteLength(rendered, 'utf8') + (slice.length > 0 ? 1 : 0);
    if (slice.length > 0 && bytes + size > MAX_READ_OUTPUT_BYTES) {
      cutByByteCap = true;
      break;
    }

    slice.push(rendered);
    bytes += size;
  }

  const consumedLines = slice.length;
  const end = consumedLines > 0 ? start + consumedLines : Math.min(lines.length, start);
  const hasMore = end < lines.length;
  const nextOffset = hasMore ? end : null;

  const footer = cutByByteCap
    ? `(Output capped at ${MAX_READ_OUTPUT_LABEL}. Showing lines ${start + 1}-${Math.max(
        end,
        start + 1,
      )}. Continue with offset=${nextOffset ?? end}.)`
    : hasMore
      ? `(Showing lines ${start + 1}-${end} of ${lines.length}. Continue with offset=${
          nextOffset ?? end
        }.)`
      : `(End of file - total ${lines.length} lines)`;

  const output = [...slice, '', footer].join('\n');

  const preview = slice.slice(0, 20).join('\n');

  return {
    output,
    preview,
    totalLines: lines.length,
    startLine: start + 1,
    endLine: end,
    requestedLimit,
    effectiveLimit,
    hasMore,
    nextOffset,
    cutByByteCap,
    wasLimitClamped: requestedLimit < MIN_READ_LIMIT,
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
