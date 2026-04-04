import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { readManagedProcessLogs } from './local-process-manager';

export const readLocalProcessLogsTool = createTool({
  id: 'readLocalProcessLogs',
  description:
    'Read recent logs for a local long-running process started by the agent.',
  inputSchema: z.object({
    processId: z.string().describe('Process id returned by startLocalDevServer or listLocalProcesses'),
    lines: z.number().int().positive().max(400).default(80).describe('How many trailing log lines to read'),
    waitForMs: z.number().int().min(0).max(60_000).default(0).describe('Optionally wait for new output before reading'),
  }),
  outputSchema: z.object({
    processId: z.string(),
    status: z.enum(['running', 'stopped', 'failed']),
    logPath: z.string().optional(),
    output: z.string(),
  }),
  execute: async inputData => {
    return readManagedProcessLogs(inputData.processId, {
      lines: inputData.lines,
      waitForMs: inputData.waitForMs,
    });
  },
});
