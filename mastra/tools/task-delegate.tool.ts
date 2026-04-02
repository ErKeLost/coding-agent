import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { taskTool as baseTaskTool } from './task.tool';

const TASK_DESCRIPTION = loadText('task.txt');

export const taskTool = createTool({
  id: 'task',
  description: TASK_DESCRIPTION.replace(
    '{agents}',
    [
      '- planAgent: Planning-only agent for requirements and step breakdowns.',
      '- exploreAgent: Read-only codebase exploration agent.',
      '- buildAgent: Primary agent for execution and changes.',
      '- imageAgent: Image generation agent (OpenRouter).',
    ].join('\n'),
  ),
  inputSchema: z.object({
    description: z.string().min(1),
    prompt: z.string().min(1),
    subagent_type: z.enum(['planAgent', 'exploreAgent', 'buildAgent', 'imageAgent']),
    session_id: z.string().optional(),
    command: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, { abortSignal }) => {
    const result = await baseTaskTool.execute(inputData, { abortSignal });
    return {
      title: inputData.description,
      output: result.output,
      metadata: { sessionId: result.sessionId, subagentType: inputData.subagent_type },
    };
  },
});
