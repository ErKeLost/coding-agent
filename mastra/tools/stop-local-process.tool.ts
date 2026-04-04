import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { stopManagedProcess } from './local-process-manager';

export const stopLocalProcessTool = createTool({
  id: 'stopLocalProcess',
  description:
    'Stop a local long-running process started by the agent, such as a dev server.',
  inputSchema: z.object({
    processId: z.string().describe('Process id returned by startLocalDevServer or listLocalProcesses'),
    force: z.boolean().default(false).describe('Use SIGKILL instead of SIGTERM'),
  }),
  outputSchema: z.object({
    processId: z.string(),
    stopped: z.boolean(),
    status: z.enum(['running', 'stopped', 'failed']),
  }),
  execute: async inputData => {
    return stopManagedProcess(inputData.processId, inputData.force);
  },
});
