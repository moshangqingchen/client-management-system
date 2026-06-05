import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { classifyFileName, getFileExtension } from "../shared/fileTypes";
import { normalizeOrderStatus, type OrderStatus } from "../shared/statuses";
import { normalizeOrderInput } from "../shared/validation";
import type {
  ArchivedFile,
  CustomerDetail,
  CustomerLookupInput,
  CustomerProfile,
  OrderDetail,
  OrderFile,
  OrderInput,
  OrderRecord,
  OrderSummary,
  OrderUpdateInput,
  StorageInfo
} from "../shared/types";

interface OrderRow {
  id: string;
  customer_id?: string | null;
  work_order_no: string;
  design_fee: number;
  category: string;
  design_size?: string;
  status?: string;
  customer_nickname: string;
  customer_wechat: string;
  customer_phone?: string;
  shipping_address?: string;
  tracking_number?: string;
  wechat_qr_path?: string | null;
  wechat_qr_original_name?: string | null;
  trashed_at?: string | null;
  order_time: string;
  created_at: string;
  updated_at: string;
  file_count?: number;
}

interface FileRow {
  id: string;
  order_id: string;
  original_name: string;
  stored_path: string;
  file_type: OrderFile["fileType"];
  extension: string;
  size: number;
  uploaded_at: string;
}

type StoredFileRow = Pick<FileRow, "id" | "stored_path">;
type OrderFolderRow = Pick<OrderRow, "id" | "work_order_no">;

interface ArchivedFileRow extends FileRow {
  work_order_no: string;
  customer_nickname: string;
  customer_wechat: string;
  category: string;
  design_size?: string;
  order_status?: string;
  order_time: string;
}

interface CustomerRow {
  id: string;
  customer_nickname: string;
  customer_wechat: string;
  customer_phone: string;
  shipping_address: string;
  created_at: string;
  updated_at: string;
  order_count?: number;
  completed_order_count?: number;
  total_design_fee?: number;
  last_order_time?: string | null;
}

export class OrderDatabase {
  private readonly db: DatabaseSync;
  private readonly databasePath: string;
  private readonly filesRoot: string;

  constructor(userDataPath: string) {
    const dataRoot = path.join(userDataPath, "design-order-manager");
    this.filesRoot = path.join(dataRoot, "order-files");
    this.databasePath = path.join(dataRoot, "orders.sqlite");

    fs.mkdirSync(this.filesRoot, { recursive: true });
    this.db = new DatabaseSync(this.databasePath);
    this.initialize();
  }

  close(): void {
    this.db.close();
  }

  getStorageInfo(): StorageInfo {
    return {
      databasePath: this.databasePath,
      filesRoot: this.filesRoot
    };
  }

  listOrders(): OrderSummary[] {
    this.pruneMissingFileRecords();
    this.syncExistingOrderFolders();

    const rows = this.db
      .prepare(
        `SELECT
          o.*,
          COUNT(f.id) AS file_count
        FROM orders o
        LEFT JOIN order_files f ON f.order_id = o.id
        WHERE o.trashed_at IS NULL
        GROUP BY o.id
        ORDER BY datetime(o.order_time) DESC, datetime(o.created_at) DESC`
      )
      .all() as unknown as OrderRow[];

    return rows.map((row) => ({
      ...mapOrder(row),
      fileCount: Number(row.file_count ?? 0)
    }));
  }

  listTrashedOrders(): OrderSummary[] {
    this.pruneMissingFileRecords();

    const rows = this.db
      .prepare(
        `SELECT
          o.*,
          COUNT(f.id) AS file_count
        FROM orders o
        LEFT JOIN order_files f ON f.order_id = o.id
        WHERE o.trashed_at IS NOT NULL
        GROUP BY o.id
        ORDER BY datetime(o.trashed_at) DESC, datetime(o.order_time) DESC`
      )
      .all() as unknown as OrderRow[];

    return rows.map((row) => ({
      ...mapOrder(row),
      fileCount: Number(row.file_count ?? 0)
    }));
  }

