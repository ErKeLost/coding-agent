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
import { chmod, cp, copyFile, lstat, mkdir, readdir, readlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const target = path.join(root, "src-tauri/next-server");
const runtimeTargetDir = path.join(root, "src-tauri/bin");
const standaloneDir = path.join(root, ".next/standalone");
const rootNodeModulesDir = path.join(root, "node_modules");

const shouldSkipRootNodeModulesEntry = (name) => {
  return (
    name === ".bin" ||
    name === ".cache" ||
    name === ".vite" ||
    name === ".DS_Store"
  );
};

const resolveBunBinary = () => {
  const candidates = [];

  try {
    const resolved = execFileSync("bun", ["--print", "process.execPath"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (resolved) candidates.push(resolved);
  } catch {
    // fall through to fixed-location probes
  }

  candidates.push(
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
    path.join(process.env.HOME ?? "", ".bun/bin/bun")
  );

  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
};

const resolveCopySource = (resolvedTarget) => {
  if (existsSync(resolvedTarget)) {
    return resolvedTarget;
  }

  const standaloneNodeModulesDir = path.join(standaloneDir, "node_modules");
  if (resolvedTarget.startsWith(standaloneNodeModulesDir)) {
    const fallback = path.join(
      rootNodeModulesDir,
      path.relative(standaloneNodeModulesDir, resolvedTarget)
    );
    if (existsSync(fallback)) {
      return fallback;
    }
  }

  return null;
};

const materializeSymlinks = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      const linkTarget = await readlink(entryPath);
      const resolvedTarget = path.resolve(path.dirname(entryPath), linkTarget);
      const copySource = resolveCopySource(resolvedTarget);

      if (!copySource) {
        console.warn(`  ⚠ Skipping unresolved symlink: ${entryPath} -> ${linkTarget}`);
        continue;
      }

      const sourceStats = await lstat(copySource);
      await rm(entryPath, { recursive: true, force: true });
      await cp(copySource, entryPath, { recursive: true, force: true, dereference: true });

      if (sourceStats.isDirectory()) {
        await materializeSymlinks(entryPath);
      }
      continue;
    }

    if (entry.isDirectory()) {
      await materializeSymlinks(entryPath);
    }
  }
};

const copyRootNodeModulesSnapshot = async () => {
  if (!existsSync(rootNodeModulesDir)) return;

  const targetNodeModulesDir = path.join(target, "node_modules");
  await mkdir(targetNodeModulesDir, { recursive: true });

  const entries = await readdir(rootNodeModulesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldSkipRootNodeModulesEntry(entry.name)) continue;

    const source = path.join(rootNodeModulesDir, entry.name);
    const destination = path.join(targetNodeModulesDir, entry.name);
    await rm(destination, { recursive: true, force: true });
    await cp(source, destination, {
      recursive: true,
      force: true,
      dereference: true,
    });
  }
};

console.log("Preparing Next.js standalone server for Tauri bundling…");

// Clean and recreate target dir
if (existsSync(target)) {
  await rm(target, { recursive: true });
}
await mkdir(target, { recursive: true });

// 1. Copy the minimal runtime subset from standalone output.
// Next.js should only need server.js, package.json, .next, and node_modules at runtime.
// Copying the whole standalone root is dangerous here because our current NFT trace is
// over-broad and can pull the entire repository (including src-tauri build outputs) in.
if (!existsSync(standaloneDir)) {
  console.error(
    "ERROR: .next/standalone not found. Run `bun run build` first."
  );
  process.exit(1);
}

const standaloneEntries = ["server.js", "package.json", ".next", "node_modules"];
for (const entry of standaloneEntries) {
  const source = path.join(standaloneDir, entry);
  if (!existsSync(source)) continue;
  const destination = path.join(target, entry);
  await cp(source, destination, { recursive: true, force: true });
}

console.log("Materializing symlinks in standalone output…");
await materializeSymlinks(target);

console.log("Overlaying root node_modules runtime snapshot…");
await copyRootNodeModulesSnapshot();

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
  "@libsql/core",
];

console.log("Copying native packages…");
for (const pkg of nativePackages) {
  const src = path.join(root, "node_modules", pkg);
  if (!existsSync(src)) continue;
  const dest = path.join(target, "node_modules", pkg);
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true, force: true });
  console.log(`  ✓ ${pkg}`);
}

// 5. Bundle a Bun runtime so the shipped desktop app does not depend on the
// user's machine having Node.js or Bun installed.
const bunBinary = resolveBunBinary();
if (!bunBinary) {
  console.error("ERROR: Could not resolve a Bun runtime to bundle into the desktop app.");
  console.error("Install Bun on the build machine before running the desktop build.");
  process.exit(1);
}

await mkdir(runtimeTargetDir, { recursive: true });
await copyFile(bunBinary, path.join(runtimeTargetDir, "bun"));
await chmod(path.join(runtimeTargetDir, "bun"), 0o755);
console.log(`  ✓ bundled bun runtime from ${bunBinary}`);

// 6. Write .env into standalone from environment variables (injected by CI secrets).
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
