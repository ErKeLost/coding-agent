import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandbox } from './daytona-client';
import { rememberSandboxId, resolveSandboxIdFromInputOrContext } from './create-sandbox.tool';

export const startSandbox = createTool({
  id: 'startSandbox',
  description: 'Start an existing Daytona sandbox. If sandboxId is omitted, reuse the current thread or request sandbox when available.',
  inputSchema: z.object({
    sandboxId: z.string().min(1).optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    timeoutSeconds: z.number().optional(),
  }),
  outputSchema: z.object({
    sandboxId: z.string(),
    status: z.string(),
  }),
  execute: async (inputData, context) => {
    const sandboxId = resolveSandboxIdFromInputOrContext(inputData, context);
    if (!sandboxId) {
      throw new Error('No sandbox available to start. Provide sandboxId or create a sandbox first.');
    }

    const sandbox = await getSandbox(sandboxId);
    await sandbox.start(inputData.timeoutSeconds ?? 60);
    await sandbox.refreshData();
    const status = (sandbox as { state?: string }).state ?? 'unknown';
    rememberSandboxId(sandboxId, inputData, context);
    return { sandboxId, status };
  },
});
