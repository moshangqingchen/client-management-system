import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const electronCommand = isWindows ? "electron.cmd" : "electron";
const devServerUrl = "http://127.0.0.1:5173";

const children = new Set();

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: isWindows,
    ...options
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const build = run(npmCommand, ["run", "build:electron"]);
await new Promise((resolve, reject) => {
  build.on("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Electron TypeScript build failed with code ${code}`));
  });
});

run(npmCommand, ["run", "typecheck:renderer"]);
const vite = run(npmCommand, ["exec", "vite", "--", "--host", "127.0.0.1"]);

for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    const response = await fetch(devServerUrl);
    if (response.ok) break;
  } catch {
    await delay(250);
  }
}

const electron = run(electronCommand, ["."], {
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl
  }
});

electron.on("exit", (code) => shutdown(code ?? 0));
