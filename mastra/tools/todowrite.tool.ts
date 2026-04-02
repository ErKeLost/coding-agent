import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  HowOneResultSchema,
  TodoItemSchema,
  loadText,
  resolveLocalSessionScope,
  writeTodos,
} from './sandbox-helpers';

const TODOWRITE_DESCRIPTION = loadText('todowrite.txt');

export const todoWriteTool = createTool({
  id: 'todowrite',
  description: TODOWRITE_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    sessionId: z.string().default('default'),
    todos: z.array(TodoItemSchema),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const scopeId = inputData.sandboxId ?? resolveLocalSessionScope(context) ?? 'default';
    const sessionId = inputData.sessionId ?? 'default';
    writeTodos(scopeId, sessionId, inputData.todos);
    const remaining = inputData.todos.filter(item => item.status !== 'completed').length;
    const output = JSON.stringify(inputData.todos, null, 2);
    return {
      title: `${remaining} todos`,
      output,
      metadata: { todos: inputData.todos, remaining },
    };
  },
});
