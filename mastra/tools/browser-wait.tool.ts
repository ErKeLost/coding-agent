import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import {
  formatBrowserSummary,
  getBrowserSession,
} from './browser-session-manager';

const DESCRIPTION = loadText('browser-wait.txt');

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

export const browserWaitTool = createTool({
  id: 'browser_wait',
  description: DESCRIPTION,
  inputSchema: z.object({
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
    target: BrowserTargetSchema.optional(),
    text: z.string().optional(),
    url_includes: z.string().optional(),
    title_includes: z.string().optional(),
    timeout_ms: z.number().int().min(100).max(120000).optional(),
    poll_interval_ms: z.number().int().min(50).max(5000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sessionId = inputData.sessionId ?? inputData.session_id;
    if (!sessionId) {
      throw new Error('sessionId or session_id is required.');
    }

    const session = getBrowserSession(sessionId);
    const summary = await session.waitFor({
      target: inputData.target,
      text: inputData.text,
      urlIncludes: inputData.url_includes,
      titleIncludes: inputData.title_includes,
      timeoutMs: inputData.timeout_ms,
      pollIntervalMs: inputData.poll_interval_ms,
    });
    const sessionSummary = session.getSummary();

    return {
      title: `${sessionId} wait`,
      output: formatBrowserSummary(summary),
      metadata: {
        sessionId: sessionSummary.sessionId,
        session_id: sessionSummary.sessionId,
        url: sessionSummary.currentUrl,
        title: sessionSummary.title,
        state: sessionSummary.state,
      },
    };
  },
});
