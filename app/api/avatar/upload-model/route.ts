import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createCapabilities } from "@/lib/avatar/models";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".glb", ".gltf", ".vrm"]);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "avatar-model";

const parseGlbJsonChunk = (buffer: Buffer) => {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) return null;
  let offset = 12;
  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    const chunk = buffer.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === 0x4e4f534a) {
      try {
        return JSON.parse(new TextDecoder().decode(chunk)) as {
          animations?: Array<{ name?: string | null }>;
          meshes?: Array<{ extras?: { targetNames?: string[] } }>;
        };
      } catch {
        return null;
      }
    }
  }
  return null;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No model file uploaded." },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Model file is empty or too large." },
        { status: 400 },
      );
    }

    const extension = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Unsupported model format." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseGlbJsonChunk(buffer);
    const capabilities = parsed
      ? createCapabilities({
          animationCount: parsed.animations?.length ?? 0,
          animationNames: (parsed.animations ?? []).map((entry, index) =>
            entry.name?.trim() || `clip-${index + 1}`,
          ),
          morphTargetNames: (parsed.meshes ?? []).flatMap(
            (mesh) => mesh.extras?.targetNames ?? [],
          ),
          morphTargetCount: (parsed.meshes ?? []).reduce(
            (count, mesh) => count + (mesh.extras?.targetNames?.length ?? 0),
            0,
          ),
        })
      : createCapabilities({
          animationCount: 0,
          animationNames: [],
        });
    const filename = `${slugify(path.basename(file.name, extension))}-${Date.now()}${extension}`;
    const targetDir = path.join(process.cwd(), "public", "models", "custom");
    const targetPath = path.join(targetDir, filename);

    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, buffer);

    return NextResponse.json({
      ok: true,
      modelPath: `/models/custom/${filename}`,
      filename,
      bytes: file.size,
      capabilities,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload avatar model.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