  getOrder(orderId: string): OrderDetail | null {
    this.pruneMissingFileRecords(orderId);

    const row = this.db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as unknown as OrderRow | undefined;
    if (!row) return null;
    this.syncOrderFolderFiles(row, true);

    const files = this.db
      .prepare("SELECT * FROM order_files WHERE order_id = ? ORDER BY datetime(uploaded_at) DESC")
      .all(orderId) as unknown as FileRow[];

    return {
      ...mapOrder(row),
      fileCount: files.length,
      files: files.map(mapFile)
    };
  }

  listFiles(): ArchivedFile[] {
    this.pruneMissingFileRecords();
    this.syncExistingOrderFolders();

    const rows = this.db
      .prepare(
        `SELECT
          f.*,
          o.work_order_no,
          o.customer_nickname,
          o.customer_wechat,
          o.category,
          o.design_size,
          o.status AS order_status,
          o.order_time
        FROM order_files f
        INNER JOIN orders o ON o.id = f.order_id
        WHERE o.trashed_at IS NULL
        ORDER BY datetime(f.uploaded_at) DESC`
      )
      .all() as unknown as ArchivedFileRow[];

    return rows.map(mapArchivedFile);
  }

  listCustomers(): CustomerProfile[] {
    this.syncCustomerProfiles();

    const rows = this.db
      .prepare(
        `SELECT
          c.*,
          COUNT(CASE WHEN o.trashed_at IS NULL THEN o.id END) AS order_count,
          COUNT(CASE WHEN o.trashed_at IS NULL AND o.status = 'finished_uploaded' THEN o.id END) AS completed_order_count,
          COALESCE(SUM(CASE WHEN o.trashed_at IS NULL AND o.status = 'finished_uploaded' THEN o.design_fee ELSE 0 END), 0) AS total_design_fee,
          MAX(CASE WHEN o.trashed_at IS NULL THEN o.order_time END) AS last_order_time
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id
        ORDER BY datetime(last_order_time) DESC, datetime(c.updated_at) DESC`
      )
      .all() as unknown as CustomerRow[];

    return rows.map(mapCustomer);
  }

  getCustomer(customerId: string): CustomerDetail | null {
    this.syncCustomerProfiles();

    const customer = this.listCustomers().find((item) => item.id === customerId);
    if (!customer) return null;

    const rows = this.db
      .prepare(
        `SELECT
          o.*,
          COUNT(f.id) AS file_count
        FROM orders o
        LEFT JOIN order_files f ON f.order_id = o.id
        WHERE o.customer_id = ? AND o.trashed_at IS NULL
        GROUP BY o.id
        ORDER BY datetime(o.order_time) DESC, datetime(o.created_at) DESC`
      )
      .all(customerId) as unknown as OrderRow[];

    return {
      ...customer,
      orders: rows.map((row) => ({
        ...mapOrder(row),
        fileCount: Number(row.file_count ?? 0)
      }))
    };
  }

  lookupCustomer(input: CustomerLookupInput): CustomerProfile | null {
    this.syncCustomerProfiles();

    const customer = this.findCustomerByIdentity(normalizeCustomerIdentity(input));
    if (!customer) return null;
    return this.listCustomers().find((item) => item.id === customer.id) ?? null;
  }

