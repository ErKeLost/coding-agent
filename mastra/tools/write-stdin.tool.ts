import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  readManagedProcessLogs,
  resolveManagedProcessRecord,
  stopManagedProcess,
  writeManagedProcessStdin,
} from './local-process-manager';

export const writeStdinTool = createTool({
  id: 'write_stdin',
  description:
    'Continue a Codex-style background terminal session. Can poll for more output, send stdin, or stop the session.',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    chars: z.string().default(''),
    yieldTimeMs: z.number().int().min(0).max(60_000).default(250),
    tailLines: z.number().int().positive().max(400).default(120),
    endSession: z.boolean().default(false),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    state: z.enum(['running', 'completed', 'failed', 'stopped']),
    exitCode: z.number().optional(),
    output: z.string(),
    logPath: z.string().optional(),
  }),
  execute: async (inputData) => {
    if (inputData.endSession) {
      const stopped = await stopManagedProcess(inputData.sessionId);
      return {
        sessionId: stopped.processId,
        state: 'stopped' as const,
        exitCode: undefined,
        output: '',
        logPath: undefined,
      };
    }

    const hasInput = inputData.chars.length > 0;
    const logs = hasInput
      ? await writeManagedProcessStdin(inputData.sessionId, inputData.chars, {
        waitForMs: inputData.yieldTimeMs,
        lines: inputData.tailLines,
      })
      : await readManagedProcessLogs(inputData.sessionId, {
        waitForMs: inputData.yieldTimeMs,
        lines: inputData.tailLines,
      });

    const record = resolveManagedProcessRecord(inputData.sessionId);

    return {
      sessionId: inputData.sessionId,
      state:
        record?.status === 'running'
          ? 'running'
          : record?.status === 'failed'
            ? 'failed'
            : 'completed',
      exitCode: record?.exitCode,
      output: logs.output,
      logPath: logs.logPath,
    };
  },
});
