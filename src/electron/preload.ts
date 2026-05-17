import { clipboard, contextBridge, ipcRenderer, webUtils } from "electron";
import type { OrderStatus } from "../shared/statuses";
import type {
  ArchivedFile,
  OrderDetail,
  OrderFile,
  OrderInput,
  OrderSummary,
  OrderUpdateInput,
  StorageInfo
} from "../shared/types";

const api = {
  listOrders: () => ipcRenderer.invoke("orders:list") as Promise<OrderSummary[]>,
  getOrder: (orderId: string) => ipcRenderer.invoke("orders:get", orderId) as Promise<OrderDetail | null>,
  createOrder: (input: OrderInput) => ipcRenderer.invoke("orders:create", input) as Promise<OrderDetail>,
  updateOrder: (input: OrderUpdateInput) => ipcRenderer.invoke("orders:update", input) as Promise<OrderDetail>,
  updateOrderStatus: (orderId: string, status: OrderStatus) =>
    ipcRenderer.invoke("orders:update-status", orderId, status) as Promise<OrderDetail>,
  deleteOrder: (orderId: string) => ipcRenderer.invoke("orders:delete", orderId) as Promise<boolean>,
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
  getStorageInfo: () => ipcRenderer.invoke("storage:info") as Promise<StorageInfo>
};

contextBridge.exposeInMainWorld("orderApi", api);

export type OrderApi = typeof api;
