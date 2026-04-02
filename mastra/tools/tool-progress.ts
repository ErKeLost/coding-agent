export type ToolProgressStatus = 'start' | 'done' | 'error';

export type ToolRunState = 'started' | 'running' | 'completed' | 'failed' | 'timed_out';

type ToolWriterEvent = Record<string, unknown>;

type ToolWriterFn = (payload: ToolWriterEvent) => void | Promise<void>;

type ToolWriter = {
  custom?: ToolWriterFn;
  write?: ToolWriterFn;
};

type ToolContext = {
  writer?: ToolWriter;
  context?: {
    writer?: ToolWriter;
  };
};

export type ToolProgressPayload = {
  step: string;
  status?: ToolProgressStatus;
  runState?: ToolRunState;
  message?: string;
  stdout?: string;
  stderr?: string;
  previewUrl?: string;
  durationMs?: number;
  sessionId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveWriter(context: unknown): ToolWriter | undefined {
  if (!isRecord(context)) return undefined;
  const toolContext = context as ToolContext;
  return toolContext.writer ?? toolContext.context?.writer;
}

function statusFromRunState(runState: ToolRunState): ToolProgressStatus {
  switch (runState) {
    case 'started':
    case 'running':
      return 'start';
    case 'completed':
      return 'done';
    case 'failed':
    case 'timed_out':
      return 'error';
  }
}

export async function emitToolProgress(toolName: string, context: unknown, payload: ToolProgressPayload) {
  const writer = resolveWriter(context);
  if (!writer) return;

  const status = payload.status ?? (payload.runState ? statusFromRunState(payload.runState) : 'start');
  const data = {
    toolName,
    ...payload,
    status,
  };
  const event = {
    type: 'data-tool-progress',
    ...data,
    data,
  };

  if (typeof writer.custom === 'function') {
    await writer.custom(event);
    return;
  }
  if (typeof writer.write === 'function') {
    await writer.write(event);
  }
}

