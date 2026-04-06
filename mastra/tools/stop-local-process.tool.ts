import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { stopManagedProcess } from './local-process-manager';
import { HowOneResultSchema, loadText } from './sandbox-helpers';

const DESCRIPTION = loadText('stop-local-process.txt');

export const stopLocalProcessTool = createTool({
  id: 'stopLocalProcess',
  description: DESCRIPTION,
  inputSchema: z.object({
    processId: z.string().min(1),
    force: z.boolean().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const payload = await stopManagedProcess(
      inputData.processId,
      inputData.force ?? false,
    );

    return {
      title: `${inputData.processId} stopped`,
      output: JSON.stringify(payload, null, 2),
      metadata: payload,
    };
  },
});
