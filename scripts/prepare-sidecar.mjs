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
import { chmod, cp, copyFile, lstat, mkdir, readdir, readFile, readlink, rm } from "node:fs/promises";
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

const packagePathSegments = (pkgName) =>
  pkgName.startsWith("@") ? pkgName.split("/") : [pkgName];

const packageDir = (baseDir, pkgName) =>
  path.join(baseDir, ...packagePathSegments(pkgName));

const readJson = async (filePath) => {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
};

const packageHasRuntimeFiles = async (dir) => {
  if (!existsSync(dir)) return false;
  const entries = await readdir(dir);
  return entries.some((entry) => entry !== "package.json");
};

const dependencyNamesFromManifest = (manifest) => [
  ...Object.keys(manifest?.dependencies ?? {}),
  ...Object.keys(manifest?.optionalDependencies ?? {}),
];

const packageSourceCandidates = (pkgName) => [
    packageDir(path.join(rootNodeModulesDir, ".bun", "node_modules"), pkgName),
    packageDir(rootNodeModulesDir, pkgName),
    packageDir(path.join(standaloneDir, "node_modules", ".bun", "node_modules"), pkgName),
    packageDir(path.join(standaloneDir, "node_modules"), pkgName),
  ];

const listExternalizedPackages = async (dir) => {
  if (!existsSync(dir)) return [];

  const packages = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(dir, entry.name);
      const scopeEntries = await readdir(scopeDir, { withFileTypes: true });
      for (const scopeEntry of scopeEntries) {
        if (!scopeEntry.isDirectory()) continue;
        const manifest = await readJson(path.join(scopeDir, scopeEntry.name, "package.json"));
        packages.push(manifest?.name ?? path.posix.join(entry.name, scopeEntry.name));
      }
      continue;
    }

    const manifest = await readJson(path.join(dir, entry.name, "package.json"));
    packages.push(manifest?.name ?? entry.name);
  }

  return [...new Set(packages)];
};

const findBunPackageInstanceSource = async (pkgName, version) => {
  const bunRoots = [
    path.join(rootNodeModulesDir, ".bun"),
    path.join(standaloneDir, "node_modules", ".bun"),
  ];

  for (const bunRoot of bunRoots) {
    if (!existsSync(bunRoot)) continue;

    const entries = await readdir(bunRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const candidate = packageDir(path.join(bunRoot, entry.name, "node_modules"), pkgName);
      if (!existsSync(candidate)) continue;

      const manifest = await readJson(path.join(candidate, "package.json"));
      if (manifest?.name === pkgName && (!version || manifest.version === version)) {
        return candidate;
      }
    }
  }

  return null;
};

const copyPackageTree = async (sourceDir, destinationDir, seen = new Set()) => {
  const manifest = await readJson(path.join(sourceDir, "package.json"));
  const pkgName = manifest?.name ?? path.basename(destinationDir);
  const pkgVersion = manifest?.version ?? "";
  const key = `${pkgName}@${pkgVersion}:${destinationDir}`;

  if (seen.has(key)) return;
  seen.add(key);

  await mkdir(path.dirname(destinationDir), { recursive: true });
  await rm(destinationDir, { recursive: true, force: true });
  await cp(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    dereference: true,
  });
};

const copyNestedPackage = async (sourceDir, destinationDir) => {
  await mkdir(path.dirname(destinationDir), { recursive: true });
  await rm(destinationDir, { recursive: true, force: true });
  await cp(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    dereference: true,
  });
};

