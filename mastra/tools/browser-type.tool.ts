import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import {
  formatBrowserSummary,
  getBrowserSession,
} from './browser-session-manager';

const DESCRIPTION = loadText('browser-type.txt');

const BrowserTargetSchema = z.object({
  selector: z.string().optional(),
  text: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  placeholder: z.string().optional(),
  label: z.string().optional(),
  index: z.number().int().min(0).optional(),
  exact: z.boolean().optional(),
});

export const browserTypeTool = createTool({
  id: 'browser_type',
  description: DESCRIPTION,
  inputSchema: z.object({
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
    target: BrowserTargetSchema,
    text: z.string(),
    press_enter: z.boolean().optional(),
    wait_after_ms: z.number().int().min(0).max(15000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sessionId = inputData.sessionId ?? inputData.session_id;
    if (!sessionId) {
      throw new Error('sessionId or session_id is required.');
    }

    const session = getBrowserSession(sessionId);
    const result = await session.type(inputData.target, inputData.text, {
      pressEnter: inputData.press_enter,
      waitAfterMs: inputData.wait_after_ms,
    });
    const sessionSummary = session.getSummary();

    return {
      title: `${sessionId} type`,
      output: [
        `Filled: ${result.descriptor}`,
        `Value: ${result.value}`,
        '',
        formatBrowserSummary(result.summary),
      ].join('\n'),
      metadata: {
        sessionId: sessionSummary.sessionId,
        session_id: sessionSummary.sessionId,
        descriptor: result.descriptor,
        value: result.value,
        url: sessionSummary.currentUrl,
        title: sessionSummary.title,
        state: sessionSummary.state,
      },
    };
  },
});
