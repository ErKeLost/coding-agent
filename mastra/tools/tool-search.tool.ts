import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema } from './sandbox-helpers';
import { searchToolCatalog } from './tool-catalog';

export const toolSearchTool = createTool({
  id: 'tool_search',
  description: 'Search the available local tools by keyword, capability, or task.',
  inputSchema: z.object({
    query: z.string().min(1).describe('What tool capability to search for'),
    limit: z.number().int().positive().max(20).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async inputData => {
    const matches = searchToolCatalog(inputData.query, inputData.limit ?? 8);
    return {
      title: `Tool search: ${inputData.query}`,
      output: matches.length
        ? matches
            .map(tool => `- ${tool.name}: ${tool.description}`)
            .join('\n')
        : 'No matching tools found.',
      metadata: { query: inputData.query, matches },
    };
  },
});