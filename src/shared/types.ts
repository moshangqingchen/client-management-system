import type { DesignCategory } from "./categories";
import type { FileKind } from "./fileTypes";
import type { OrderStatus } from "./statuses";

export interface OrderInput {
  workOrderNo: string;
  designFee: number | string;
  category: DesignCategory | string;
  designSize?: string;
  customerNickname: string;
  customerWechat?: string;
  customerPhone?: string;
  shippingAddress?: string;
  trackingNumber?: string;
  orderTime: string;
}

export interface OrderUpdateInput extends OrderInput {
  id: string;
}

export interface OrderRecord {
  id: string;
  workOrderNo: string;
  designFee: number;
  category: string;
  designSize: string;
  status: OrderStatus;
  customerNickname: string;
  customerWechat: string;
  customerPhone: string;
  shippingAddress: string;
  trackingNumber: string;
  wechatQrPath: string | null;
  wechatQrOriginalName: string | null;
  trashedAt: string | null;
  orderTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummary extends OrderRecord {
  fileCount: number;
}

export interface OrderFile {
  id: string;
  orderId: string;
  originalName: string;
  storedPath: string;
  fileType: FileKind;
  extension: string;
  size: number;
  uploadedAt: string;
}

export interface OrderDetail extends OrderSummary {
  files: OrderFile[];
}

export interface ArchivedFile extends OrderFile {
  workOrderNo: string;
  customerNickname: string;
  customerWechat: string;
  category: string;
  designSize: string;
  orderStatus: OrderStatus;
  orderTime: string;
}

export interface StorageInfo {
  databasePath: string;
  filesRoot: string;
}
