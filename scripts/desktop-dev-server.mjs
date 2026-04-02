import { spawn } from "node:child_process";

const serverUrl = "http://127.0.0.1:3000";

async function hasRunningServer() {
  try {
    const response = await fetch(serverUrl, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

if (await hasRunningServer()) {
  console.log(`[desktop-dev] Reusing existing Next.js server at ${serverUrl}`);
  process.exit(0);
}

const child = spawn(
  "bun",
  ["run", "dev:desktop"],
  {
    stdio: "inherit",
    env: process.env,
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
