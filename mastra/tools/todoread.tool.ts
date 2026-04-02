import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText, readTodos, resolveLocalSessionScope } from './sandbox-helpers';

const TODOREAD_DESCRIPTION = loadText('todoread.txt');

export const todoReadTool = createTool({
  id: 'todoread',
  description: TODOREAD_DESCRIPTION,
  inputSchema: z.object({
    scopeId: z.string().min(1).optional(),
    sessionId: z.string().default('default'),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const scopeId = inputData.scopeId ?? resolveLocalSessionScope(context) ?? 'default';
    const sessionId = inputData.sessionId ?? 'default';
    const todos = readTodos(scopeId, sessionId);
    const remaining = todos.filter(item => item.status !== 'completed').length;
    const output = JSON.stringify(todos, null, 2);
    return {
      title: `${remaining} todos`,
      output,
      metadata: { todos },
    };
  },
});
