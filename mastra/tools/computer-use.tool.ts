import { createTool } from '@mastra/core/tools';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getSandbox } from './daytona-client';
import { HowOneResultSchema, getSandboxIdOrThrow } from './sandbox-helpers';
import { resolveSandboxIdFromInputOrContext } from './create-sandbox.tool';

const ProcessNameSchema = z.enum(['xvfb', 'xfce4', 'x11vnc', 'novnc']);
const MouseButtonSchema = z.enum(['left', 'right', 'middle']).default('left');
const ScrollDirectionSchema = z.enum(['up', 'down']);
const DEFAULT_SUPABASE_BUCKET = 'computer-use-screenshots';

type SupabaseConfig = {
  url: string;
  key: string;
  serviceRoleKey?: string;
  bucket: string;
  prefix?: string;
};

function summarizeResult(title: string, output: string, metadata?: Record<string, unknown>, attachments?: unknown[]) {
  return {
    title,
    output,
    metadata,
    attachments,
  };
}

function sanitizeSandboxId(inputData: { sandboxId?: string; threadId?: string; resourceId?: string }, context?: unknown) {
  return getSandboxIdOrThrow(resolveSandboxIdFromInputOrContext(inputData, context));
}

async function ensureComputerUseStarted(
  sandboxId: string,
  context?: unknown,
  autoStart = true,
) {
  const sandbox = await getSandbox(sandboxId);
  if (!autoStart) return sandbox;

  const status = await sandbox.computerUse.getStatus();
  if (status?.status !== 'running') {
    await sandbox.computerUse.start();
  }
  return sandbox;
}

function getSupabaseConfig(input: { supabaseBucket?: string; supabasePrefix?: string }): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_KEY?.trim();
  if (!url || !key) return null;
  return {
    url: url.replace(/\/$/, ''),
    key,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    bucket: input.supabaseBucket?.trim() || process.env.SUPABASE_BUCKET?.trim() || DEFAULT_SUPABASE_BUCKET,
    prefix: input.supabasePrefix?.trim() || process.env.SUPABASE_PREFIX?.trim() || 'computer-use',
  };
}

function mimeToExtension(mimeType?: string) {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

function buildSupabaseObjectPath(config: SupabaseConfig, sandboxId: string, mimeType?: string) {
  const now = new Date();
  const datePath = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
  const timestamp = `${now.getUTCHours()}${String(now.getUTCMinutes()).padStart(2, '0')}${String(
    now.getUTCSeconds(),
  ).padStart(2, '0')}-${now.getUTCMilliseconds()}`;
  const ext = mimeToExtension(mimeType);
  return [config.prefix, sandboxId, datePath, `screenshot-${timestamp}.${ext}`].filter(Boolean).join('/');
}

async function uploadScreenshotToSupabase(config: SupabaseConfig, sandboxId: string, base64: string, mimeType?: string) {
  const adminClient = config.serviceRoleKey
    ? createClient(config.url, config.serviceRoleKey)
    : createClient(config.url, config.key);
  const publicClient = createClient(config.url, config.key);
  const objectPath = buildSupabaseObjectPath(config, sandboxId, mimeType);
  const buffer = Buffer.from(base64, 'base64');

  const { error: uploadError } = await adminClient.storage.from(config.bucket).upload(objectPath, buffer, {
    contentType: mimeType ?? 'image/png',
    upsert: true,
  });
  if (uploadError) {
    throw new Error(`Supabase upload failed: ${uploadError.message}`);
  }

  const { data } = publicClient.storage.from(config.bucket).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error('Supabase upload succeeded but failed to resolve public URL.');
  }

  return {
    url: data.publicUrl,
    objectPath,
    bytes: buffer.length,
  };
}

function formatCursorPosition(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const x = typeof record.x === 'number' ? record.x : undefined;
  const y = typeof record.y === 'number' ? record.y : undefined;
  if (x === undefined || y === undefined) return undefined;
  return `${x}, ${y}`;
}

