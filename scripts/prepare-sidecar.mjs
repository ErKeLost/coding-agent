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

console.log("✓ Next.js server ready at src-tauri/next-server/");
