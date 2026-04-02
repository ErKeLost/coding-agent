import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';

const QUESTION_DESCRIPTION = loadText('question.txt');

export const questionTool = createTool({
  id: 'question',
  description: QUESTION_DESCRIPTION,
  inputSchema: z.object({
    questions: z
      .array(
        z.object({
          id: z.string().optional(),
          question: z.string().min(1),
          choices: z.array(z.string().min(1)).optional(),
          allowMultiple: z.boolean().optional(),
          required: z.boolean().optional(),
          hint: z.string().optional(),
        }),
      )
      .min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const lines = inputData.questions.map((q, index) => {
      const label = `${index + 1}. ${q.question}`;
      const choiceText = q.choices?.length ? ` Choices: ${q.choices.join(', ')}` : '';
      const hintText = q.hint ? ` Hint: ${q.hint}` : '';
      return `${label}${choiceText}${hintText}`;
    });

    return {
      title: `Question${inputData.questions.length > 1 ? 's' : ''}`,
      output: `Please ask the user to answer the following:\n${lines.join('\n')}`,
      metadata: { questions: inputData.questions },
    };
  },
});
