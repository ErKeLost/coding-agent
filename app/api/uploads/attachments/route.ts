import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type UploadAttachmentRequest = {
  threadId?: string;
  files?: Array<{
    filename?: string;
    mediaType?: string;
    dataUrl?: string;
  }>;
};

const DEFAULT_BUCKET = "generated-images";
const DEFAULT_PREFIX = "thread-attachments";

const parseDataUrl = (value: string) => {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
};

const sanitizePathSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";

const mimeToExtension = (mimeType?: string) => {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("bmp")) return "bmp";
  if (mime.includes("svg")) return "svg";
  return "bin";
};

export async function POST(req: Request) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_KEY?.trim();
  const publicKey = process.env.SUPABASE_KEY?.trim() || supabaseKey;
  const bucket = process.env.SUPABASE_BUCKET?.trim() || DEFAULT_BUCKET;

  if (!supabaseUrl || !supabaseKey || !publicKey) {
    return NextResponse.json(
      { error: "Supabase storage is not configured." },
      { status: 500 }
    );
  }

  let payload: UploadAttachmentRequest;
  try {
    payload = (await req.json()) as UploadAttachmentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(payload.files) || payload.files.length === 0) {
    return NextResponse.json({ error: "files are required" }, { status: 400 });
  }

  const adminClient = createClient(supabaseUrl, supabaseKey);
  const publicClient = createClient(supabaseUrl, publicKey);
  const dateKey = new Date().toISOString().slice(0, 10);
  const threadKey = sanitizePathSegment(payload.threadId?.trim() || "thread");

  try {
    const files = [];

    for (const file of payload.files) {
      if (!file?.dataUrl) {
        throw new Error("Each file must include a dataUrl.");
      }

      const parsed = parseDataUrl(file.dataUrl);
      if (!parsed) {
        throw new Error("Invalid attachment dataUrl.");
      }

      const mediaType = file.mediaType?.trim() || parsed.mediaType;
      const ext = mimeToExtension(mediaType);
      const filenameBase = sanitizePathSegment(
        file.filename?.replace(/\.[^.]+$/, "") || `attachment-${crypto.randomUUID()}`
      );
      const objectPath = [
        DEFAULT_PREFIX,
        threadKey,
        dateKey,
        `${filenameBase}-${crypto.randomUUID()}.${ext}`,
      ].join("/");

      const buffer = Buffer.from(parsed.base64, "base64");
      const { error: uploadError } = await adminClient.storage
        .from(bucket)
        .upload(objectPath, buffer, {
          contentType: mediaType || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Supabase upload failed: ${uploadError.message}`);
      }

      const { data } = publicClient.storage.from(bucket).getPublicUrl(objectPath);
      if (!data?.publicUrl) {
        throw new Error("Supabase upload succeeded but no public URL was returned.");
      }

      files.push({
        url: data.publicUrl,
        path: objectPath,
        mediaType,
        filename: file.filename,
      });
    }

    return NextResponse.json({ files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Attachment upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