export const computerUseStartTool = createTool({
  id: 'computer_use_start',
  description: 'Start Daytona computer use processes for a sandbox so desktop automation and screenshots are available.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await getSandbox(sandboxId);
    const result = await sandbox.computerUse.start();
    return summarizeResult(
      'computer use start',
      result?.message ?? `Computer use started for sandbox ${sandboxId}.`,
      { sandboxId, status: result?.status ?? 'started' },
    );
  },
});

export const computerUseStatusTool = createTool({
  id: 'computer_use_status',
  description: 'Get overall Daytona computer use status for a sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await getSandbox(sandboxId);
    const status = await sandbox.computerUse.getStatus();
    return summarizeResult(
      'computer use status',
      `Computer use is ${status.status}.`,
      { sandboxId, ...status },
    );
  },
});

export const computerUseProcessStatusTool = createTool({
  id: 'computer_use_process_status',
  description: 'Get status for a specific computer use process like xvfb, xfce4, x11vnc, or novnc.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    processName: ProcessNameSchema,
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await getSandbox(sandboxId);
    const result = await sandbox.computerUse.getProcessStatus(inputData.processName);
    return summarizeResult(
      `computer use process ${inputData.processName}`,
      `${inputData.processName} is ${String((result as Record<string, unknown>).status ?? 'unknown')}.`,
      { sandboxId, processName: inputData.processName, ...((result as Record<string, unknown>) ?? {}) },
    );
  },
});

export const computerUseRestartProcessTool = createTool({
  id: 'computer_use_restart_process',
  description: 'Restart a specific computer use process like xvfb, xfce4, x11vnc, or novnc.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    processName: ProcessNameSchema,
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await getSandbox(sandboxId);
    const result = await sandbox.computerUse.restartProcess(inputData.processName);
    return summarizeResult(
      `restart ${inputData.processName}`,
      result?.message ?? `${inputData.processName} restarted.`,
      { sandboxId, processName: inputData.processName, ...((result as Record<string, unknown>) ?? {}) },
    );
  },
});

export const computerUseGetProcessLogsTool = createTool({
  id: 'computer_use_get_process_logs',
  description: 'Get logs for a specific computer use process.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    processName: ProcessNameSchema,
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await getSandbox(sandboxId);
    const result = await sandbox.computerUse.getProcessLogs(inputData.processName);
    const logs = String((result as Record<string, unknown>).logs ?? '');
    return summarizeResult(
      `${inputData.processName} logs`,
      logs || `No logs returned for ${inputData.processName}.`,
      { sandboxId, processName: inputData.processName },
    );
  },
});

export const computerUseGetProcessErrorsTool = createTool({
  id: 'computer_use_get_process_errors',
  description: 'Get error logs for a specific computer use process.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    processName: ProcessNameSchema,
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await getSandbox(sandboxId);
    const result = await sandbox.computerUse.getProcessErrors(inputData.processName);
    const errors = String((result as Record<string, unknown>).errors ?? '');
    return summarizeResult(
      `${inputData.processName} errors`,
      errors || `No errors returned for ${inputData.processName}.`,
      { sandboxId, processName: inputData.processName },
    );
  },
});

