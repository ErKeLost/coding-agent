import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { readProcessRegistry, removeMissingProcessState } from './local-process-registry';

export const listLocalProcessesTool = createTool({
  id: 'listLocalProcesses',
  description:
    'List local long-running processes started by the agent, such as dev servers.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    processes: z.array(
      z.object({
        id: z.string(),
        kind: z.literal('dev-server'),
        command: z.string(),
        workingDirectory: z.string(),
        host: z.string(),
        port: z.number(),
        url: z.string(),
        pid: z.number().optional(),
        logPath: z.string().optional(),
        status: z.enum(['running', 'stopped']),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
  execute: async () => {
    const processes = readProcessRegistry().map(removeMissingProcessState);
    return { processes };
  },
});
