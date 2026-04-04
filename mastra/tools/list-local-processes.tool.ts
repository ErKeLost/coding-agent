import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { listManagedProcesses } from './local-process-manager';

export const listLocalProcessesTool = createTool({
  id: 'listLocalProcesses',
  description:
    'List local long-running processes started by the agent, such as dev servers.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    processes: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(['dev-server', 'command', 'shell', 'unified-exec']),
        command: z.string(),
        workingDirectory: z.string(),
        host: z.string().optional(),
        port: z.number().optional(),
        url: z.string().optional(),
        pid: z.number().optional(),
        exitCode: z.number().optional(),
        logPath: z.string().optional(),
        status: z.enum(['running', 'stopped', 'failed']),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    ),
  }),
  execute: async () => {
    const processes = listManagedProcesses();
    return { processes };
  },
});
