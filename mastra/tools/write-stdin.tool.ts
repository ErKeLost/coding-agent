import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { writeManagedProcessStdin } from './local-process-manager';
import { HowOneResultSchema, loadText } from './sandbox-helpers';

const DESCRIPTION = loadText('write-stdin.txt');

export const writeStdinTool = createTool({
  id: 'write_stdin',
  description: DESCRIPTION,
  inputSchema: z.object({
    sessionId: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    processId: z.string().min(1).optional(),
    input: z.string().optional(),
    chars: z.string().optional(),
    waitForMs: z.number().int().min(0).max(15000).optional(),
    yield_time_ms: z.number().int().min(0).max(15000).optional(),
    lines: z.number().int().positive().max(400).optional(),
    max_output_tokens: z.number().int().positive().optional(),
  }).refine((value) => Boolean(value.sessionId || value.session_id || value.processId), {
    message: 'sessionId, session_id, or processId is required',
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sessionId = inputData.sessionId ?? inputData.session_id ?? inputData.processId;
    const input = inputData.chars ?? inputData.input ?? '';
    const waitForMs = inputData.yield_time_ms ?? inputData.waitForMs;
    const payload = await writeManagedProcessStdin(
      sessionId!,
      input,
      {
        waitForMs,
        lines: inputData.lines,
      },
    );
    const maxChars =
      typeof inputData.max_output_tokens === 'number'
        ? Math.max(1000, inputData.max_output_tokens * 4)
        : undefined;
    const renderedOutput =
      maxChars && payload.output.length > maxChars
        ? `${payload.output.slice(0, maxChars)}\n\n[output truncated]`
        : payload.output;

    const runState =
      payload.status === 'running'
        ? 'running'
        : payload.status === 'failed'
          ? 'failed'
          : 'completed';

    return {
      title: `${sessionId} stdin`,
      output: renderedOutput || '[no output]',
      metadata: {
        sessionId: payload.processId,
        session_id: payload.processId,
        processId: payload.processId,
        status: payload.status,
        state: runState,
        runState,
        exitCode: payload.exitCode,
        exit_code: payload.exitCode,
        logPath: payload.logPath,
        lines: inputData.lines ?? 80,
        waitForMs: waitForMs ?? 0,
        yield_time_ms: waitForMs ?? 0,
      },
    };
  },
});