  createOrder(input: OrderInput): OrderDetail {
    const normalized = normalizeOrderInput(input);
    const existing = this.db
      .prepare("SELECT id FROM orders WHERE work_order_no = ?")
      .get(normalized.workOrderNo) as unknown as { id: string } | undefined;

    if (existing) {
      throw new Error("源单号已存在");
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const customerId = this.upsertCustomerProfile(normalized, now);

    this.db
      .prepare(
        `INSERT INTO orders (
          id,
          customer_id,
          work_order_no,
          design_fee,
          category,
          design_size,
          status,
          customer_nickname,
          customer_wechat,
          customer_phone,
          shipping_address,
          tracking_number,
          order_time,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        customerId,
        normalized.workOrderNo,
        normalized.designFee,
        normalized.category,
        normalized.designSize,
        "wechat_pending",
        normalized.customerNickname,
        normalized.customerWechat,
        normalized.customerPhone,
        normalized.shippingAddress,
        normalized.trackingNumber,
        normalized.orderTime,
        now,
        now
      );

    const created = this.getOrder(id);
    if (!created) throw new Error("订单创建失败");
    return created;
  }

  updateOrder(input: OrderUpdateInput): OrderDetail {
    const current = this.getOrder(input.id);
    if (!current) throw new Error("订单不存在");

    const normalized = normalizeOrderInput(input);
    const customerId = this.upsertCustomerProfile(normalized, new Date().toISOString());
    const existing = this.db
      .prepare("SELECT id FROM orders WHERE work_order_no = ? AND id <> ?")
      .get(normalized.workOrderNo, input.id) as unknown as { id: string } | undefined;

    if (existing) {
      throw new Error("源单号已存在");
    }

    this.db
      .prepare(
        `UPDATE orders SET
          customer_id = ?,
          work_order_no = ?,
          design_fee = ?,
          category = ?,
          design_size = ?,
          customer_nickname = ?,
          customer_wechat = ?,
          customer_phone = ?,
          shipping_address = ?,
          tracking_number = ?,
          order_time = ?,
          updated_at = ?
        WHERE id = ?`
      )
      .run(
        customerId,
        normalized.workOrderNo,
        normalized.designFee,
        normalized.category,
        normalized.designSize,
        normalized.customerNickname,
        normalized.customerWechat,
        normalized.customerPhone,
        normalized.shippingAddress,
        normalized.trackingNumber,
        normalized.orderTime,
        new Date().toISOString(),
        input.id
      );

    const updated = this.getOrder(input.id);
    if (!updated) throw new Error("订单更新失败");
    return updated;
  }

  updateOrderStatus(orderId: string, status: OrderStatus): OrderDetail {
    const current = this.getOrder(orderId);
    if (!current) throw new Error("订单不存在");

    this.db
      .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
      .run(normalizeOrderStatus(status), new Date().toISOString(), orderId);

    const updated = this.getOrder(orderId);
    if (!updated) throw new Error("订单状态更新失败");
    return updated;
  }

  async deleteOrder(orderId: string): Promise<boolean> {
    const detail = this.getOrder(orderId);
    if (!detail) return false;

    this.db.prepare("UPDATE orders SET trashed_at = ?, updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      new Date().toISOString(),
      orderId
    );

    return true;
  }

  restoreOrder(orderId: string): OrderDetail {
    const current = this.getOrder(orderId);
    if (!current) throw new Error("订单不存在");

    this.db.prepare("UPDATE orders SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), orderId);

    const restored = this.getOrder(orderId);
    if (!restored) throw new Error("订单恢复失败");
    return restored;
  }

  async permanentlyDeleteOrder(orderId: string): Promise<boolean> {
    const detail = this.getOrder(orderId);
    if (!detail) return false;

    this.db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);

    for (const file of detail.files) {
      await removeStoredFile(this.filesRoot, file.storedPath);
    }

    if (detail.wechatQrPath) {
      await removeStoredFile(this.filesRoot, detail.wechatQrPath);
    }

    return true;
  }

  async addFiles(orderId: string, sourcePaths: string[]): Promise<OrderFile[]> {
    const order = this.getOrder(orderId);
    if (!order) throw new Error("订单不存在");

    const orderFolder = await this.ensureOrderFolder(order);
    const added: OrderFile[] = [];

    for (const sourcePath of sourcePaths) {
      const stats = await fs.promises.stat(sourcePath).catch(() => null);
      if (!stats?.isFile()) continue;

      const originalName = path.basename(sourcePath);
      const destination = await uniqueDestination(orderFolder, originalName);
      await fs.promises.copyFile(sourcePath, destination);

      const file: OrderFile = {
        id: randomUUID(),
        orderId,
        originalName,
        storedPath: destination,
        fileType: classifyFileName(originalName),
        extension: getFileExtension(originalName),
        size: stats.size,
        uploadedAt: new Date().toISOString()
      };

      this.db
        .prepare(
          `INSERT INTO order_files (
            id,
            order_id,
            original_name,
            stored_path,
            file_type,
            extension,
            size,
            uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          file.id,
          file.orderId,
          file.originalName,
          file.storedPath,
          file.fileType,
          file.extension,
          file.size,
          file.uploadedAt
        );

      added.push(file);
    }

    return added;
  }

  async setWechatQr(orderId: string, sourcePath: string): Promise<OrderDetail> {
    const order = this.getOrder(orderId);
    if (!order) throw new Error("订单不存在");

    const stats = await fs.promises.stat(sourcePath).catch(() => null);
    if (!stats?.isFile()) throw new Error("二维码文件不存在");

    const originalName = path.basename(sourcePath);
    const extension = getFileExtension(originalName);
    if (!["jpg", "jpeg", "png", "webp"].includes(extension)) {
      throw new Error("微信二维码仅支持 jpg、png、webp 图片");
    }

    const orderFolder = await this.ensureOrderFolder(order);
    const destination = await uniqueDestination(orderFolder, `wechat-qr.${extension}`);
    await fs.promises.copyFile(sourcePath, destination);

    if (order.wechatQrPath) {
      await removeStoredFile(this.filesRoot, order.wechatQrPath);
    }

    this.db
      .prepare(
        `UPDATE orders SET
          wechat_qr_path = ?,
          wechat_qr_original_name = ?,
          updated_at = ?
        WHERE id = ?`
      )
      .run(destination, originalName, new Date().toISOString(), orderId);

    const updated = this.getOrder(orderId);
    if (!updated) throw new Error("二维码保存失败");
    return updated;
  }

  getFile(fileId: string): OrderFile | null {
    const row = this.db.prepare("SELECT * FROM order_files WHERE id = ?").get(fileId) as unknown as FileRow | undefined;
    if (row && !fs.existsSync(row.stored_path)) {
      this.db.prepare("DELETE FROM order_files WHERE id = ?").run(fileId);
      return null;
    }

    return row ? mapFile(row) : null;
  }

  async getOrCreateOrderFolder(orderId: string): Promise<string> {
    const row = this.db.prepare("SELECT id, work_order_no FROM orders WHERE id = ?").get(orderId) as unknown as
      | OrderFolderRow
      | undefined;
    if (!row) throw new Error("订单不存在");

    const orderFolder = this.getOrderFolderPath(row);
    await fs.promises.mkdir(orderFolder, { recursive: true });
    this.syncOrderFolderFiles(row, false);
    return orderFolder;
  }

  private pruneMissingFileRecords(orderId?: string): number {
    const rows = (
      orderId
        ? this.db.prepare("SELECT id, stored_path FROM order_files WHERE order_id = ?").all(orderId)
        : this.db.prepare("SELECT id, stored_path FROM order_files").all()
    ) as unknown as StoredFileRow[];

    let deleted = 0;
    const deleteFile = this.db.prepare("DELETE FROM order_files WHERE id = ?");

    for (const row of rows) {
      if (fs.existsSync(row.stored_path)) continue;
      deleteFile.run(row.id);
      deleted += 1;
    }

    return deleted;
  }

  private syncExistingOrderFolders(): void {
    const rows = this.db.prepare("SELECT id, work_order_no FROM orders").all() as unknown as OrderFolderRow[];

    for (const row of rows) {
      this.syncOrderFolderFiles(row, false);
    }
  }

  private syncOrderFolderFiles(order: OrderFolderRow, createFolder: boolean): number {
    const orderFolder = this.getOrderFolderPath(order);
    if (!fs.existsSync(orderFolder)) {
      if (!createFolder) return 0;
      fs.mkdirSync(orderFolder, { recursive: true });
    }
    const folderStats = fs.statSync(orderFolder, { throwIfNoEntry: false });
    if (!folderStats?.isDirectory()) return 0;

    const existingRows = this.db
      .prepare("SELECT stored_path FROM order_files WHERE order_id = ?")
      .all(order.id) as unknown as Array<Pick<FileRow, "stored_path">>;
    const existingPaths = new Set(existingRows.map((row) => normalizeStoredPath(row.stored_path)));
    const insertFile = this.db.prepare(
      `INSERT INTO order_files (
        id,
        order_id,
        original_name,
        stored_path,
        file_type,
        extension,
        size,
        uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let added = 0;
    for (const filePath of listFilesRecursively(orderFolder)) {
      const originalName = path.relative(orderFolder, filePath) || path.basename(filePath);
      if (shouldSkipSyncedFile(originalName)) continue;

      const normalizedPath = normalizeStoredPath(filePath);
      if (existingPaths.has(normalizedPath)) continue;

      const stats = fs.statSync(filePath, { throwIfNoEntry: false });
      if (!stats?.isFile()) continue;

      insertFile.run(
        randomUUID(),
        order.id,
        originalName,
        filePath,
        classifyFileName(originalName),
        getFileExtension(originalName),
        stats.size,
        getFileTimestamp(stats)
      );
      existingPaths.add(normalizedPath);
      added += 1;
    }

    return added;
  }

  private async ensureOrderFolder(order: OrderRecord): Promise<string> {
    const orderFolder = this.getOrderFolderPath({ id: order.id, work_order_no: order.workOrderNo });
    await fs.promises.mkdir(orderFolder, { recursive: true });
    return orderFolder;
  }

  private getOrderFolderPath(order: OrderFolderRow): string {
    return path.join(this.filesRoot, sanitizeFileName(`${order.work_order_no}-${order.id.slice(0, 8)}`));
  }

  private syncCustomerProfiles(): void {
    const rows = this.db
      .prepare("SELECT * FROM orders ORDER BY datetime(created_at) ASC, datetime(order_time) ASC")
      .all() as unknown as OrderRow[];
    const updateOrderCustomer = this.db.prepare("UPDATE orders SET customer_id = ? WHERE id = ?");

    for (const row of rows) {
      const customerId = this.upsertCustomerProfile(
        {
          customerNickname: row.customer_nickname,
          customerWechat: row.customer_wechat,
          customerPhone: row.customer_phone ?? "",
          shippingAddress: row.shipping_address ?? ""
        },
        row.updated_at || new Date().toISOString()
      );

      if (customerId && row.customer_id !== customerId) {
        updateOrderCustomer.run(customerId, row.id);
      }
    }
  }

  private upsertCustomerProfile(input: CustomerLookupInput & { shippingAddress?: string }, timestamp: string): string | null {
    const identity = normalizeCustomerIdentity(input);
    if (!identity.customerNickname && !identity.customerWechat && !identity.customerPhone) return null;

    const current = this.findCustomerByIdentity(identity);
    if (current) {
      this.db
        .prepare(
          `UPDATE customers SET
            customer_nickname = ?,
            customer_wechat = ?,
            customer_phone = ?,
            shipping_address = ?,
            updated_at = ?
          WHERE id = ?`
        )
        .run(
          identity.customerNickname || current.customer_nickname,
          identity.customerWechat || current.customer_wechat,
          identity.customerPhone || current.customer_phone,
          identity.shippingAddress || current.shipping_address,
          timestamp,
          current.id
        );

      return current.id;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO customers (
          id,
          customer_nickname,
          customer_wechat,
          customer_phone,
          shipping_address,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        identity.customerNickname,
        identity.customerWechat,
        identity.customerPhone,
        identity.shippingAddress,
        timestamp,
        timestamp
      );

    return id;
  }

  private findCustomerByIdentity(input: CustomerLookupInput & { shippingAddress?: string }): CustomerRow | null {
    const identity = normalizeCustomerIdentity(input);
    const findByWechat = this.db.prepare(
      "SELECT * FROM customers WHERE customer_wechat <> '' AND lower(customer_wechat) = lower(?) ORDER BY datetime(updated_at) DESC LIMIT 1"
    );
    const findByPhone = this.db.prepare(
      "SELECT * FROM customers WHERE customer_phone <> '' AND customer_phone = ? ORDER BY datetime(updated_at) DESC LIMIT 1"
    );
    const findByNickname = this.db.prepare(
      "SELECT * FROM customers WHERE customer_nickname <> '' AND customer_nickname = ? ORDER BY datetime(updated_at) DESC LIMIT 1"
    );

    if (identity.customerWechat) {
      const row = findByWechat.get(identity.customerWechat) as unknown as CustomerRow | undefined;
      if (row) return row;
    }

    if (identity.customerPhone) {
      const row = findByPhone.get(identity.customerPhone) as unknown as CustomerRow | undefined;
      if (row) return row;
    }

    if (identity.customerNickname) {
      const row = findByNickname.get(identity.customerNickname) as unknown as CustomerRow | undefined;
      if (row) return row;
    }

    return null;
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        work_order_no TEXT NOT NULL UNIQUE,
        design_fee REAL NOT NULL DEFAULT 0,
        category TEXT NOT NULL,
        design_size TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'wechat_pending',
        customer_nickname TEXT NOT NULL,
        customer_wechat TEXT NOT NULL,
        customer_phone TEXT NOT NULL DEFAULT '',
        shipping_address TEXT NOT NULL DEFAULT '',
        tracking_number TEXT NOT NULL DEFAULT '',
        wechat_qr_path TEXT,
        wechat_qr_original_name TEXT,
        trashed_at TEXT,
        order_time TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        customer_nickname TEXT NOT NULL DEFAULT '',
        customer_wechat TEXT NOT NULL DEFAULT '',
        customer_phone TEXT NOT NULL DEFAULT '',
        shipping_address TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_files (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_path TEXT NOT NULL,
        file_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        size INTEGER NOT NULL,
        uploaded_at TEXT NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_orders_order_time ON orders(order_time);
      CREATE INDEX IF NOT EXISTS idx_customers_wechat ON customers(customer_wechat);
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(customer_phone);
      CREATE INDEX IF NOT EXISTS idx_customers_nickname ON customers(customer_nickname);
      CREATE INDEX IF NOT EXISTS idx_files_order_id ON order_files(order_id);
    `);
    this.migrate();
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);");
    this.syncCustomerProfiles();
  }

