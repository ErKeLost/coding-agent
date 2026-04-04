import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { cleanManagedProcesses } from './local-process-manager';

export const cleanBackgroundTerminalsTool = createTool({
  id: 'clean_background_terminals',
  description: 'Stop all live background terminal sessions started in the current app process.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    stopped: z.array(z.string()),
  }),
  execute: async () => {
    return cleanManagedProcesses();
  },
});
