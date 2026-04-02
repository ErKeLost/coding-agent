import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTool } from '@mastra/core/tools';
import { OpenRouter } from '@openrouter/sdk';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// const DEFAULT_MODEL = 'black-forest-labs/flux.2-klein-4b';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-image-preview';
const DEFAULT_SUPABASE_BUCKET = 'generated-images';

type SupabaseConfig = {
  url: string;
  key: string;
  serviceRoleKey?: string;
  bucket: string;
  prefix?: string;
};

type RequestContextLike = {
  get?: (key: string) => unknown;
};

type ToolContextLike = {
  requestContext?: RequestContextLike;
  runtimeContext?: RequestContextLike;
  context?: { requestContext?: RequestContextLike };
  agent?: { requestContext?: RequestContextLike };
};

function parseDataUrl(value: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(value);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function readContextString(context: ToolContextLike | undefined, key: string) {
  const candidates = [
    context?.requestContext,
    context?.runtimeContext,
    context?.context?.requestContext,
    context?.agent?.requestContext,
  ];

  for (const candidate of candidates) {
    const value = candidate?.get?.(key);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function resolveOutputPath(
  requestedPath: string | undefined,
  context: ToolContextLike | undefined,
) {
  const workspaceRoot = readContextString(context, 'workspaceRoot');
  const baseDir = workspaceRoot ? path.resolve(workspaceRoot) : process.cwd();
  if (!requestedPath?.trim()) {
    return path.join(baseDir, 'generated-image.png');
  }
  return path.isAbsolute(requestedPath)
    ? path.normalize(requestedPath)
    : path.join(baseDir, requestedPath);
}

function extractImagePayloadsFromChat(result: Record<string, unknown>) {
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const first = choices[0] as { message?: Record<string, unknown> } | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const images = Array.isArray(message?.images) ? (message?.images as Array<Record<string, unknown>>) : [];
  const payloads: string[] = [];
  for (const image of images) {
    const imageUrl =
      (typeof image.imageUrl === 'string' ? image.imageUrl : undefined) ??
      (typeof image.image_url === 'string' ? image.image_url : undefined) ??
      (typeof image.imageUrl === 'object' && image.imageUrl && 'url' in image.imageUrl
        ? (image.imageUrl as { url?: unknown }).url
        : undefined) ??
      (typeof image.image_url === 'object' && image.image_url && 'url' in image.image_url
        ? (image.image_url as { url?: unknown }).url
        : undefined);
    if (typeof imageUrl === 'string') {
      payloads.push(imageUrl);
    }
  }
  return payloads;
}

async function fetchAsBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
  return { buffer: Buffer.from(arrayBuffer), mimeType };
}

function getSupabaseConfig(input: { uploadToSupabase?: boolean; supabaseBucket?: string; supabasePrefix?: string }): SupabaseConfig | null {
  if (input.uploadToSupabase === false) return null;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_KEY?.trim();
  if (!url || !key) return null;
  return {
    url: url.replace(/\/$/, ''),
    key,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    bucket: input.supabaseBucket?.trim() || process.env.SUPABASE_BUCKET?.trim() || DEFAULT_SUPABASE_BUCKET,
    prefix: input.supabasePrefix?.trim() || process.env.SUPABASE_PREFIX?.trim() || undefined,
  };
}

function mimeToExtension(mimeType?: string) {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('svg')) return 'svg';
  return 'png';
}

function buildSupabaseObjectPath(
  config: SupabaseConfig,
  inputPath: string | undefined,
  index: number,
  mimeType?: string,
) {
  const now = new Date();
  const datePath = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(
    now.getUTCDate(),
  ).padStart(2, '0')}`;
  const rawFileName = inputPath?.split('/').filter(Boolean).pop() ?? 'generated-image';
  const dot = rawFileName.lastIndexOf('.');
  const baseName = dot > 0 ? rawFileName.slice(0, dot) : rawFileName;
  const ext = mimeToExtension(mimeType);
  const suffix = index > 0 ? `-${index + 1}` : '';
  const fileName = `${baseName}${suffix}.${ext}`;
  const parts = [config.prefix, datePath, fileName].filter(Boolean);
  return parts.join('/');
}

async function decodeImagePayload(payload: string) {
  const parsed = parseDataUrl(payload);
  if (parsed) {
    return { buffer: Buffer.from(parsed.base64, 'base64'), mimeType: parsed.mimeType };
  }
  if (payload.startsWith('http://') || payload.startsWith('https://')) {
    return fetchAsBuffer(payload);
  }
  return { buffer: Buffer.from(payload, 'base64'), mimeType: 'image/png' };
}

async function uploadToSupabase(
  config: SupabaseConfig,
  payloads: string[],
  inputPath?: string,
) {
  const urls: string[] = [];
  const publicClient = createClient(config.url, config.key);
  const adminClient = config.serviceRoleKey
    ? createClient(config.url, config.serviceRoleKey)
    : publicClient;

  for (let i = 0; i < payloads.length; i += 1) {
    const decoded = await decodeImagePayload(payloads[i]!);
    const objectPath = buildSupabaseObjectPath(config, inputPath, i, decoded.mimeType);
    const { error: uploadError } = await adminClient.storage
      .from(config.bucket)
      .upload(objectPath, decoded.buffer, {
        contentType: decoded.mimeType ?? 'application/octet-stream',
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    const { data } = publicClient.storage.from(config.bucket).getPublicUrl(objectPath);
    if (!data?.publicUrl) {
      throw new Error('Supabase upload succeeded but failed to resolve public URL.');
    }
    urls.push(data.publicUrl);
  }
  return urls;
}

const imageItemSchema = z.object({
  kind: z.enum(['url', 'base64', 'file']),
  url: z.string().optional(),
  publicUrl: z.string().optional(),
  base64: z.string().optional(),
  dataUrl: z.string().optional(),
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
  urls: z.array(z.string()).optional(),
  bytes: z.number().optional(),
  mimeType: z.string().optional(),
  model: z.string().optional(),
});

const outputSchema = imageItemSchema
  .extend({
    images: z.array(imageItemSchema).optional(),
  })
  .or(
    z.object({
      error: z.string(),
    }),
  );

type ImageGenerateOutput = z.infer<typeof outputSchema>;

export const imageGenerateTool = createTool({
  id: 'imageGenerate',
  description: 'Generate an image with OpenRouter without using an agent.',
  inputSchema: z.object({
    prompt: z.string().min(1),
    model: z.string().default(DEFAULT_MODEL),
    returnType: z.enum(['url', 'base64', 'file']).default('url'),
    maxImages: z.number().int().min(1).max(8).default(1),
    path: z.string().optional(),
    uploadToSupabase: z.boolean().default(true),
    supabaseBucket: z.string().optional(),
    supabasePrefix: z.string().optional(),
  }),
  outputSchema,
  execute: async (inputData, context): Promise<ImageGenerateOutput> => {
    try {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not set.');
      }

      const openRouter = new OpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });

      const model = inputData.model ?? DEFAULT_MODEL;
      const response = await openRouter.chat.send({
        model,
        messages: [
          {
            role: 'user',
            content: inputData.prompt,
          },
        ],
        modalities: ['image', 'text'],
        stream: false,
      });

      const results = extractImagePayloadsFromChat(response as Record<string, unknown>);
      const limit = Math.max(1, Math.min(inputData.maxImages ?? 1, results.length));
      const selected = results.slice(0, limit);

      if (selected.length === 0) {
        throw new Error('No image result returned from OpenRouter.');
      }

      const supabaseConfig = getSupabaseConfig(inputData);
      const supabaseUrls = supabaseConfig
        ? await uploadToSupabase(supabaseConfig, selected, inputData.path)
        : undefined;

      if (inputData.returnType === 'url') {
        const items = selected.map((item, index) => {
          const urlFromSupabase = supabaseUrls?.[index];
          if (urlFromSupabase) {
            return { kind: 'url' as const, url: urlFromSupabase, publicUrl: urlFromSupabase, mimeType: 'unknown', model };
          }
          if (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('data:')) {
            if (item.startsWith('data:')) {
              return null;
            }
            return { kind: 'url' as const, url: item, mimeType: 'unknown', model };
          }
          const parsed = parseDataUrl(item);
          if (parsed) {
            return null;
          }
          return { kind: 'url' as const, url: item, mimeType: 'unknown', model };
        }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        if (!items.length) {
          return {
            error:
              'Unable to produce public URL. Configure SUPABASE_URL/SUPABASE_KEY (and public bucket) to return short image URLs.',
          };
        }
        const [first, ...rest] = items;
        if (first) {
          return {
            ...first,
            urls: supabaseUrls,
            images: rest.length ? items : undefined,
          };
        }
        return { error: 'Provider did not return an image URL.' };
      }

      if (inputData.returnType === 'base64') {
        const items = selected.map((item, index) => {
          const urlFromSupabase = supabaseUrls?.[index];
          const parsed = parseDataUrl(item);
          if (parsed) {
            return {
              kind: 'base64' as const,
              url: urlFromSupabase,
              publicUrl: urlFromSupabase,
              base64: parsed.base64,
              dataUrl: `data:${parsed.mimeType};base64,${parsed.base64}`,
              mimeType: parsed.mimeType,
              model,
            };
          }
          if (item.startsWith('http://') || item.startsWith('https://')) {
            return { kind: 'url' as const, url: item, mimeType: 'unknown', model };
          }
          return {
            kind: 'base64' as const,
            base64: item,
            dataUrl: `data:image/png;base64,${item}`,
            mimeType: 'image/png',
            model,
          };
        });
        const [first, ...rest] = items;
        if (first) {
          return {
            ...first,
            urls: supabaseUrls,
            images: rest.length ? items : undefined,
          };
        }
        return { error: 'Provider did not return image data.' };
      }

      const basePath = resolveOutputPath(inputData.path, context);
      const buildIndexedPath = (index: number) => {
        const fileName = path.basename(basePath);
        const dir = path.dirname(basePath);
        const dot = fileName.lastIndexOf('.');
        if (dot > 0) {
          const name = fileName.slice(0, dot);
          const ext = fileName.slice(dot);
          return path.join(dir, `${name}-${index + 1}${ext}`);
        }
        return path.join(dir, `${fileName}-${index + 1}.png`);
      };
      const paths = selected.length > 1 ? selected.map((_, i) => buildIndexedPath(i)) : [basePath];

      const items: ImageGenerateOutput[] = [];
      for (let i = 0; i < selected.length; i += 1) {
        const item = selected[i]!;
        const parsed = parseDataUrl(item);
        let buffer: Buffer;
        let mimeType: string | undefined;

        if (parsed) {
          buffer = Buffer.from(parsed.base64, 'base64');
          mimeType = parsed.mimeType;
        } else if (item.startsWith('http://') || item.startsWith('https://')) {
          const fetched = await fetchAsBuffer(item);
          buffer = fetched.buffer;
          mimeType = fetched.mimeType;
        } else {
          buffer = Buffer.from(item, 'base64');
          mimeType = 'image/png';
        }

        const destination = paths[i]!;
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, buffer);

        items.push({
          kind: 'file' as const,
          url: supabaseUrls?.[i],
          publicUrl: supabaseUrls?.[i],
          path: destination,
          bytes: buffer.length,
          mimeType,
          model,
        });
      }

      const [first, ...rest] = items;
      if (first) {
        return {
          kind: 'file' as const,
          url: first.url,
          publicUrl: first.publicUrl,
          path: first.path,
          paths: items.map((entry) => entry.path).filter((path): path is string => Boolean(path)),
          urls: supabaseUrls,
          images: rest.length ? items : undefined,
        };
      }
      return { error: 'Failed to write image files.' };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
