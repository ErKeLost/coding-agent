import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listManagedProcesses } from './local-process-manager';
import { HowOneResultSchema, loadText } from './sandbox-helpers';

const DESCRIPTION = loadText('list-local-processes.txt');

export const listLocalProcessesTool = createTool({
  id: 'listLocalProcesses',
  description: DESCRIPTION,
  inputSchema: z.object({
    status: z.enum(['running', 'stopped', 'failed', 'all']).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const processes = listManagedProcesses();
    const filtered =
      !inputData.status || inputData.status === 'all'
        ? processes
        : processes.filter((entry) => entry.status === inputData.status);

    return {
      title: `${filtered.length} local processes`,
      output:
        filtered.length > 0
          ? JSON.stringify(filtered, null, 2)
          : '[]',
      metadata: {
        count: filtered.length,
        status: inputData.status ?? 'all',
        processes: filtered,
      },
    };
  },
});
