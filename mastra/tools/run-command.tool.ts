import { createTool } from '@mastra/core/tools';
import z from 'zod';
import { getSandbox } from './daytona-client';
import { buildShellCommand, extractCommandResult } from './daytona-helpers';
import { normalizePackageCommand } from './sandbox-helpers';
import { emitToolProgress } from './tool-progress';

const RUN_STATES = ['started', 'running', 'completed', 'failed', 'timed_out'] as const;
type RunState = (typeof RUN_STATES)[number];

function isTimedOut(exitCode: number, stdout: string, stderr: string) {
  if (exitCode === 124) return true;
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return combined.includes('timed out') || combined.includes('timeout');
}

export const runCommand = createTool({
  id: 'runCommand',
  description: 'Run a shell command in the Daytona sandbox',
  inputSchema: z.object({
    sandboxId: z.string().describe('The sandboxId for the sandbox to run the command in'),
    command: z.string().describe('The shell command to execute'),
    workingDirectory: z
      .string()
      .optional()
      .nullable()
      .describe('The working directory to run the command in'),
    timeoutMs: z.number().default(30000).describe('Timeout for the command execution in milliseconds'),
    background: z
      .boolean()
      .default(false)
      .describe('Run the command in the background for long-lived processes'),
    captureOutput: z.boolean().default(true).describe('Whether to capture stdout and stderr output'),
  }),
  outputSchema: z
    .object({
      success: z.boolean().describe('Whether the command executed successfully'),
      state: z.enum(RUN_STATES).describe('Lifecycle state for this run'),
      exitCode: z.number().describe('The exit code of the command'),
      stdout: z.string().describe('The standard output from the command'),
      stderr: z.string().describe('The standard error from the command'),
      command: z.string().describe('The command that was executed'),
      executionTime: z.number().describe('How long the command took to execute in milliseconds'),
      sessionId: z.string().optional().describe('Sandbox session id used by this run'),
    })
    .or(
      z.object({
        error: z.string().describe('The error from a failed command execution'),
        state: z.enum(['failed', 'timed_out']).describe('Terminal lifecycle state for the failed run'),
      }),
    ),
  execute: async (inputData, context) => {
    try {
      const normalizedCommand = normalizePackageCommand(inputData.command);
      await emitToolProgress('runCommand', context, {
        step: 'prepare',
        runState: 'started',
        message: normalizedCommand,
      });
      const devServerPattern = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?dev\b/;
      if (devServerPattern.test(normalizedCommand) && !inputData.background) {
        await emitToolProgress('runCommand', context, {
          step: 'validation',
          runState: 'failed',
          message: 'Use startDevServerAndGetUrl for dev servers.',
        });
        return {
          error: JSON.stringify({
            name: 'ValidationError',
            message: 'Use startDevServerAndGetUrl for dev servers.',
          }),
          state: 'failed' as const,
        };
      }
      const sandbox = await getSandbox(inputData.sandboxId);
      const startTime = Date.now();
      const workingDirectory = inputData.workingDirectory ?? '/workspace';
      const command = buildShellCommand(normalizedCommand, workingDirectory, inputData.timeoutMs);
      const sessionId = `mastra-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await sandbox.process.createSession(sessionId);
      await emitToolProgress('runCommand', context, {
        step: 'execute',
        runState: 'running',
        message: `session=${sessionId}`,
        sessionId,
      });

      const result = await sandbox.process.executeSessionCommand(sessionId, {
        command,
        runAsync: inputData.background,
      });

      const executionTime = Date.now() - startTime;
      const { stdout, stderr, exitCode } = extractCommandResult(result);
      const captureOutput = inputData.captureOutput ?? true;
      const capturedStdout = captureOutput ? stdout : '';
      const capturedStderr = captureOutput ? stderr : '';

      if (inputData.background) {
        await emitToolProgress('runCommand', context, {
          step: 'execute',
          runState: 'running',
          durationMs: executionTime,
          sessionId,
          message: 'Command is running in background.',
        });
        return {
          success: true,
          state: 'running' as RunState,
          exitCode,
          stdout: capturedStdout,
          stderr: capturedStderr,
          command: normalizedCommand,
          executionTime,
          sessionId,
        };
      }

      const terminalState: RunState = isTimedOut(exitCode, stdout, stderr)
        ? 'timed_out'
        : exitCode === 0
          ? 'completed'
          : 'failed';
      await emitToolProgress('runCommand', context, {
        step: 'execute',
        runState: terminalState,
        durationMs: executionTime,
        stdout: capturedStdout,
        stderr: capturedStderr,
        sessionId,
      });
      return {
        success: terminalState === 'completed',
        state: terminalState,
        exitCode,
        stdout: capturedStdout,
        stderr: capturedStderr,
        command: normalizedCommand,
        executionTime,
        sessionId,
      };
    } catch (e) {
      const error = e as Error & { cause?: unknown };
      console.error('runCommand error:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        cause: error?.cause,
      });
      const errorText = error?.message ?? String(e);
      const terminalState: 'failed' | 'timed_out' = /timed?\s*out/i.test(errorText) ? 'timed_out' : 'failed';
      await emitToolProgress('runCommand', context, {
        step: 'error',
        runState: terminalState,
        message: errorText,
      });
      return {
        error: JSON.stringify(e),
        state: terminalState,
      };
    }
  },
});
