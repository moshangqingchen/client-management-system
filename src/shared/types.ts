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

export interface QuickPhraseInput {
  title?: string;
  content: string;
}

export interface QuickPhraseUpdateInput extends QuickPhraseInput {
  id: string;
}

export interface QuickPhrase {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppUpdateResult {
  sourcePath: string;
  targetPath: string;
  currentVersion: string;
  sourceVersion: string;
}

export interface AppUpdateInfo extends AppUpdateResult {
  hasUpdate: boolean;
  currentBuildTime: string | null;
  sourceBuildTime: string | null;
  releaseNotes: string[];
}

export interface OrderRecord {
  id: string;
  customerId: string | null;
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

export interface CustomerLookupInput {
  customerNickname?: string;
  customerWechat?: string;
  customerPhone?: string;
}

export interface CustomerProfile {
  id: string;
  customerNickname: string;
  customerWechat: string;
  customerPhone: string;
  shippingAddress: string;
  orderCount: number;
  completedOrderCount: number;
  totalDesignFee: number;
  lastOrderTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends CustomerProfile {
  orders: OrderSummary[];
}

export interface StorageInfo {
  appVersion: string;
  dataRoot: string;
  databasePath: string;
  databaseSize: number;
  filesRoot: string;
  filesSize: number;
  fileCount: number;
}

export interface StorageBackupResult {
  backupPath: string;
  createdAt: string;
}
