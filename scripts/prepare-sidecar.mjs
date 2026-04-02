#!/usr/bin/env node
/**
 * Prepares the Next.js standalone server output for bundling with Tauri.
 *
 * Run after `next build` (which now uses output: 'standalone').
 * Copies:
 *   .next/standalone  → src-tauri/next-server/
 *   .next/static      → src-tauri/next-server/.next/static
 *   public/           → src-tauri/next-server/public  (if it exists)
 */
import { cp, rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const target = path.join(root, "src-tauri/next-server");

console.log("Preparing Next.js standalone server for Tauri bundling…");

// Clean and recreate target dir
if (existsSync(target)) {
  await rm(target, { recursive: true });
}
await mkdir(target, { recursive: true });

// 1. Copy standalone output (server.js + minimal node_modules)
const standaloneDir = path.join(root, ".next/standalone");
if (!existsSync(standaloneDir)) {
  console.error(
    "ERROR: .next/standalone not found. Run `bun run build` first."
  );
  process.exit(1);
}
await cp(standaloneDir, target, { recursive: true });

// 2. Copy static assets (.next/static is NOT included in standalone output)
await cp(
  path.join(root, ".next/static"),
  path.join(target, ".next/static"),
  { recursive: true }
);

// 3. Copy public folder if present
const publicDir = path.join(root, "public");
if (existsSync(publicDir)) {
  await cp(publicDir, path.join(target, "public"), { recursive: true });
}

// 4. Explicitly copy native addon packages that Next.js standalone often misses.
// These packages contain platform-specific .node binaries that are loaded via
// process.dlopen() and are NOT detected by Next.js static import tracing.
const nativePackages = [
  "@anush008/tokenizers",
  "@anush008/tokenizers-darwin-universal",
  "@anush008/tokenizers-linux-x64-gnu",
  "@anush008/tokenizers-linux-arm64-gnu",
  "onnxruntime-node",
  "fastembed",
  "@mastra/fastembed",
  "@libsql/client",
];

console.log("Copying native packages…");
for (const pkg of nativePackages) {
  const src = path.join(root, "node_modules", pkg);
  if (!existsSync(src)) continue;
  const dest = path.join(target, "node_modules", pkg);
  await cp(src, dest, { recursive: true, force: true });
  console.log(`  ✓ ${pkg}`);
}
// 5. Write .env into standalone from environment variables (injected by CI secrets).
// This lets the bundled app run without users needing to configure anything.
const envVars = ["OPENROUTER_API_KEY"];
const envLines = envVars
  .filter((k) => process.env[k])
  .map((k) => `${k}=${process.env[k]}`);

if (envLines.length > 0) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(target, ".env"), envLines.join("\n") + "\n");
  console.log(`  ✓ .env (${envLines.length} var(s) from environment)`);
} else {
  console.warn("  ⚠ No env vars found – API keys will be missing at runtime");
  console.warn("    Set OPENROUTER_API_KEY before running this script");
}

console.log("✓ Next.js server ready at src-tauri/next-server/");
