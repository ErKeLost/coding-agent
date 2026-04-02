import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow, normalizeSandboxPath } from './sandbox-helpers';

export const downloadFilesTool = createTool({
  id: 'downloadFiles',
  description: 'Download multiple files from the sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    paths: z.array(z.string().min(1)),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const sources = inputData.paths.map(path => ({ source: normalizeSandboxPath(path) }));
    const results = await sandbox.fs.downloadFiles(sources);
    const formatted = results.map(result => {
      if (result.error) {
        return { path: result.source, error: result.error };
      }
      if (typeof result.result === 'string') {
        return { path: result.source, encoding: 'utf8', content: result.result };
      }
      if (result.result instanceof Uint8Array) {
        return {
          path: result.source,
          encoding: 'base64',
          content: Buffer.from(result.result).toString('base64'),
        };
      }
      return { path: result.source, error: 'No data returned' };
    });
    return {
      title: 'Files downloaded',
      output: formatted.map(entry => entry.path).join('\n'),
      metadata: { results: formatted },
    };
  },
});
