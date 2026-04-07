import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { HowOneResultSchema, loadText } from './sandbox-helpers';
import { bashTool } from './bash.tool';
import { codeSearchTool } from './codesearch.tool';
import { editTool } from './edit.tool';
import { globTool } from './glob.tool';
import { grepTool } from './grep.tool';
import { listTool } from './list.tool';
import { readTool } from './read.tool';
import { skillTool } from './skill.tool';
import { todoReadTool } from './todoread.tool';
import { todoWriteTool } from './todowrite.tool';
import { webFetchTool } from './webfetch.tool';
import { webSearchTool } from './websearch.tool';
import { writeTool } from './write.tool';

const BATCH_DESCRIPTION = loadText('batch.txt');
const MAX_BATCH = 10;

type ToolDefinition = ReturnType<typeof createTool>;

type ToolMap = Map<string, ToolDefinition>;

type BatchErrorType =
  | 'tool_not_allowed'
  | 'tool_not_found'
  | 'validation'
  | 'timed_out'
  | 'aborted'
  | 'execution'
  | 'batch_limit';

type BatchCallResult =
  | {
      success: true;
      index: number;
      tool: string;
      durationMs: number;
      retryable: false;
      resultSummary: string;
    }
  | {
      success: false;
      index: number;
      tool: string;
      durationMs: number;
      error: string;
      errorType: BatchErrorType;
      retryable: boolean;
    };

function summarizeToolResult(result: unknown) {
  if (!result || typeof result !== 'object') return String(result ?? '');
  const candidate = result as { title?: unknown; output?: unknown };
  const title = typeof candidate.title === 'string' ? candidate.title : '';
  const output = typeof candidate.output === 'string' ? candidate.output : '';
  const preview = output.slice(0, 140).replace(/\s+/g, ' ').trim();
  return [title, preview].filter(Boolean).join(' - ') || 'ok';
}

function classifyExecutionError(rawError: unknown): {
  error: string;
  errorType: Exclude<BatchErrorType, 'tool_not_allowed' | 'tool_not_found' | 'batch_limit'>;
  retryable: boolean;
} {
  const error = rawError instanceof Error ? rawError.message : String(rawError);
  const normalized = error.toLowerCase();
  if (normalized.includes('abort')) {
    return { error, errorType: 'aborted', retryable: true };
  }
  if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('exit code 124')) {
    return { error, errorType: 'timed_out', retryable: true };
  }
  if (
    normalized.includes('validation') ||
    normalized.includes('zod') ||
    normalized.includes('invalid input') ||
    normalized.includes('schema')
  ) {
    return { error, errorType: 'validation', retryable: false };
  }
  const transient =
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('econnreset') ||
    normalized.includes('temporarily unavailable');
  return { error, errorType: 'execution', retryable: transient };
}

function incrementCount(counts: Partial<Record<BatchErrorType, number>>, key: BatchErrorType) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function createBatchTool(toolMap: ToolMap) {
  return createTool({
    id: 'batch',
    description: BATCH_DESCRIPTION,
    inputSchema: z.object({
      tool_calls: z
        .array(
          z.object({
            tool: z.string(),
            parameters: z.object({}).passthrough(),
          }),
        )
        .min(1),
    }),
    outputSchema: HowOneResultSchema,
    execute: async (inputData, { abortSignal }) => {
      const toolCalls = inputData.tool_calls.slice(0, MAX_BATCH);
      const discarded = inputData.tool_calls.slice(MAX_BATCH);
      const disallowed = new Set(['batch', 'workingmemory']);

      const results = await Promise.all(
        toolCalls.map(async (call, index): Promise<BatchCallResult> => {
          const startedAt = Date.now();
          if (disallowed.has(call.tool)) {
            return {
              success: false,
              index,
              tool: call.tool,
              durationMs: Date.now() - startedAt,
              error: 'Tool not allowed in batch.',
              errorType: 'tool_not_allowed',
              retryable: false,
            };
          }
          const tool = toolMap.get(call.tool);
          if (!tool) {
            return {
              success: false,
              index,
              tool: call.tool,
              durationMs: Date.now() - startedAt,
              error: 'Tool not in registry.',
              errorType: 'tool_not_found',
              retryable: false,
            };
          }
          try {
            const result = await tool.execute(call.parameters, { abortSignal });
            return {
              success: true,
              index,
              tool: call.tool,
              durationMs: Date.now() - startedAt,
              retryable: false,
              resultSummary: summarizeToolResult(result),
            };
          } catch (error) {
            const classified = classifyExecutionError(error);
            return {
              success: false,
              index,
              tool: call.tool,
              durationMs: Date.now() - startedAt,
              ...classified,
            };
          }
        }),
      );

      for (const [discardIndex, call] of discarded.entries()) {
        results.push({
          success: false,
          index: toolCalls.length + discardIndex,
          tool: call.tool,
          durationMs: 0,
          error: 'Maximum of 10 tools allowed in batch',
          errorType: 'batch_limit',
          retryable: false,
        });
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.length - successful;
      const retryableFailures = results.filter(r => !r.success && r.retryable).length;
      const countsByErrorType: Partial<Record<BatchErrorType, number>> = {};
      for (const result of results) {
        if (!result.success) incrementCount(countsByErrorType, result.errorType);
      }
      const output =
        failed > 0
          ? `Executed ${successful}/${results.length} tools successfully. ${failed} failed (${retryableFailures} retryable).`
          : `All ${successful} tools executed successfully.`;

      return {
        title: `Batch execution (${successful}/${results.length} successful)`,
        output,
        metadata: {
          totalCalls: results.length,
          successful,
          failed,
          retryableFailures,
          countsByErrorType,
          tools: inputData.tool_calls.map(c => c.tool),
          details: results,
        },
      };
    },
  });
}

const toolsForBatch: Record<string, ToolDefinition> = {
  bash: bashTool,
  read: readTool,
  write: writeTool,
  edit: editTool,
  list: listTool,
  glob: globTool,
  grep: grepTool,
  webfetch: webFetchTool,
  websearch: webSearchTool,
  codesearch: codeSearchTool,
  skill: skillTool,
  todowrite: todoWriteTool,
  todoread: todoReadTool,
};

const batchToolMap = new Map(Object.entries(toolsForBatch));
export const batchTool = createBatchTool(batchToolMap);
