import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import {
  createBrowserSession,
  formatBrowserSummary,
  getBrowserSession,
} from './browser-session-manager';

const DESCRIPTION = loadText('browser-open.txt');

export const browserOpenTool = createTool({
  id: 'browser_open',
  description: DESCRIPTION,
  inputSchema: z.object({
    url: z.string().url(),
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
    browser: z.enum(['auto', 'chrome', 'chromium', 'edge']).optional(),
    headless: z.boolean().optional(),
    width: z.number().int().min(320).max(4096).optional(),
    height: z.number().int().min(320).max(4096).optional(),
    wait_until: z.enum(['load', 'domcontentloaded', 'interactive']).optional(),
    timeout_ms: z.number().int().min(1000).max(120000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sessionId = inputData.sessionId ?? inputData.session_id;
    const session = sessionId
      ? getBrowserSession(sessionId)
      : await createBrowserSession({
          browser: inputData.browser,
          headless: inputData.headless,
          width: inputData.width,
          height: inputData.height,
          timeoutMs: inputData.timeout_ms,
        });

    const summary = await session.navigate(
      inputData.url,
      inputData.wait_until ?? 'load',
      inputData.timeout_ms,
    );
    const sessionSummary = session.getSummary();

    return {
      title: `${sessionSummary.sessionId} open`,
      output: formatBrowserSummary(summary),
      metadata: {
        sessionId: sessionSummary.sessionId,
        session_id: sessionSummary.sessionId,
        browserName: sessionSummary.browserName,
        browser: sessionSummary.browserName,
        url: sessionSummary.currentUrl,
        title: sessionSummary.title,
        pid: sessionSummary.pid,
        headless: sessionSummary.headless,
        viewport: sessionSummary.viewport,
        debuggerPort: sessionSummary.debuggerPort,
        state: sessionSummary.state,
      },
    };
  },
});