export const computerUseScreenshotTool = createTool({
  id: 'computer_use_screenshot',
  description: 'Take a full-screen or region screenshot from a sandbox desktop, upload it to Supabase Storage, and return the public image URL for frontend display.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    compressed: z.boolean().default(true),
    showCursor: z.boolean().default(false),
    region: z
      .object({
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .optional(),
    format: z.enum(['png', 'jpeg', 'webp']).optional(),
    quality: z.number().int().min(1).max(100).optional(),
    scale: z.number().positive().max(1).optional(),
    supabaseBucket: z.string().optional(),
    supabasePrefix: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const screenshot = inputData.region
      ? inputData.compressed
        ? await sandbox.computerUse.screenshot.takeCompressedRegion(inputData.region, {
            showCursor: inputData.showCursor,
            format: inputData.format,
            quality: inputData.quality,
            scale: inputData.scale,
          })
        : await sandbox.computerUse.screenshot.takeRegion(inputData.region, inputData.showCursor)
      : inputData.compressed
        ? await sandbox.computerUse.screenshot.takeCompressed({
            showCursor: inputData.showCursor,
            format: inputData.format,
            quality: inputData.quality,
            scale: inputData.scale,
          })
        : await sandbox.computerUse.screenshot.takeFullScreen(inputData.showCursor);

    const base64 = screenshot?.screenshot;
    const mimeType =
      inputData.format === 'jpeg'
        ? 'image/jpeg'
        : inputData.format === 'webp'
          ? 'image/webp'
          : 'image/png';
    if (!base64) {
      throw new Error('Screenshot completed but no image data was returned.');
    }

    const supabaseConfig = getSupabaseConfig(inputData);
    if (!supabaseConfig) {
      throw new Error(
        'Screenshot storage is not configured. Set SUPABASE_URL and SUPABASE_KEY (and a public bucket) to use computer_use_screenshot.',
      );
    }

    const uploaded = await uploadScreenshotToSupabase(supabaseConfig, sandboxId, base64, mimeType);
    const cursor = formatCursorPosition(screenshot?.cursorPosition);
    const regionSummary = inputData.region
      ? `region ${inputData.region.x},${inputData.region.y} ${inputData.region.width}x${inputData.region.height}`
      : 'full screen';

    return summarizeResult(
      'desktop screenshot',
      `Captured ${regionSummary}${cursor ? ` with cursor at ${cursor}` : ''}.`,
      {
        sandboxId,
        compressed: inputData.compressed,
        region: inputData.region,
        sizeBytes: screenshot?.sizeBytes,
        cursorPosition: screenshot?.cursorPosition,
        imageUrl: uploaded?.url,
        publicUrl: uploaded?.url,
        objectPath: uploaded?.objectPath,
        uploadedBytes: uploaded?.bytes,
      },
      undefined,
    );
  },
});

export const computerUseDisplayInfoTool = createTool({
  id: 'computer_use_display_info',
  description: 'Get display information for the sandbox desktop, including primary display size and all displays.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const info = await sandbox.computerUse.display.getInfo();
    const displays = Array.isArray(info.displays) ? info.displays : [];
    const primary = displays.find((display) => display?.isActive) ?? displays[0];
    const summary = primary
      ? `Primary display ${primary.width}x${primary.height} at ${primary.x},${primary.y}.`
      : 'Display information loaded.';

    return summarizeResult('display info', summary, {
      sandboxId,
      displays,
      primaryDisplay: primary,
    });
  },
});

export const computerUseGetWindowsTool = createTool({
  id: 'computer_use_get_windows',
  description: 'List open desktop windows in the sandbox.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const result = await sandbox.computerUse.display.getWindows();
    const windows = Array.isArray(result.windows) ? result.windows : [];
    const lines = windows.slice(0, 50).map((window, index) => {
      const title = typeof window.title === 'string' && window.title.trim() ? window.title.trim() : '(untitled)';
      const id = typeof window.id === 'string' ? window.id : String(window.id ?? index);
      return `- ${title} [${id}]`;
    });

    return summarizeResult(
      'desktop windows',
      lines.length ? lines.join('\n') : 'No open windows found.',
      { sandboxId, count: windows.length, windows },
    );
  },
});

export const computerUseMouseMoveTool = createTool({
  id: 'computer_use_mouse_move',
  description: 'Move the mouse cursor to a coordinate on the sandbox desktop.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const result = await sandbox.computerUse.mouse.move(inputData.x, inputData.y);
    return summarizeResult(
      'mouse move',
      `Mouse moved to ${result.x}, ${result.y}.`,
      { sandboxId, x: result.x, y: result.y },
    );
  },
});

export const computerUseMouseClickTool = createTool({
  id: 'computer_use_mouse_click',
  description: 'Click the mouse at a coordinate on the sandbox desktop.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    button: MouseButtonSchema.optional(),
    double: z.boolean().default(false),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const button = inputData.button ?? 'left';
    const result = await sandbox.computerUse.mouse.click(inputData.x, inputData.y, button, inputData.double);
    return summarizeResult(
      'mouse click',
      `${inputData.double ? 'Double-clicked' : 'Clicked'} ${button} at ${inputData.x}, ${inputData.y}.`,
      { sandboxId, button, double: inputData.double, x: inputData.x, y: inputData.y, ...((result as Record<string, unknown>) ?? {}) },
    );
  },
});

