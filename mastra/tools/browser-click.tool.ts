import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import {
  formatBrowserSummary,
  getBrowserSession,
} from './browser-session-manager';

const DESCRIPTION = loadText('browser-click.txt');

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

export const browserClickTool = createTool({
  id: 'browser_click',
  description: DESCRIPTION,
  inputSchema: z.object({
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
    target: BrowserTargetSchema,
    wait_after_ms: z.number().int().min(0).max(15000).optional(),
    timeout_ms: z.number().int().min(1000).max(120000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sessionId = inputData.sessionId ?? inputData.session_id;
    if (!sessionId) {
      throw new Error('sessionId or session_id is required.');
    }

    const session = getBrowserSession(sessionId);
    const result = await session.click(inputData.target, {
      timeoutMs: inputData.timeout_ms,
      waitAfterMs: inputData.wait_after_ms,
    });
    const sessionSummary = session.getSummary();

    return {
      title: `${sessionId} click`,
      output: [
        `Clicked: ${result.descriptor}`,
        '',
        formatBrowserSummary(result.summary),
      ].join('\n'),
      metadata: {
        sessionId: sessionSummary.sessionId,
        session_id: sessionSummary.sessionId,
        descriptor: result.descriptor,
        url: sessionSummary.currentUrl,
        title: sessionSummary.title,
        state: sessionSummary.state,
      },
    };
  },
});
