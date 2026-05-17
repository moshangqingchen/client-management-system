import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { OrderDatabase } from "./database";
import type { OrderStatus } from "../shared/statuses";
import type { OrderInput, OrderUpdateInput } from "../shared/types";

let mainWindow: BrowserWindow | null = null;
let database: OrderDatabase | null = null;

function getDatabase(): OrderDatabase {
  if (!database) throw new Error("数据库尚未初始化");
  return database;
}

function getAssetPath(fileName: string): string {
  return path.join(__dirname, "../../assets", fileName);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "客户订单管理系统",
    backgroundColor: "#111315",
    icon: getAssetPath("app-icon-dog-gold-gpt-image-2.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle("orders:list", () => getDatabase().listOrders());
  ipcMain.handle("orders:list-trashed", () => getDatabase().listTrashedOrders());
  ipcMain.handle("orders:get", (_event, orderId: string) => getDatabase().getOrder(orderId));
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

app.whenReady().then(() => {
  database = new OrderDatabase(app.getPath("userData"));
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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