export const computerUseMouseDragTool = createTool({
  id: 'computer_use_mouse_drag',
  description: 'Drag the mouse from one coordinate to another on the sandbox desktop.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    startX: z.number().int().min(0),
    startY: z.number().int().min(0),
    endX: z.number().int().min(0),
    endY: z.number().int().min(0),
    button: MouseButtonSchema.optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const button = inputData.button ?? 'left';
    const result = await sandbox.computerUse.mouse.drag(
      inputData.startX,
      inputData.startY,
      inputData.endX,
      inputData.endY,
      button,
    );
    return summarizeResult(
      'mouse drag',
      `Dragged ${button} from ${inputData.startX}, ${inputData.startY} to ${inputData.endX}, ${inputData.endY}.`,
      { sandboxId, button, ...((result as Record<string, unknown>) ?? {}) },
    );
  },
});

export const computerUseMouseScrollTool = createTool({
  id: 'computer_use_mouse_scroll',
  description: 'Scroll the mouse wheel at a coordinate on the sandbox desktop.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    direction: ScrollDirectionSchema,
    amount: z.number().int().positive().default(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const success = await sandbox.computerUse.mouse.scroll(
      inputData.x,
      inputData.y,
      inputData.direction,
      inputData.amount,
    );
    return summarizeResult(
      'mouse scroll',
      `Scrolled ${inputData.direction} by ${inputData.amount} at ${inputData.x}, ${inputData.y}.`,
      { sandboxId, success, ...inputData },
    );
  },
});

export const computerUseMousePositionTool = createTool({
  id: 'computer_use_mouse_position',
  description: 'Get the current mouse cursor position on the sandbox desktop.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    const position = await sandbox.computerUse.mouse.getPosition();
    return summarizeResult(
      'mouse position',
      `Mouse is at ${position.x}, ${position.y}.`,
      { sandboxId, x: position.x, y: position.y },
    );
  },
});

export const computerUseKeyboardTypeTool = createTool({
  id: 'computer_use_keyboard_type',
  description: 'Type text into the sandbox desktop using the keyboard.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    text: z.string().min(1),
    delay: z.number().int().min(0).max(2000).optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    await sandbox.computerUse.keyboard.type(inputData.text, inputData.delay);
    return summarizeResult(
      'keyboard type',
      `Typed ${inputData.text.length} characters.`,
      {
        sandboxId,
        delay: inputData.delay ?? 0,
        preview: inputData.text.length > 80 ? `${inputData.text.slice(0, 80)}…` : inputData.text,
      },
    );
  },
});

export const computerUseKeyboardPressTool = createTool({
  id: 'computer_use_keyboard_press',
  description: 'Press a key with optional modifiers on the sandbox desktop keyboard.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    key: z.string().min(1),
    modifiers: z.array(z.string().min(1)).default([]),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    await sandbox.computerUse.keyboard.press(inputData.key, inputData.modifiers);
    return summarizeResult(
      'keyboard press',
      `Pressed ${inputData.modifiers.length ? `${inputData.modifiers.join('+')}+` : ''}${inputData.key}.`,
      { sandboxId, key: inputData.key, modifiers: inputData.modifiers },
    );
  },
});

export const computerUseKeyboardHotkeyTool = createTool({
  id: 'computer_use_keyboard_hotkey',
  description: 'Press a keyboard hotkey combination like ctrl+c or alt+tab on the sandbox desktop.',
  inputSchema: z.object({
    sandboxId: z.string().optional(),
    threadId: z.string().optional(),
    resourceId: z.string().optional(),
    autoStart: z.boolean().default(true),
    keys: z.string().min(1),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData, context) => {
    const sandboxId = sanitizeSandboxId(inputData, context);
    const sandbox = await ensureComputerUseStarted(sandboxId, context, inputData.autoStart);
    await sandbox.computerUse.keyboard.hotkey(inputData.keys);
    return summarizeResult(
      'keyboard hotkey',
      `Pressed hotkey ${inputData.keys}.`,
      { sandboxId, keys: inputData.keys },
    );
  },
});
