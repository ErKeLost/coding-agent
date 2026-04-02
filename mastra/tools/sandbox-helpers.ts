import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const MAX_WEBFETCH_SIZE = 5 * 1024 * 1024;

const TEXT_BY_NAME: Record<string, string> = {
  'todoread.txt': readFileSync(new URL('./text/todoread.txt', import.meta.url), 'utf8'),
  'todowrite.txt': readFileSync(new URL('./text/todowrite.txt', import.meta.url), 'utf8'),
  'webfetch.txt': readFileSync(new URL('./text/webfetch.txt', import.meta.url), 'utf8'),
  'websearch.txt': readFileSync(new URL('./text/websearch.txt', import.meta.url), 'utf8'),
};

function findProjectTextDir() {
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(current, 'mastra/tools/text');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const PROJECT_TEXT_DIR = process.env.NODE_ENV === 'production' ? null : findProjectTextDir();

export function loadText(fileName: string) {
  const bundledText = TEXT_BY_NAME[fileName];
  if (bundledText) return bundledText;
  if (PROJECT_TEXT_DIR) {
    const sourcePath = path.join(PROJECT_TEXT_DIR, fileName);
    if (existsSync(sourcePath)) return readFileSync(sourcePath, 'utf8');
  }
  throw new Error(`Missing tool description file: ${fileName}`);
}

export const HowOneResultSchema = z.object({
  title: z.string(),
  output: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  attachments: z.array(z.any()).optional(),
});

export const TodoItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

export type TodoItem = z.infer<typeof TodoItemSchema>;

const todoStore = new Map<string, TodoItem[]>();

type SessionScopeContext = {
  agent?: {
    threadId?: string;
    resourceId?: string;
    requestContext?: { get?: (key: string) => unknown };
  };
  requestContext?: { get?: (key: string) => unknown };
  runtimeContext?: { get?: (key: string) => unknown };
  context?: {
    requestContext?: { get?: (key: string) => unknown };
  };
  threadId?: string;
  resourceId?: string;
};

function readContextString(context: SessionScopeContext | undefined, key: string) {
  const candidates = [
    context?.requestContext,
    context?.runtimeContext,
    context?.context?.requestContext,
    context?.agent?.requestContext,
  ];

  for (const candidate of candidates) {
    const value = candidate?.get?.(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function resolveLocalSessionScope(context?: SessionScopeContext) {
  return (
    readContextString(context, 'threadId') ??
    context?.agent?.threadId ??
    context?.threadId ??
    readContextString(context, 'workspaceRoot') ??
    readContextString(context, 'resourceId') ??
    context?.agent?.resourceId ??
    context?.resourceId ??
    'default'
  );
}

export function readTodos(scopeId: string, sessionId: string) {
  const key = `${scopeId}:${sessionId}`;
  return todoStore.get(key) ?? [];
}

export function writeTodos(scopeId: string, sessionId: string, todos: TodoItem[]) {
  const key = `${scopeId}:${sessionId}`;
  todoStore.set(
    key,
    todos.map(item => ({ ...item })),
  );
}
