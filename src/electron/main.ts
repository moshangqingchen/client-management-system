import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { OrderDatabase } from "./database";
import type { OrderStatus } from "../shared/statuses";
import type { CustomerLookupInput, OrderInput, OrderUpdateInput } from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let database: OrderDatabase | null = null;
const appId = "com.moshangqingchen.client-management-system";

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

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    writeStartupLog(
      `show begin visible=${mainWindow.isVisible()} minimized=${mainWindow.isMinimized()} bounds=${JSON.stringify(
        mainWindow.getBounds()
      )}`
    );
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.moveTop();
    mainWindow.focus();
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
    show: true,
    title: "客户订单管理系统",
    backgroundColor: "#111315",
    icon: getAssetPath("app-icon-design-blue-gpt-image-2.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  writeStartupLog(`createWindow after BrowserWindow visible=${mainWindow.isVisible()}`);

  let revealTimer: ReturnType<typeof setTimeout> | null = setTimeout(showMainWindow, 1500);
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
  app.on("second-instance", showMainWindow);

  writeStartupLog("waiting for app ready");
  app.whenReady()
    .then(() => {
      writeStartupLog("app ready");
      database = new OrderDatabase(app.getPath("userData"));
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
