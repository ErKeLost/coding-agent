import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { listBrowserSessions } from './browser-session-manager';

const DESCRIPTION = loadText('browser-list-sessions.txt');

export const browserListSessionsTool = createTool({
  id: 'browser_list_sessions',
  description: DESCRIPTION,
  inputSchema: z.object({}),
  outputSchema: HowOneResultSchema,
  execute: async () => {
    const sessions = listBrowserSessions();
    const output =
      sessions.length > 0
        ? sessions
            .map((session, index) =>
              [
                `${index + 1}. ${session.sessionId}`,
                `   browser: ${session.browserName}`,
                `   url: ${session.currentUrl || 'about:blank'}`,
                `   title: ${session.title || '(untitled page)'}`,
                `   state: ${session.state}`,
                `   headless: ${session.headless}`,
              ].join('\n'),
            )
            .join('\n\n')
        : 'No active browser sessions.';

    return {
      title: 'browser sessions',
      output,
      metadata: {
        count: sessions.length,
        sessions,
      },
    };
  },
});
