import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { autoUpdater, type UpdateInfo } from "electron-updater";
import { OrderDatabase } from "./database";
import { createUpdateScript } from "./update-script";
import type { OrderStatus } from "../shared/statuses";
import type {
  AppUpdateInfo,
  AppUpdateResult,
  CustomerLookupInput,
  OrderInput,
  OrderUpdateInput,
  QuickPhraseInput,
  QuickPhraseUpdateInput
} from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let database: OrderDatabase | null = null;
let autoUpdaterConfigured = false;
let remoteUpdateInfo: UpdateInfo | null = null;
let remoteUpdateCheckPromise: Promise<AppUpdateInfo | null> | null = null;
const appId = "com.moshangqingchen.client-management-system";
const initialWindowBackgroundColor = "#f8fbf8";
const revealFallbackMs = 5000;
const remoteUpdateCheckTimeoutMs = 12000;
const githubUpdateOwner = "moshangqingchen";
const githubUpdateRepo = "client-management-system";

function writeStartupLog(message: string): void {
  try {
    const logPath =
      process.env.DESIGN_ORDER_MANAGER_DEBUG_LOG ||
      path.join(app.getPath("userData"), "startup-debug.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  } catch {
    // Startup diagnostics must never block app launch.
  }
}

function getDatabase(): OrderDatabase {
  if (!database) throw new Error("数据库尚未初始化");
  return database;
}

function getAssetPath(fileName: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "assets", fileName);
  }

  return path.join(__dirname, "../../assets", fileName);
}

