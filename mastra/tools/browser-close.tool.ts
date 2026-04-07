import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { closeBrowserSession } from './browser-session-manager';

const DESCRIPTION = loadText('browser-close.txt');

export const browserCloseTool = createTool({
  id: 'browser_close',
  description: DESCRIPTION,
  inputSchema: z.object({
    sessionId: z.string().optional(),
    session_id: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sessionId = inputData.sessionId ?? inputData.session_id;
    if (!sessionId) {
      throw new Error('sessionId or session_id is required.');
    }

    const closed = await closeBrowserSession(sessionId);
    return {
      title: `${sessionId} close`,
      output: closed
        ? `Closed browser session ${sessionId}.`
        : `Browser session ${sessionId} was already gone.`,
      metadata: {
        sessionId,
        session_id: sessionId,
        closed,
      },
    };
  },
});
