import { clipboard, contextBridge, ipcRenderer, webUtils } from "electron";
import type { OrderStatus } from "../shared/statuses";
import type {
  AppUpdateInfo,
  AppUpdateResult,
  ArchivedFile,
  CustomerDetail,
  CustomerLookupInput,
  CustomerProfile,
  OrderDetail,
  OrderFile,
  OrderInput,
  OrderSummary,
  OrderUpdateInput,
  QuickPhrase,
  QuickPhraseInput,
  QuickPhraseUpdateInput,
  StorageBackupResult,
  StorageInfo
} from "../shared/types";

const api = {
  listOrders: () => ipcRenderer.invoke("orders:list") as Promise<OrderSummary[]>,
  listTrashedOrders: () => ipcRenderer.invoke("orders:list-trashed") as Promise<OrderSummary[]>,
  getOrder: (orderId: string) => ipcRenderer.invoke("orders:get", orderId) as Promise<OrderDetail | null>,
  listCustomers: () => ipcRenderer.invoke("customers:list") as Promise<CustomerProfile[]>,
  getCustomer: (customerId: string) => ipcRenderer.invoke("customers:get", customerId) as Promise<CustomerDetail | null>,
  lookupCustomer: (input: CustomerLookupInput) => ipcRenderer.invoke("customers:lookup", input) as Promise<CustomerProfile | null>,
  listQuickPhrases: () => ipcRenderer.invoke("quick-phrases:list") as Promise<QuickPhrase[]>,
  createQuickPhrase: (input: QuickPhraseInput) => ipcRenderer.invoke("quick-phrases:create", input) as Promise<QuickPhrase>,
  updateQuickPhrase: (input: QuickPhraseUpdateInput) => ipcRenderer.invoke("quick-phrases:update", input) as Promise<QuickPhrase>,
  deleteQuickPhrase: (phraseId: string) => ipcRenderer.invoke("quick-phrases:delete", phraseId) as Promise<boolean>,
  createOrder: (input: OrderInput) => ipcRenderer.invoke("orders:create", input) as Promise<OrderDetail>,
  updateOrder: (input: OrderUpdateInput) => ipcRenderer.invoke("orders:update", input) as Promise<OrderDetail>,
  updateOrderStatus: (orderId: string, status: OrderStatus) =>
    ipcRenderer.invoke("orders:update-status", orderId, status) as Promise<OrderDetail>,
  deleteOrder: (orderId: string) => ipcRenderer.invoke("orders:delete", orderId) as Promise<boolean>,
  restoreOrder: (orderId: string) => ipcRenderer.invoke("orders:restore", orderId) as Promise<OrderDetail>,
  permanentlyDeleteOrder: (orderId: string) => ipcRenderer.invoke("orders:permanently-delete", orderId) as Promise<boolean>,
  openOrderFolder: (orderId: string) => ipcRenderer.invoke("orders:open-folder", orderId) as Promise<boolean>,
  pickWechatQr: (orderId: string) => ipcRenderer.invoke("orders:pick-wechat-qr", orderId) as Promise<OrderDetail | null>,
  setWechatQr: (orderId: string, sourcePath: string) =>
    ipcRenderer.invoke("orders:set-wechat-qr", orderId, sourcePath) as Promise<OrderDetail>,
  getWechatQrPreview: (orderId: string) =>
    ipcRenderer.invoke("orders:wechat-qr-preview", orderId) as Promise<string | null>,
  openWechatQr: (orderId: string) => ipcRenderer.invoke("orders:open-wechat-qr", orderId) as Promise<boolean>,
  revealWechatQr: (orderId: string) => ipcRenderer.invoke("orders:reveal-wechat-qr", orderId) as Promise<boolean>,
  attachFiles: (orderId: string, sourcePaths: string[]) =>
    ipcRenderer.invoke("files:add", orderId, sourcePaths) as Promise<OrderFile[]>,
  listFiles: () => ipcRenderer.invoke("files:list") as Promise<ArchivedFile[]>,
  pickAndAttachFiles: (orderId: string) =>
    ipcRenderer.invoke("files:pick-and-attach", orderId) as Promise<OrderFile[]>,
  getFilePreview: (fileId: string) => ipcRenderer.invoke("files:preview", fileId) as Promise<string | null>,
  openFile: (fileId: string) => ipcRenderer.invoke("files:open", fileId) as Promise<boolean>,
  revealFile: (fileId: string) => ipcRenderer.invoke("files:reveal", fileId) as Promise<boolean>,
  getFilePath: (file: File) => webUtils.getPathForFile(file),
  copyText: (value: string) => clipboard.writeText(value),
  getStorageInfo: () => ipcRenderer.invoke("storage:info") as Promise<StorageInfo>,
  openDataRoot: () => ipcRenderer.invoke("storage:open-data-root") as Promise<boolean>,
  openFilesRoot: () => ipcRenderer.invoke("storage:open-files-root") as Promise<boolean>,
  revealDatabase: () => ipcRenderer.invoke("storage:reveal-database") as Promise<boolean>,
  exportBackup: () => ipcRenderer.invoke("storage:export-backup") as Promise<StorageBackupResult | null>,
  openBackupFolder: (backupPath: string) => ipcRenderer.invoke("storage:open-backup-folder", backupPath) as Promise<boolean>,
  checkAppUpdate: (sourcePath?: string) => ipcRenderer.invoke("app:check-update", sourcePath) as Promise<AppUpdateInfo | null>,
  updateAppFromFolder: (sourcePath?: string) =>
    ipcRenderer.invoke("app:update-from-folder", sourcePath) as Promise<AppUpdateResult | null>,
  installRemoteUpdate: (expectedVersion?: string) =>
    ipcRenderer.invoke("app:install-remote-update", expectedVersion) as Promise<AppUpdateResult>
};

contextBridge.exposeInMainWorld("orderApi", api);

export type OrderApi = typeof api;
