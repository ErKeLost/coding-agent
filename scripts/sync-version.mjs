import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const input = process.argv[2];

if (!input) {
  console.error("Usage: node scripts/sync-version.mjs <version-or-tag>");
  process.exit(1);
}

const version = input.replace(/^v/, "");

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version: ${input}`);
  process.exit(1);
}

const targets = [
  {
    file: "package.json",
    update(content) {
      const data = JSON.parse(content);
      data.version = version;
      return `${JSON.stringify(data, null, 2)}\n`;
    },
  },
  {
    file: "src-tauri/Cargo.toml",
    update(content) {
      return content.replace(
        /^version = ".*"$/m,
        `version = "${version}"`,
      );
    },
  },
  {
    file: "src-tauri/tauri.conf.json",
    update(content) {
      const data = JSON.parse(content);
      data.version = version;
      return `${JSON.stringify(data, null, 2)}\n`;
    },
  },
  {
    file: "src-tauri/Cargo.lock",
    update(content) {
      return content.replace(
        /(\[\[package\]\]\nname = "rovix"\nversion = ")(.*)(")/m,
        `$1${version}$3`,
      );
    },
  },
];

for (const target of targets) {
  const filePath = path.join(root, target.file);
  const current = fs.readFileSync(filePath, "utf8");
  const next = target.update(current);

  if (next === current) {
    console.warn(`No change in ${target.file}`);
    continue;
  }

  fs.writeFileSync(filePath, next);
  console.log(`Updated ${target.file} -> ${version}`);
}
