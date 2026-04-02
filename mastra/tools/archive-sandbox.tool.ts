import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandbox } from './daytona-client';

export const archiveSandbox = createTool({
  id: 'archiveSandbox',
  description: 'Archive a stopped Daytona sandbox by id.',
  inputSchema: z.object({
    sandboxId: z.string().min(1),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    status: z.string(),
  }),
  execute: async (inputData) => {
    const sandbox = await getSandbox(inputData.sandboxId);
    await sandbox.archive();
    await sandbox.refreshData();
    const status = (sandbox as { state?: string }).state ?? 'unknown';
    return { sandboxId: inputData.sandboxId, status };
  },
});
