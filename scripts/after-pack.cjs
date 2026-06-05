const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function findRcedit(projectDir) {
  const cacheRoot = path.join(os.homedir(), "AppData", "Local", "electron-builder", "Cache", "winCodeSign");
  const candidates = [];

  function walk(folder) {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === "rcedit-x64.exe") {
        candidates.push(fullPath);
      }
    }
  }

  walk(cacheRoot);
  candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);

  return (
    candidates[0] ??
    path.join(projectDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe")
  );
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const appName = "设计客户管理系统";
  const version = context.packager.appInfo.version;
  const exePath = path.join(context.appOutDir, `${appName}.exe`);
  const iconPath = path.join(context.packager.projectDir, "assets", "app-icon-design-blue-gpt-image-2.ico");
  const rceditPath = findRcedit(context.packager.projectDir);

  execFileSync(rceditPath, [
    exePath,
    "--set-icon",
    iconPath,
    "--set-version-string",
    "FileDescription",
    appName,
    "--set-version-string",
    "ProductName",
    appName,
    "--set-version-string",
    "OriginalFilename",
    `${appName}.exe`,
    "--set-file-version",
    version,
    "--set-product-version",
    version
  ]);
};
