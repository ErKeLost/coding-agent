import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema } from './sandbox-helpers';
import { searchToolCatalog } from './tool-catalog';

export const toolSuggestTool = createTool({
  id: 'tool_suggest',
  description: 'Suggest the best tools to use for a task description.',
  inputSchema: z.object({
    task: z.string().min(1).describe('Describe the task you want to accomplish'),
    limit: z.number().int().positive().max(10).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async inputData => {
    const suggestions = searchToolCatalog(inputData.task, inputData.limit ?? 5);
    return {
      title: `Tool suggestions`,
      output: suggestions.length
        ? suggestions
            .map((tool, index) => `${index + 1}. ${tool.name}: ${tool.description}`)
            .join('\n')
        : 'No tool suggestions found.',
      metadata: { task: inputData.task, suggestions },
    };
  },
});