function showMainWindow(options: { forceForeground?: boolean; reason?: string } = {}): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    writeStartupLog(
      `show begin reason=${options.reason ?? "default"} visible=${mainWindow.isVisible()} minimized=${mainWindow.isMinimized()} bounds=${JSON.stringify(
        mainWindow.getBounds()
      )}`
    );
    if (options.forceForeground) {
      mainWindow.setSkipTaskbar(false);
      mainWindow.setAlwaysOnTop(true, "screen-saver");
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.moveTop();
    mainWindow.focus();
    if (options.forceForeground) {
      if (!mainWindow.isFocused()) mainWindow.flashFrame(true);
      setTimeout(() => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.setAlwaysOnTop(false);
        mainWindow.flashFrame(false);
      }, 900);
    }
    writeStartupLog(`show end visible=${mainWindow.isVisible()} focused=${mainWindow.isFocused()}`);
  } catch (error) {
    writeStartupLog(`show error=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

function createWindow(): void {
  writeStartupLog("createWindow begin");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    paintWhenInitiallyHidden: true,
    title: "客户订单管理系统",
    backgroundColor: initialWindowBackgroundColor,
    icon: getAssetPath("app-icon-design-blue-gpt-image-2.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  writeStartupLog(`createWindow after BrowserWindow visible=${mainWindow.isVisible()}`);

  let revealTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => showMainWindow({ reason: "fallback" }), revealFallbackMs);
  const revealWindow = () => {
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
    showMainWindow();
  };

  mainWindow.once("ready-to-show", () => {
    writeStartupLog("event ready-to-show");
    revealWindow();
  });
  mainWindow.webContents.once("did-finish-load", () => {
    writeStartupLog("event did-finish-load");
    revealWindow();
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    writeStartupLog(`event did-fail-load code=${errorCode} description=${errorDescription}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeStartupLog(`event render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl).catch((error) => console.error("加载开发页面失败", error));
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html")).catch((error) => console.error("加载应用页面失败", error));
  }
  mainWindow.on("closed", () => {
    if (revealTimer) clearTimeout(revealTimer);
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle("orders:list", () => getDatabase().listOrders());
  ipcMain.handle("orders:list-trashed", () => getDatabase().listTrashedOrders());
  ipcMain.handle("orders:get", (_event, orderId: string) => getDatabase().getOrder(orderId));
  ipcMain.handle("customers:list", () => getDatabase().listCustomers());
  ipcMain.handle("customers:get", (_event, customerId: string) => getDatabase().getCustomer(customerId));
  ipcMain.handle("customers:lookup", (_event, input: CustomerLookupInput) => getDatabase().lookupCustomer(input));
  ipcMain.handle("quick-phrases:list", () => getDatabase().listQuickPhrases());
  ipcMain.handle("quick-phrases:create", (_event, input: QuickPhraseInput) => getDatabase().createQuickPhrase(input));
  ipcMain.handle("quick-phrases:update", (_event, input: QuickPhraseUpdateInput) => getDatabase().updateQuickPhrase(input));
  ipcMain.handle("quick-phrases:delete", (_event, phraseId: string) => getDatabase().deleteQuickPhrase(phraseId));
  ipcMain.handle("orders:create", (_event, input: OrderInput) => getDatabase().createOrder(input));
  ipcMain.handle("orders:update", (_event, input: OrderUpdateInput) => getDatabase().updateOrder(input));
  ipcMain.handle("orders:update-status", (_event, orderId: string, status: OrderStatus) =>
    getDatabase().updateOrderStatus(orderId, status)
  );
  ipcMain.handle("orders:delete", (_event, orderId: string) => getDatabase().deleteOrder(orderId));
  ipcMain.handle("orders:restore", (_event, orderId: string) => getDatabase().restoreOrder(orderId));
  ipcMain.handle("orders:permanently-delete", (_event, orderId: string) => getDatabase().permanentlyDeleteOrder(orderId));
  ipcMain.handle("orders:open-folder", async (_event, orderId: string) => {
    const folder = await getDatabase().getOrCreateOrderFolder(orderId);
    const error = await shell.openPath(folder);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle("orders:pick-wechat-qr", async (_event, orderId: string) => {
    const options: OpenDialogOptions = {
      title: "选择客户微信二维码",
      properties: ["openFile"],
      filters: [
        { name: "二维码图片", extensions: ["jpg", "jpeg", "png", "webp"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) return null;
    return getDatabase().setWechatQr(orderId, result.filePaths[0]);
  });
  ipcMain.handle("orders:set-wechat-qr", (_event, orderId: string, sourcePath: string) => {
    return getDatabase().setWechatQr(orderId, sourcePath);
  });
  ipcMain.handle("orders:wechat-qr-preview", async (_event, orderId: string) => {
    const order = getDatabase().getOrder(orderId);
    if (!order?.wechatQrPath) return null;
    return imagePathToDataUrl(order.wechatQrPath);
  });
  ipcMain.handle("orders:open-wechat-qr", async (_event, orderId: string) => {
    const order = getDatabase().getOrder(orderId);
    if (!order?.wechatQrPath) throw new Error("微信二维码不存在");
    const error = await shell.openPath(order.wechatQrPath);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle("orders:reveal-wechat-qr", (_event, orderId: string) => {
    const order = getDatabase().getOrder(orderId);
    if (!order?.wechatQrPath) throw new Error("微信二维码不存在");
    shell.showItemInFolder(order.wechatQrPath);
    return true;
  });
  ipcMain.handle("storage:info", () => getDatabase().getStorageInfo());
  ipcMain.handle("storage:open-data-root", async () => {
    const error = await shell.openPath(getDatabase().getStorageInfo().dataRoot);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle("storage:open-files-root", async () => {
    const error = await shell.openPath(getDatabase().getStorageInfo().filesRoot);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle("storage:reveal-database", () => {
    shell.showItemInFolder(getDatabase().getStorageInfo().databasePath);
    return true;
  });
  ipcMain.handle("storage:export-backup", async () => {
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, {
          title: "选择备份保存位置",
          properties: ["openDirectory", "createDirectory"]
        })
      : await dialog.showOpenDialog({
          title: "选择备份保存位置",
          properties: ["openDirectory", "createDirectory"]
        });

    if (result.canceled || result.filePaths.length === 0) return null;
    return getDatabase().exportBackup(result.filePaths[0]);
  });
  ipcMain.handle("storage:open-backup-folder", async (_event, backupPath: string) => {
    if (!backupPath || typeof backupPath !== "string") throw new Error("备份目录无效");
    const resolvedBackupPath = path.resolve(backupPath);
    const marker = path.join(resolvedBackupPath, "backup-info.json");
    const markerStats = await fs.promises.stat(marker).catch(() => null);
    if (!markerStats?.isFile()) throw new Error("未找到备份说明文件");

    const error = await shell.openPath(resolvedBackupPath);
    if (error) throw new Error(error);
    return true;
  });
  ipcMain.handle("app:check-update", (_event, sourceFolder?: string) => checkAppUpdate(sourceFolder));
  ipcMain.handle("app:update-from-folder", async (_event, sourceFolder?: string) => {
    const folder = sourceFolder?.trim() || (await pickUpdateFolder());
    if (!folder) return null;
    return scheduleUpdateFromFolder(folder);
  });
  ipcMain.handle("app:install-remote-update", (_event, expectedVersion?: string) =>
    downloadAndInstallRemoteUpdate(expectedVersion)
  );
  ipcMain.handle("files:list", () => getDatabase().listFiles());

  ipcMain.handle("files:add", async (_event, orderId: string, sourcePaths: string[]) => {
    return getDatabase().addFiles(orderId, sourcePaths);
  });

  ipcMain.handle("files:pick-and-attach", async (_event, orderId: string) => {
    const options: OpenDialogOptions = {
      title: "选择设计文件",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "设计文件",
          extensions: ["cdr", "psd", "ps", "jpg", "jpeg", "png", "pdf", "ai", "zip", "rar"]
        },
        { name: "所有文件", extensions: ["*"] }
      ]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) return [];
    return getDatabase().addFiles(orderId, result.filePaths);
  });

  ipcMain.handle("files:preview", async (_event, fileId: string) => {
    const file = getDatabase().getFile(fileId);
    if (!file || !["jpg", "jpeg", "png"].includes(file.extension.toLowerCase())) return null;

    const stats = await fs.promises.stat(file.storedPath).catch(() => null);
    if (!stats?.isFile() || stats.size > 20 * 1024 * 1024) return null;

    const buffer = await fs.promises.readFile(file.storedPath);
    const mime = file.extension.toLowerCase() === "png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  });

  ipcMain.handle("files:open", async (_event, fileId: string) => {
    const file = getDatabase().getFile(fileId);
    if (!file) throw new Error("文件不存在");
    const error = await shell.openPath(file.storedPath);
    if (error) throw new Error(error);
    return true;
  });

  ipcMain.handle("files:reveal", (_event, fileId: string) => {
    const file = getDatabase().getFile(fileId);
    if (!file) throw new Error("文件不存在");
    shell.showItemInFolder(file.storedPath);
    return true;
  });
}

writeStartupLog("main module start");
app.setAppUserModelId(appId);
writeStartupLog("app user model id set");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
writeStartupLog(`single instance lock=${hasSingleInstanceLock}`);

if (!hasSingleInstanceLock) {
  writeStartupLog("single instance lock failed, quitting");
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow({ forceForeground: true, reason: "second-instance" }));

  writeStartupLog("waiting for app ready");
  app.whenReady()
    .then(() => {
      writeStartupLog("app ready");
      database = new OrderDatabase(app.getPath("userData"), app.getVersion());
      writeStartupLog("database initialized");
      registerIpc();
      writeStartupLog("ipc registered");
      createWindow();

      app.on("activate", () => {
        writeStartupLog("event activate");
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        showMainWindow();
      });
    })
    .catch((error) => {
      writeStartupLog(`app ready failed=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    });
}

