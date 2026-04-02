import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

type TaskResult = {
  output: string;
  metadata?: Record<string, unknown>;
};

type TaskRunner = (
  params: {
    description: string;
    prompt: string;
    subagent_type: string;
    session_id?: string;
    command?: string;
  },
  abortSignal?: AbortSignal,
) => Promise<TaskResult>;

let taskRunner: TaskRunner | null = null;

export function setTaskRunner(fn: TaskRunner) {
  taskRunner = fn;
}

export const taskTool = createTool({
  id: 'task',
  description: 'Delegate a task to a subagent (requires a task runner hook).',
  inputSchema: z.object({
    description: z.string().min(1),
    prompt: z.string().min(1),
    subagent_type: z.string().min(1),
    session_id: z.string().optional(),
    command: z.string().optional(),
  }),
  outputSchema: z.object({
    output: z.string(),
    sessionId: z.string().optional(),
  }),
  execute: async (inputData, { abortSignal }) => {
    if (!taskRunner) {
      return {
        output: [
          'No task runner configured.',
          'Set a task runner via setTaskRunner(...) to execute subagent tasks.',
          '',
          '<task_metadata>',
          `description: ${inputData.description}`,
          `subagent_type: ${inputData.subagent_type}`,
          '</task_metadata>',
        ].join('\n'),
        sessionId: inputData.session_id,
      };
    }

    const result = await taskRunner(inputData, abortSignal);
    return {
      output: result.output,
      sessionId: inputData.session_id,
    };
  },
});
