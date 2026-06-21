import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createUpdateScript } from "../dist-electron/electron/update-script.js";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "design-update-test-"));
const sourcePath = path.join(testRoot, "新版目录");
const targetPath = path.join(testRoot, "安装目录");
const logPath = path.join(testRoot, "更新日志.log");
const scriptPath = path.join(testRoot, "更新脚本.ps1");
const packageRelativePath = path.join("resources", "app", "package.json");

try {
  fs.mkdirSync(path.join(sourcePath, "resources", "app"), { recursive: true });
  fs.mkdirSync(path.join(targetPath, "resources", "app"), { recursive: true });
  fs.writeFileSync(path.join(sourcePath, packageRelativePath), JSON.stringify({ version: "9.9.9" }), "utf8");
  fs.writeFileSync(path.join(targetPath, packageRelativePath), JSON.stringify({ version: "0.0.1" }), "utf8");
  fs.writeFileSync(path.join(sourcePath, "中文文件.txt"), "updated", "utf8");

  const script = createUpdateScript({
    sourcePath,
    targetPath,
    targetExePath: path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe"),
    expectedVersion: "9.9.9",
    logPath,
    pidToWait: 999999
  });
  fs.writeFileSync(scriptPath, script, "utf8");

  const bytes = fs.readFileSync(scriptPath);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);

  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
    { encoding: "utf8", windowsHide: true }
  );
  const updateLog = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "update log was not created";
  assert.equal(result.status, 0, [result.stderr, result.stdout, updateLog].filter(Boolean).join("\n"));

  const installedPackage = JSON.parse(fs.readFileSync(path.join(targetPath, packageRelativePath), "utf8"));
  assert.equal(installedPackage.version, "9.9.9");
  assert.equal(fs.readFileSync(path.join(targetPath, "中文文件.txt"), "utf8"), "updated");
  assert.match(updateLog, /update completed version=9\.9\.9/);
  console.log("Update script copied and verified a package through Chinese paths.");
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
