import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  MAX_WEBFETCH_SIZE,
  HowOneResultSchema,
  loadText,
} from './sandbox-helpers';

const WEBFETCH_DESCRIPTION = loadText('webfetch.txt');

export const webFetchTool = createTool({
  id: 'webfetch',
  description: WEBFETCH_DESCRIPTION,
  inputSchema: z.object({
    url: z.string().min(1),
    format: z.enum(['text', 'markdown', 'html']).default('markdown'),
    timeout: z.number().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    if (!inputData.url.startsWith('http://') && !inputData.url.startsWith('https://')) {
      throw new Error('URL must start with http:// or https://');
    }

    let acceptHeader = '*/*';
    switch (inputData.format) {
      case 'markdown':
        acceptHeader = 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1';
        break;
      case 'text':
        acceptHeader = 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1';
        break;
      case 'html':
        acceptHeader = 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1';
        break;
      default:
        acceptHeader =
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
    }

    const timeoutSec = Math.min(inputData.timeout ?? 30, 120);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSec * 1000);

    const response = await fetch(inputData.url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: acceptHeader,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Request failed with status code: ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_WEBFETCH_SIZE) {
      throw new Error('Response too large (exceeds 5MB limit)');
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_WEBFETCH_SIZE) {
      throw new Error('Response too large (exceeds 5MB limit)');
    }

    const contentType = response.headers.get('content-type') ?? '';
    const text = new TextDecoder('utf-8', { fatal: false }).decode(arrayBuffer);

    const stripHtml = (html: string) =>
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let output = text;
    if ((inputData.format === 'text' || inputData.format === 'markdown') && contentType.includes('text/html')) {
      output = stripHtml(text);
    }

    const payload = { content: output, contentType };

    return {
      title: `${inputData.url} (${payload.contentType || 'unknown'})`,
      output: payload.content,
      metadata: {},
    };
  },
});
