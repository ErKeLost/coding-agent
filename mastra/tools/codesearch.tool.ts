import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';

const CODESEARCH_DESCRIPTION = loadText('codesearch.txt');

export const codeSearchTool = createTool({
  id: 'codesearch',
  description: CODESEARCH_DESCRIPTION,
  inputSchema: z.object({
    query: z.string().min(1),
    tokensNum: z.number().min(1000).max(50000).default(5000),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const url = process.env.EXA_MCP_URL ?? 'https://mcp.exa.ai/mcp';
    const apiKey = process.env.EXA_API_KEY ?? '';
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_code_context_exa',
        arguments: {
          query: inputData.query,
          tokensNum: inputData.tokensNum ?? 5000,
        },
      },
    };
    const headers: Record<string, string> = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    };
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let responseText = '';
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Code search error (${response.status}): ${errorText}`);
      }

      responseText = await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Code search request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    let output = '';
    const lines = responseText.split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6)) as { result?: { content?: Array<{ text?: string }> } };
      const content = data.result?.content ?? [];
      if (content.length > 0 && content[0]?.text) {
        output = content[0].text;
        break;
      }
    }

    if (!output) {
      output =
        'No code snippets or documentation found. Try a more specific query or check spelling of framework names.';
    }
    return {
      title: `Code search: ${inputData.query}`,
      output,
      metadata: { source: 'exa' },
    };
  },
});
