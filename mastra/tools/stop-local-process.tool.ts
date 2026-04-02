import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { findProcessRecord, removeMissingProcessState, updateProcessRecord } from './local-process-registry';

function isRunning(pid?: number) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

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
    status: z.enum(['running', 'stopped']),
  }),
  execute: async inputData => {
    const record = findProcessRecord(inputData.processId);
    if (!record) {
      throw new Error(`Unknown process id: ${inputData.processId}`);
    }
    const current = removeMissingProcessState(record);
    if (!current.pid || !isRunning(current.pid)) {
      const updated = updateProcessRecord(current.id, { status: 'stopped' }) ?? {
        ...current,
        status: 'stopped' as const,
      };
      return {
        processId: updated.id,
        stopped: true,
        status: updated.status,
      };
    }

    process.kill(current.pid, inputData.force ? 'SIGKILL' : 'SIGTERM');
    const updated = updateProcessRecord(current.id, { status: 'stopped' }) ?? {
      ...current,
      status: 'stopped' as const,
    };
    return {
      processId: updated.id,
      stopped: true,
      status: updated.status,
    };
  },
});
