import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';

const WEBSEARCH_DESCRIPTION = loadText('websearch.txt');
const API_CONFIG = {
  BASE_URL: 'https://mcp.exa.ai',
  ENDPOINTS: {
    SEARCH: '/mcp',
  },
  DEFAULT_NUM_RESULTS: 8,
} as const;

export const webSearchTool = createTool({
  id: 'websearch',
  description: WEBSEARCH_DESCRIPTION,
  inputSchema: z.object({
    query: z.string().min(1),
    numResults: z.number().optional(),
    livecrawl: z.enum(['fallback', 'preferred']).optional(),
    type: z.enum(['auto', 'fast', 'deep']).optional(),
    contextMaxCharacters: z.number().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const abortSignal = context?.abortSignal;
    const searchRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query: inputData.query,
          type: inputData.type ?? 'auto',
          numResults: inputData.numResults ?? API_CONFIG.DEFAULT_NUM_RESULTS,
          livecrawl: inputData.livecrawl ?? 'fallback',
          contextMaxCharacters: inputData.contextMaxCharacters,
        },
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const signals = [controller.signal];
    if (abortSignal) signals.push(abortSignal);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        body: JSON.stringify(searchRequest),
        signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Search error (${response.status}): ${errorText}`);
      }

      const responseText = await response.text();
      for (const line of responseText.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = JSON.parse(line.slice(6)) as {
          result?: { content?: Array<{ text?: string }> };
        };
        const content = data.result?.content ?? [];
        if (content.length > 0 && content[0]?.text) {
          return {
            title: `Web search: ${inputData.query}`,
            output: content[0].text,
            metadata: {},
          };
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Search request timed out');
      }
      throw error;
    }

    const output = 'No search results found. Please try a different query.';
    return {
      title: `Web search: ${inputData.query}`,
      output,
      metadata: {},
    };
  },
});