async function pickUpdateFolder(): Promise<string | null> {
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, {
        title: "选择新版 win-unpacked 文件夹",
        properties: ["openDirectory"]
      })
    : await dialog.showOpenDialog({
        title: "选择新版 win-unpacked 文件夹",
        properties: ["openDirectory"]
      });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

async function checkAppUpdate(sourceFolder?: string): Promise<AppUpdateInfo | null> {
  if (!app.isPackaged) return null;

  if (!sourceFolder?.trim()) {
    return checkRemoteAppUpdate();
  }

  const sourcePath = await resolveUpdateSourcePath(sourceFolder);
  if (!sourcePath) return null;
  const updateInfo = await getUpdateInfoFromSource(sourcePath);
  await saveUpdateSourcePath(sourcePath).catch(() => undefined);
  return updateInfo;
}

async function downloadAndInstallRemoteUpdate(expectedVersion?: string): Promise<AppUpdateResult> {
  if (!app.isPackaged) {
    throw new Error("本地调试模式不需要应用更新，请直接重新运行开发命令");
  }

  configureAutoUpdater();
  let updateInfo = remoteUpdateInfo;
  if (!updateInfo || (expectedVersion?.trim() && normalizeVersion(updateInfo.version) !== normalizeVersion(expectedVersion))) {
    const checked = await checkRemoteAppUpdate();
    if (!checked?.hasUpdate) throw new Error("当前已经是最新版本");
    updateInfo = remoteUpdateInfo;
  }
  if (!updateInfo) throw new Error("未找到可安装的远程更新");
  if (expectedVersion?.trim() && normalizeVersion(expectedVersion) !== normalizeVersion(updateInfo.version)) {
    throw new Error("远程版本信息已变化，请重新检查更新");
  }

  const downloadedFiles = await autoUpdater.downloadUpdate();
  const installerPath = downloadedFiles[0];
  autoUpdater.quitAndInstall(true, true);

  return {
    sourceKind: "github-release",
    targetPath: path.dirname(process.execPath),
    currentVersion: app.getVersion(),
    sourceVersion: updateInfo.version,
    installerPath
  };
}