const patchLegacyNestedDeps = async (targetNodeModulesDir) => {
  const minizlibSource = await findBunPackageInstanceSource("minizlib", "2.1.2");
  const fsMinipassSource = await findBunPackageInstanceSource("fs-minipass", "2.1.0");
  const tarSource = await findBunPackageInstanceSource("tar", "6.2.1");

  if (minizlibSource) {
    const minizlibDest = packageDir(targetNodeModulesDir, "minizlib");
    await copyNestedPackage(minizlibSource, minizlibDest);
    await copyNestedPackage(
      packageDir(path.dirname(minizlibSource), "minipass"),
      packageDir(path.join(minizlibDest, "node_modules"), "minipass")
    );
    await copyNestedPackage(
      packageDir(path.dirname(minizlibSource), "yallist"),
      packageDir(path.join(minizlibDest, "node_modules"), "yallist")
    );
  }

  if (fsMinipassSource) {
    const fsMinipassDest = packageDir(targetNodeModulesDir, "fs-minipass");
    await copyNestedPackage(fsMinipassSource, fsMinipassDest);
    await copyNestedPackage(
      packageDir(path.dirname(fsMinipassSource), "minipass"),
      packageDir(path.join(fsMinipassDest, "node_modules"), "minipass")
    );
  }

  if (tarSource) {
    const tarDest = packageDir(targetNodeModulesDir, "tar");
    const tarDepRoot = path.dirname(tarSource);
    await copyNestedPackage(tarSource, tarDest);
    for (const depName of ["chownr", "mkdirp", "yallist", "minipass"]) {
      const depSource = packageDir(tarDepRoot, depName);
      if (!existsSync(depSource)) continue;
      await copyNestedPackage(
        depSource,
        packageDir(path.join(tarDest, "node_modules"), depName)
      );
    }
    if (fsMinipassSource) {
      const nestedFsDest = packageDir(path.join(tarDest, "node_modules"), "fs-minipass");
      await copyNestedPackage(fsMinipassSource, nestedFsDest);
      await copyNestedPackage(
        packageDir(path.dirname(fsMinipassSource), "minipass"),
        packageDir(path.join(nestedFsDest, "node_modules"), "minipass")
      );
    }
    if (minizlibSource) {
      const nestedMinizlibDest = packageDir(path.join(tarDest, "node_modules"), "minizlib");
      await copyNestedPackage(minizlibSource, nestedMinizlibDest);
      await copyNestedPackage(
        packageDir(path.dirname(minizlibSource), "minipass"),
        packageDir(path.join(nestedMinizlibDest, "node_modules"), "minipass")
      );
      await copyNestedPackage(
        packageDir(path.dirname(minizlibSource), "yallist"),
        packageDir(path.join(nestedMinizlibDest, "node_modules"), "yallist")
      );
    }
  }
};

const ensureRuntimeDependencies = async (targetNodeModulesDir, externalizedNodeModulesDir) => {
  const queue = await listExternalizedPackages(externalizedNodeModulesDir);
  const seen = new Set();

  while (queue.length > 0) {
    const pkgName = queue.shift();
    if (!pkgName || seen.has(pkgName)) continue;
    seen.add(pkgName);

    const candidateDirs = packageSourceCandidates(pkgName).filter((candidate) => existsSync(candidate));
    const sourceDir =
      (await (async () => {
        for (const candidate of candidateDirs) {
          if (await packageHasRuntimeFiles(candidate)) {
            return candidate;
          }
        }
        return candidateDirs[0] ?? null;
      })());

    if (!sourceDir) {
      console.warn(`  ⚠ Missing runtime package source for ${pkgName}`);
      continue;
    }

    const destinationDir = packageDir(targetNodeModulesDir, pkgName);
    const needsCopy = !(await packageHasRuntimeFiles(destinationDir));

    if (needsCopy) {
      await copyPackageTree(sourceDir, destinationDir);
      console.log(`  ✓ runtime dep ${pkgName}`);
    }

    const manifest =
      (await readJson(path.join(destinationDir, "package.json"))) ??
      (await readJson(path.join(sourceDir, "package.json")));

    const dependencyNames = dependencyNamesFromManifest(manifest);

    for (const depName of dependencyNames) {
      if (!seen.has(depName)) {
        queue.push(depName);
      }
    }
  }
};

const resolveNodeBinary = () => {
  const candidates = [];

  try {
    const resolved = execFileSync("which", ["node"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (resolved) candidates.push(resolved);
  } catch {
    // fall through to fixed-location probes
  }

  candidates.push(
    process.execPath?.includes("/node") ? process.execPath : "",
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node"
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

console.log("Ensuring runtime dependency closure for externalized packages…");
await ensureRuntimeDependencies(
  path.join(target, "node_modules"),
  path.join(target, ".next", "node_modules")
);

console.log("Patching legacy nested dependency trees…");
await patchLegacyNestedDeps(path.join(target, "node_modules"));

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
  "@anush008/tokenizers-darwin-arm64",
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
  const candidates = packageSourceCandidates(pkg).filter((candidate) => existsSync(candidate));
  let src = null;
  for (const candidate of candidates) {
    if (await packageHasRuntimeFiles(candidate)) {
      src = candidate;
      break;
    }
  }
  src ??= candidates[0] ?? null;
  if (!src || !existsSync(src)) continue;
  const dest = path.join(target, "node_modules", pkg);
  await copyPackageTree(src, dest);
  console.log(`  ✓ ${pkg}`);
}

// 5. Bundle a Node.js runtime so the shipped desktop app does not depend on the
// user's machine having Node.js installed. Next.js standalone targets Node.
const nodeBinary = resolveNodeBinary();
if (!nodeBinary) {
  console.error("ERROR: Could not resolve a Node.js runtime to bundle into the desktop app.");
  console.error("Install Node.js on the build machine before running the desktop build.");
  process.exit(1);
}

await rm(runtimeTargetDir, { recursive: true, force: true });
await mkdir(runtimeTargetDir, { recursive: true });
await copyFile(nodeBinary, path.join(runtimeTargetDir, "node"));
await chmod(path.join(runtimeTargetDir, "node"), 0o755);
console.log(`  ✓ bundled node runtime from ${nodeBinary}`);

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
