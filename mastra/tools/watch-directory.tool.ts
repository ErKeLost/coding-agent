import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { getSandbox } from './daytona-client';
import { FileEventSchema, captureSnapshot } from './daytona-helpers';

export const watchDirectory = createTool({
  id: 'watchDirectory',
  description: 'Start watching a directory for file system changes in the Daytona sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('The sandboxId for the sandbox to watch directory in'),
    path: z.string().describe('The directory path to watch for changes'),
    recursive: z.boolean().default(false).describe('Whether to watch subdirectories recursively'),
    watchDuration: z
      .number()
      .default(30000)
      .describe('How long to watch for changes in milliseconds (default 30 seconds)'),
  }),
  outputSchema: z
    .object({
      watchStarted: z.boolean().describe('Whether the watch was started successfully'),
      path: z.string().describe('The path that was watched'),
      events: z
        .array(
          z.object({
            type: FileEventSchema.describe('The type of filesystem event (WRITE, CREATE, DELETE, etc.)'),
            name: z.string().describe('The name of the file that changed'),
            timestamp: z.string().describe('When the event occurred'),
          }),
        )
        .describe('Array of filesystem events that occurred during the watch period'),
    })
    .or(
      z.object({
        error: z.string().describe('The error from a failed directory watch'),
      }),
    ),
  execute: async (inputData) => {
    try {
      const sandbox = await getSandbox(inputData.sandboxId);
      const before = await captureSnapshot(sandbox, inputData.path, inputData.recursive);

      await new Promise(resolve => setTimeout(resolve, inputData.watchDuration));

      const after = await captureSnapshot(sandbox, inputData.path, inputData.recursive);
      const events: Array<{ type: z.infer<typeof FileEventSchema>; name: string; timestamp: string }> = [];
      const timestamp = new Date().toISOString();

      for (const filePath of Object.keys(after)) {
        if (!before[filePath]) {
          events.push({
            type: 'CREATE',
            name: path.posix.relative(inputData.path, filePath) || path.posix.basename(filePath),
            timestamp,
          });
        } else if (
          before[filePath].mtime !== after[filePath].mtime ||
          before[filePath].size !== after[filePath].size
        ) {
          events.push({
            type: 'WRITE',
            name: path.posix.relative(inputData.path, filePath) || path.posix.basename(filePath),
            timestamp,
          });
        }
      }

      for (const filePath of Object.keys(before)) {
        if (!after[filePath]) {
          events.push({
            type: 'DELETE',
            name: path.posix.relative(inputData.path, filePath) || path.posix.basename(filePath),
            timestamp,
          });
        }
      }

      return {
        watchStarted: true,
        path: inputData.path,
        events,
      };
    } catch (e) {
      const error = e as Error & { cause?: unknown };
      console.error('watchDirectory error:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        cause: error?.cause,
      });
      return {
        error: JSON.stringify(e),
      };
    }
  },
});
