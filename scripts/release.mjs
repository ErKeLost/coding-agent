import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const input = process.argv[2];

if (!input) {
  console.error("Usage: node scripts/release.mjs <version>");
  process.exit(1);
}

const version = input.replace(/^v/, "");
const tag = `v${version}`;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version: ${input}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    if (stderr) {
      console.error(stderr);
    }
    process.exit(result.status ?? 1);
  }
  return (result.stdout ?? "").trim();
}

const existingTag = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
  cwd: root,
  stdio: "ignore",
});
if (existingTag.status === 0) {
  console.error(`Tag already exists: ${tag}`);
  process.exit(1);
}

console.log(`Syncing version ${version}...`);
run("node", [path.join("scripts", "sync-version.mjs"), version]);

console.log("Staging release changes...");
run("git", ["add", "-A"]);

const statusAfterStage = capture("git", ["status", "--porcelain"]);
if (!statusAfterStage) {
  console.error("Nothing staged after version sync.");
  process.exit(1);
}

const commitMessage = `Release ${tag}`;
console.log(`Creating commit: ${commitMessage}`);
run("git", ["commit", "-m", commitMessage]);

console.log(`Creating tag: ${tag}`);
run("git", ["tag", tag]);

const branch = capture("git", ["branch", "--show-current"]);
if (!branch) {
  console.error("Unable to determine current branch.");
  process.exit(1);
}

console.log(`Pushing branch ${branch}...`);
run("git", ["push", "origin", branch]);

console.log(`Pushing tag ${tag}...`);
run("git", ["push", "origin", tag]);

console.log(`Release triggered for ${tag}. GitHub Actions will publish the release from the tag push.`);
