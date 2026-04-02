import { readFileSync } from 'node:fs';
import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { findProcessRecord, removeMissingProcessState } from './local-process-registry';

function tailText(text: string, lines: number) {
  return text.split(/\r?\n/).slice(-lines).join('\n').trim();
}

export const readLocalProcessLogsTool = createTool({
  id: 'readLocalProcessLogs',
  description:
    'Read recent logs for a local long-running process started by the agent.',
  inputSchema: z.object({
    processId: z.string().describe('Process id returned by startLocalDevServer or listLocalProcesses'),
    lines: z.number().int().positive().max(400).default(80).describe('How many trailing log lines to read'),
  }),
  outputSchema: z.object({
    processId: z.string(),
    status: z.enum(['running', 'stopped']),
    logPath: z.string().optional(),
    output: z.string(),
  }),
  execute: async inputData => {
    const record = findProcessRecord(inputData.processId);
    if (!record) {
      throw new Error(`Unknown process id: ${inputData.processId}`);
    }
    const current = removeMissingProcessState(record);
    if (!current.logPath) {
      return {
        processId: current.id,
        status: current.status,
        logPath: current.logPath,
        output: '',
      };
    }
    let output = '';
    try {
      output = tailText(readFileSync(current.logPath, 'utf8'), inputData.lines);
    } catch {
      output = '';
    }
    return {
      processId: current.id,
      status: current.status,
      logPath: current.logPath,
      output,
    };
  },
});
