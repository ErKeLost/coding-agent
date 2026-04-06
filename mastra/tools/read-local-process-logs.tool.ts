import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readManagedProcessLogs } from './local-process-manager';
import { HowOneResultSchema, loadText } from './sandbox-helpers';

const DESCRIPTION = loadText('read-local-process-logs.txt');

export const readLocalProcessLogsTool = createTool({
  id: 'readLocalProcessLogs',
  description: DESCRIPTION,
  inputSchema: z.object({
    processId: z.string().min(1),
    lines: z.number().int().positive().max(400).optional(),
    waitForMs: z.number().int().min(0).max(15000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const payload = await readManagedProcessLogs(inputData.processId, {
      lines: inputData.lines,
      waitForMs: inputData.waitForMs,
    });
    const runState =
      payload.status === 'running'
        ? 'running'
        : payload.status === 'failed'
          ? 'failed'
          : 'completed';

    return {
      title: `${inputData.processId} logs`,
      output: payload.output || '[no log output yet]',
      metadata: {
        sessionId: payload.processId,
        session_id: payload.processId,
        processId: payload.processId,
        status: payload.status,
        state: runState,
        exitCode: payload.exitCode,
        exit_code: payload.exitCode,
        logPath: payload.logPath,
        lines: inputData.lines ?? 80,
        waitForMs: inputData.waitForMs ?? 0,
      },
    };
  },
});