async function scheduleUpdateFromFolder(sourceFolder: string): Promise<AppUpdateResult> {
  if (!app.isPackaged) {
    throw new Error("本地调试模式不需要应用更新，请直接重新运行开发命令");
  }

  const sourcePath = path.resolve(sourceFolder);
  const updateInfo = await getUpdateInfoFromSource(sourcePath);
  const updateSourcePath = updateInfo.sourcePath;
  if (!updateSourcePath) throw new Error("缺少新版目录，请重新选择");
  if (isPathSame(updateSourcePath, updateInfo.targetPath)) {
    throw new Error("选择的新版目录就是当前程序目录，不需要更新");
  }
  await saveUpdateSourcePath(updateSourcePath).catch(() => undefined);

  const targetExePath = path.join(updateInfo.targetPath, path.basename(process.execPath));
  const updateId = Date.now();
  const scriptPath = path.join(app.getPath("temp"), `design-order-manager-update-${updateId}.ps1`);
  const readyPath = path.join(app.getPath("temp"), `design-order-manager-update-${updateId}.ready`);
  const logPath = path.join(app.getPath("temp"), "design-order-manager-update.log");
  const script = createUpdateScript({
    sourcePath: updateSourcePath,
    targetPath: updateInfo.targetPath,
    targetExePath,
    expectedVersion: updateInfo.sourceVersion,
    logPath,
    readyPath,
    pidToWait: process.pid
  });

  await fs.promises.writeFile(scriptPath, script, "utf8");
  const powershellPath = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );
  const updaterCommandLine = `"${powershellPath}" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`;
  const encodedUpdaterCommandLine = Buffer.from(updaterCommandLine, "utf16le").toString("base64");
  const launcherScript = [
    `$commandLine = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedUpdaterCommandLine}'))`,
    "$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }",
    "if ($result.ReturnValue -ne 0) { exit $result.ReturnValue }"
  ].join("\n");
  const encodedLauncherScript = Buffer.from(launcherScript, "utf16le").toString("base64");
  const child = spawn(powershellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedLauncherScript], {
    detached: false,
    stdio: "ignore",
    windowsHide: true
  });
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error: Error) => finish(error);
    const onExit = (code: number | null) => {
      if (code !== 0) finish(new Error(`更新程序启动失败（退出码 ${code ?? "未知"}）`));
    };
    const pollTimer = setInterval(() => {
      if (fs.existsSync(readyPath)) finish();
    }, 50);
    const timeoutTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
      finish(new Error("更新程序启动超时，请重试"));
    }, 5000);

    child.once("error", onError);
    child.once("exit", onExit);
  });
  child.unref();

  setTimeout(() => app.quit(), 100);

  return {
    sourceKind: "folder",
    sourcePath: updateSourcePath,
    targetPath: updateInfo.targetPath,
    currentVersion: updateInfo.currentVersion,
    sourceVersion: updateInfo.sourceVersion
  };
}

