import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function getBootstrapLogPath(): string {
  return (
    process.env.DESIGN_ORDER_MANAGER_DEBUG_LOG ||
    path.join(process.env.APPDATA || os.tmpdir(), "design-order-manager", "startup-debug.log")
  );
}

function writeBootstrapLog(message: string): void {
  try {
    const logPath = getBootstrapLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    // Logging must never block app launch.
  }
}

writeBootstrapLog(`bootstrap loaded cwd=${process.cwd()} argv=${JSON.stringify(process.argv)}`);

try {
  require("./main.js");
  writeBootstrapLog("main module loaded");
} catch (error) {
  writeBootstrapLog(`main module failed=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  throw error;
}
