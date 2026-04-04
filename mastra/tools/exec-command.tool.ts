import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { checkCommand } from './command-guard';
import {
  readManagedProcessLogs,
  resolveManagedProcessRecord,
  startManagedProcess,
} from './local-process-manager';
import { getWorkspaceFromToolContext, resolveWorkspaceDiskPath } from './local-tool-runtime';

export const execCommandTool = createTool({
  id: 'exec_command',
  description:
    'Start a Codex-style background terminal session. Returns a session id and initial output, then use write_stdin to continue polling or sending input.',
  inputSchema: z.object({
    command: z.string().min(1),
    cwd: z.string().optional().nullable(),
    yieldTimeMs: z.number().int().min(0).max(60_000).default(1_000),
    tailLines: z.number().int().positive().max(400).default(120),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    state: z.enum(['running', 'completed', 'failed']),
    command: z.string(),
    cwd: z.string(),
    pid: z.number().optional(),
    exitCode: z.number().optional(),
    logPath: z.string().optional(),
    output: z.string(),
  }),
  execute: async (inputData, context) => {
    const { workspaceRoot } = getWorkspaceFromToolContext(context, 'exec_command');
    const cwd = inputData.cwd
      ? resolveWorkspaceDiskPath(workspaceRoot, inputData.cwd)
      : workspaceRoot;

    const guard = checkCommand(inputData.command);
    if (guard.decision === 'forbidden') {
      throw new Error(
        `[COMMAND BLOCKED] ${guard.reason} (matched rule: "${guard.matchedRule}")\n` +
          `Command was: ${inputData.command}`,
      );
    }

    const managed = startManagedProcess({
      kind: 'unified-exec',
      command: inputData.command,
      cwd,
    });

    const logs = await readManagedProcessLogs(managed.processId, {
      waitForMs: inputData.yieldTimeMs,
      lines: inputData.tailLines,
    });
    const record = resolveManagedProcessRecord(managed.processId);

    return {
      sessionId: managed.processId,
      state:
        record?.status === 'running'
          ? 'running'
          : record?.status === 'failed'
            ? 'failed'
            : 'completed',
      command: inputData.command,
      cwd,
      pid: record?.pid ?? managed.pid,
      exitCode: record?.exitCode,
      logPath: logs.logPath,
      output: logs.output,
    };
  },
});