  private migrate(): void {
    const columns = this.db.prepare("PRAGMA table_info(orders)").all() as unknown as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    const migrations = [
      ["customer_id", "ALTER TABLE orders ADD COLUMN customer_id TEXT"],
      ["status", "ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'none'"],
      ["design_size", "ALTER TABLE orders ADD COLUMN design_size TEXT NOT NULL DEFAULT ''"],
      ["customer_phone", "ALTER TABLE orders ADD COLUMN customer_phone TEXT NOT NULL DEFAULT ''"],
      ["shipping_address", "ALTER TABLE orders ADD COLUMN shipping_address TEXT NOT NULL DEFAULT ''"],
      ["tracking_number", "ALTER TABLE orders ADD COLUMN tracking_number TEXT NOT NULL DEFAULT ''"],
      ["wechat_qr_path", "ALTER TABLE orders ADD COLUMN wechat_qr_path TEXT"],
      ["wechat_qr_original_name", "ALTER TABLE orders ADD COLUMN wechat_qr_original_name TEXT"],
      ["trashed_at", "ALTER TABLE orders ADD COLUMN trashed_at TEXT"]
    ] as const;

    for (const [name, statement] of migrations) {
      if (!names.has(name)) {
        this.db.exec(statement);
      }
    }
  }
}

function mapOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    customerId: row.customer_id ?? null,
    workOrderNo: row.work_order_no,
    designFee: Number(row.design_fee),
    category: row.category,
    designSize: row.design_size ?? "",
    status: normalizeOrderStatus(row.status),
    customerNickname: row.customer_nickname,
    customerWechat: row.customer_wechat,
    customerPhone: row.customer_phone ?? "",
    shippingAddress: row.shipping_address ?? "",
    trackingNumber: row.tracking_number ?? "",
    wechatQrPath: row.wechat_qr_path ?? null,
    wechatQrOriginalName: row.wechat_qr_original_name ?? null,
    trashedAt: row.trashed_at ?? null,
    orderTime: row.order_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCustomer(row: CustomerRow): CustomerProfile {
  return {
    id: row.id,
    customerNickname: row.customer_nickname,
    customerWechat: row.customer_wechat,
    customerPhone: row.customer_phone,
    shippingAddress: row.shipping_address,
    orderCount: Number(row.order_count ?? 0),
    completedOrderCount: Number(row.completed_order_count ?? 0),
    totalDesignFee: Number(row.total_design_fee ?? 0),
    lastOrderTime: row.last_order_time ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeCustomerIdentity(input: CustomerLookupInput & { shippingAddress?: string }): Required<CustomerLookupInput> & {
  shippingAddress: string;
} {
  return {
    customerNickname: input.customerNickname?.trim() ?? "",
    customerWechat: input.customerWechat?.trim() ?? "",
    customerPhone: input.customerPhone?.trim() ?? "",
    shippingAddress: input.shippingAddress?.trim() ?? ""
  };
}

function mapFile(row: FileRow): OrderFile {
  return {
    id: row.id,
    orderId: row.order_id,
    originalName: row.original_name,
    storedPath: row.stored_path,
    fileType: row.file_type,
    extension: row.extension,
    size: Number(row.size),
    uploadedAt: row.uploaded_at
  };
}

function mapArchivedFile(row: ArchivedFileRow): ArchivedFile {
  return {
    ...mapFile(row),
    workOrderNo: row.work_order_no,
    customerNickname: row.customer_nickname,
    customerWechat: row.customer_wechat,
    category: row.category,
    designSize: row.design_size ?? "",
    orderStatus: normalizeOrderStatus(row.order_status),
    orderTime: row.order_time
  };
}

function sanitizeFileName(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return sanitized || "order";
}

function listFilesRecursively(folder: string): string[] {
  const entries = fs.readdirSync(folder, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function shouldSkipSyncedFile(fileName: string): boolean {
  return path.basename(fileName).toLowerCase().startsWith("wechat-qr");
}

function normalizeStoredPath(filePath: string): string {
  return path.normalize(filePath).toLowerCase();
}

function getFileTimestamp(stats: fs.Stats): string {
  const timestamp = stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime;
  return timestamp.toISOString();
}

async function uniqueDestination(folder: string, originalName: string): Promise<string> {
  const safeOriginal = sanitizeFileName(originalName);
  const parsed = path.parse(safeOriginal);
  let candidate = path.join(folder, safeOriginal);
  let index = 1;

  while (await pathExists(candidate)) {
    const suffix = `-${index.toString().padStart(2, "0")}`;
    candidate = path.join(folder, `${parsed.name}${suffix}${parsed.ext}`);
    index += 1;
  }

  return candidate;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeStoredFile(root: string, filePath: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(filePath);

  if (!isPathInside(resolvedRoot, resolvedFile)) return;

  await fs.promises.rm(resolvedFile, { force: true }).catch(() => undefined);

  const parent = path.dirname(resolvedFile);
  if (!isPathInside(resolvedRoot, parent)) return;

  const remaining = await fs.promises.readdir(parent).catch(() => null);
  if (remaining && remaining.length === 0) {
    await fs.promises.rmdir(parent).catch(() => undefined);
  }
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}