async function checkRemoteAppUpdate(): Promise<AppUpdateInfo | null> {
  if (remoteUpdateCheckPromise) return remoteUpdateCheckPromise;

  configureAutoUpdater();
  remoteUpdateCheckPromise = withTimeout(
    autoUpdater.checkForUpdates(),
    remoteUpdateCheckTimeoutMs,
    "检查更新超时，请稍后手动重试"
  )
    .then(async (result) => {
      if (!result?.isUpdateAvailable) {
        remoteUpdateInfo = null;
        return null;
      }

      remoteUpdateInfo = result.updateInfo;
      return toAutoUpdaterInfo(result.updateInfo);
    })
    .finally(() => {
      remoteUpdateCheckPromise = null;
    });

  return remoteUpdateCheckPromise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function toAutoUpdaterInfo(updateInfo: UpdateInfo): Promise<AppUpdateInfo> {
  const targetPath = path.dirname(process.execPath);
  const currentExeStats = await fs.promises.stat(process.execPath).catch(() => null);
  const currentManifest = await readUpdateManifest(targetPath);
  const primaryFile = updateInfo.files?.[0];

  return {
    sourceKind: "github-release",
    targetPath,
    currentVersion: app.getVersion(),
    sourceVersion: updateInfo.version,
    hasUpdate: true,
    currentBuildTime: currentManifest.buildTime ?? currentExeStats?.mtime.toISOString() ?? null,
    sourceBuildTime: updateInfo.releaseDate || null,
    releaseNotes: parseAutoUpdaterReleaseNotes(updateInfo),
    assetName: primaryFile?.url ? path.basename(primaryFile.url) : undefined,
    assetSize: primaryFile?.size,
    releasePageUrl: `https://github.com/${githubUpdateOwner}/${githubUpdateRepo}/releases/latest`
  };
}

function configureAutoUpdater(): void {
  if (autoUpdaterConfigured) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = {
    info: (message?: unknown) => writeStartupLog(`updater info ${String(message ?? "")}`),
    warn: (message?: unknown) => writeStartupLog(`updater warn ${String(message ?? "")}`),
    error: (message?: unknown) => writeStartupLog(`updater error ${String(message ?? "")}`),
    debug: (message: string) => writeStartupLog(`updater debug ${message}`)
  };
  autoUpdater.on("error", (error) => {
    writeStartupLog(`updater event error=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  });
  autoUpdaterConfigured = true;
}

function parseAutoUpdaterReleaseNotes(updateInfo: UpdateInfo): string[] {
  const notes = updateInfo.releaseNotes;
  if (Array.isArray(notes)) {
    const parsedNotes = notes
      .map((note) => note.note?.trim())
      .filter((note): note is string => Boolean(note))
      .slice(0, 12);
    if (parsedNotes.length > 0) return parsedNotes;
  }

  if (typeof notes === "string" && notes.trim()) {
    const parsedNotes = notes
      .split(/\r?\n/)
      .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").trim())
      .filter(Boolean)
      .slice(0, 12);
    if (parsedNotes.length > 0) return parsedNotes;
  }

  return updateInfo.releaseName ? [updateInfo.releaseName] : ["包含最新功能、界面调整和问题修复"];
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "").split(/[+-]/)[0].trim();
}

async function getUpdateInfoFromSource(sourceFolder: string): Promise<AppUpdateInfo> {
  const sourcePath = path.resolve(sourceFolder);
  const targetPath = path.dirname(process.execPath);
  const exeName = path.basename(process.execPath);
  const sourceExePath = path.join(sourcePath, exeName);
  const sourcePackagePath = path.join(sourcePath, "resources", "app", "package.json");

  const sourceExeStats = await fs.promises.stat(sourceExePath).catch(() => null);
  const sourcePackageStats = await fs.promises.stat(sourcePackagePath).catch(() => null);
  if (!sourceExeStats?.isFile() || !sourcePackageStats?.isFile()) {
    throw new Error("请选择打包后的 win-unpacked 文件夹");
  }

  const currentExeStats = await fs.promises.stat(process.execPath).catch(() => null);
  const sourceManifest = await readUpdateManifest(sourcePath);
  const currentManifest = await readUpdateManifest(targetPath);
  const sourceVersion = sourceManifest.version || (await readPackageVersion(sourcePackagePath));
  const currentVersion = app.getVersion();
  const sourceBuildTime = sourceManifest.buildTime ?? sourceExeStats.mtime.toISOString();
  const currentBuildTime = currentManifest.buildTime ?? currentExeStats?.mtime.toISOString() ?? null;
  const hasUpdate =
    !isPathSame(sourcePath, targetPath) &&
    (sourceVersion !== currentVersion || sourceExeStats.mtimeMs > (currentExeStats?.mtimeMs ?? 0) + 1000);

  return {
    sourceKind: "folder",
    sourcePath,
    targetPath,
    currentVersion,
    sourceVersion,
    hasUpdate,
    currentBuildTime,
    sourceBuildTime,
    releaseNotes: sourceManifest.notes.length > 0 ? sourceManifest.notes : ["包含最新功能、界面调整和问题修复"]
  };
}

async function resolveUpdateSourcePath(sourceFolder?: string): Promise<string | null> {
  if (sourceFolder?.trim()) return path.resolve(sourceFolder);

  const saved = await readSavedUpdateSourcePath();
  const candidates = [
    saved,
    "D:\\project development\\设计客户管理系统\\release\\win-unpacked"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const stats = await fs.promises.stat(candidate).catch(() => null);
    if (stats?.isDirectory()) return path.resolve(candidate);
  }

  return null;
}

function getUpdateConfigPath(): string {
  return path.join(app.getPath("userData"), "design-order-manager", "update-source.json");
}

async function readSavedUpdateSourcePath(): Promise<string | null> {
  try {
    const content = await fs.promises.readFile(getUpdateConfigPath(), "utf8");
    const parsed = JSON.parse(content) as { sourcePath?: unknown };
    return typeof parsed.sourcePath === "string" && parsed.sourcePath.trim() ? parsed.sourcePath : null;
  } catch {
    return null;
  }
}

async function saveUpdateSourcePath(sourcePath: string): Promise<void> {
  const configPath = getUpdateConfigPath();
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  await fs.promises.writeFile(configPath, JSON.stringify({ sourcePath }, null, 2), "utf8");
}

async function readUpdateManifest(appDirectory: string): Promise<{ version: string; buildTime: string | null; notes: string[] }> {
  const candidates = [
    path.join(appDirectory, "resources", "app", "dist", "update-manifest.json"),
    path.join(appDirectory, "resources", "app", "update-manifest.json")
  ];

  for (const candidate of candidates) {
    try {
      const content = await fs.promises.readFile(candidate, "utf8");
      const parsed = JSON.parse(content) as { version?: unknown; buildTime?: unknown; notes?: unknown };
      return {
        version: typeof parsed.version === "string" ? parsed.version : "",
        buildTime: typeof parsed.buildTime === "string" ? parsed.buildTime : null,
        notes: Array.isArray(parsed.notes) ? parsed.notes.filter((note): note is string => typeof note === "string") : []
      };
    } catch {
      // Try the next manifest location.
    }
  }

  return { version: "", buildTime: null, notes: [] };
}

async function readPackageVersion(packagePath: string): Promise<string> {
  try {
    const content = await fs.promises.readFile(packagePath, "utf8");
    const parsed = JSON.parse(content) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "未知版本";
  } catch {
    return "未知版本";
  }
}

function isPathSame(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

async function imagePathToDataUrl(filePath: string): Promise<string | null> {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!["jpg", "jpeg", "png", "webp"].includes(extension)) return null;

  const stats = await fs.promises.stat(filePath).catch(() => null);
  if (!stats?.isFile() || stats.size > 20 * 1024 * 1024) return null;

  const buffer = await fs.promises.readFile(filePath);
  const mime =
    extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

app.on("before-quit", () => {
  database?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
