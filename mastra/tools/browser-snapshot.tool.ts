import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import {
  formatBrowserSummary,
  getBrowserSession,
} from './browser-session-manager';

const DESCRIPTION = loadText('browser-snapshot.txt');

export const browserSnapshotTool = createTool({
  id: 'browser_snapshot',
  description: DESCRIPTION,
  inputSchema: z.object({
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
    full_page: z.boolean().optional(),
    include_screenshot: z.boolean().optional(),
    max_text_chars: z.number().int().min(200).max(20000).optional(),
    max_interactives: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sessionId = inputData.sessionId ?? inputData.session_id;
    if (!sessionId) {
      throw new Error('sessionId or session_id is required.');
    }

    const session = getBrowserSession(sessionId);
    const summary = await session.getPageSummary({
      includeScreenshot: inputData.include_screenshot ?? true,
      fullPage: inputData.full_page,
      maxTextLength: inputData.max_text_chars,
      maxInteractives: inputData.max_interactives,
    });
    const sessionSummary = session.getSummary();

    return {
      title: `${sessionId} snapshot`,
      output: formatBrowserSummary(summary),
      metadata: {
        sessionId: sessionSummary.sessionId,
        session_id: sessionSummary.sessionId,
        url: sessionSummary.currentUrl,
        title: sessionSummary.title,
        state: sessionSummary.state,
      },
      attachments: summary.screenshotDataUrl
        ? [
            {
              mime: 'image/png',
              data: summary.screenshotDataUrl,
            },
          ]
        : undefined,
    };
  },
});
