import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  Edit3,
  FileArchive,
  FileImage,
  FileText,
  FolderOpen,
  HardDrive,
  Layers3,
  MapPin,
  Phone,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  UsersRound,
  WalletCards,
  X
} from "lucide-react";
import { DESIGN_CATEGORIES } from "../shared/categories";
import { getOrderStatusOption, ORDER_STATUS_OPTIONS, type OrderStatus } from "../shared/statuses";
import { validateOrderInput, type OrderFormErrors } from "../shared/validation";
import type {
  AppUpdateInfo,
  ArchivedFile,
  CustomerDetail,
  CustomerProfile,
  OrderDetail,
  OrderFile,
  OrderInput,
  OrderSummary,
  QuickPhrase,
  StorageBackupResult,
  StorageInfo
} from "../shared/types";

interface OrderFormState {
  workOrderNo: string;
  designFee: string;
  category: string;
  designSize: string;
  customerNickname: string;
  customerWechat: string;
  customerPhone: string;
  shippingAddress: string;
  trackingNumber: string;
  orderTime: string;
}

interface QuickPhraseFormState {
  title: string;
  content: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  maxHeight: number;
  order: OrderSummary;
}

interface RecognizedCustomerInfo {
  nickname?: string;
  wechat?: string;
  phone?: string;
  address?: string;
  designSize?: string;
}

type ActiveView = "orders" | "customers" | "quickPhrases" | "archive" | "trash" | "fees" | "data";
type StatusFilterValue = "all" | OrderStatus;
type OrderQuickFilter = "all" | "today" | "wechat_pending" | "designing" | "finished_uploaded";
type OrderDisplayMode = "table" | "board";

const allCategoryLabel = "全部";
const categoryFilters = [allCategoryLabel, ...DESIGN_CATEGORIES];
const statusFilterOptions: Array<{
  value: StatusFilterValue;
  label: string;
  tone: "neutral" | "amber" | "blue" | "green";
}> = [
  { value: "all", label: "全部标记", tone: "neutral" },
  ...ORDER_STATUS_OPTIONS.filter((option) => option.value !== "none")
];
const boardStatusColumns = ORDER_STATUS_OPTIONS.filter((option) => option.value !== "none");
const contextMenuWidth = 220;
const contextMenuEstimatedHeight = 326;
const contextMenuMargin = 12;

function createEmptyForm(): OrderFormState {
  return {
    workOrderNo: "",
    designFee: "",
    category: DESIGN_CATEGORIES[0],
    designSize: "",
    customerNickname: "",
    customerWechat: "",
    customerPhone: "",
    shippingAddress: "",
    trackingNumber: "",
    orderTime: toDateTimeInputValue(new Date())
  };
}

function createFormFromOrder(order: OrderSummary | OrderDetail): OrderFormState {
  return {
    workOrderNo: order.workOrderNo,
    designFee: String(order.designFee),
    category: order.category,
    designSize: order.designSize,
    customerNickname: order.customerNickname,
    customerWechat: order.customerWechat,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    trackingNumber: order.trackingNumber,
    orderTime: toDateTimeInputValue(new Date(order.orderTime))
  };
}

function getCustomerLookupKey(form: OrderFormState): string {
  const wechat = form.customerWechat.trim().toLowerCase();
  const phone = form.customerPhone.trim();
  const nickname = form.customerNickname.trim();
  if (wechat) return `wechat:${wechat}`;
  if (phone) return `phone:${phone}`;
  if (nickname.length >= 2) return `nickname:${nickname}`;
  return "";
}

function fillEmptyCustomerFields(form: OrderFormState, customer: CustomerProfile): OrderFormState {
  const next = {
    ...form,
    customerNickname: form.customerNickname.trim() ? form.customerNickname : customer.customerNickname,
    customerWechat: form.customerWechat.trim() ? form.customerWechat : customer.customerWechat,
    customerPhone: form.customerPhone.trim() ? form.customerPhone : customer.customerPhone,
    shippingAddress: form.shippingAddress.trim() ? form.shippingAddress : customer.shippingAddress
  };

  return next.customerNickname === form.customerNickname &&
    next.customerWechat === form.customerWechat &&
    next.customerPhone === form.customerPhone &&
    next.shippingAddress === form.shippingAddress
    ? form
    : next;
}

function getCustomerIdentityLabel(customer: Pick<CustomerProfile, "customerNickname" | "customerPhone" | "customerWechat">): string {
  if (customer.customerWechat) return `微信：${customer.customerWechat}`;
  if (customer.customerPhone) return `手机号：${customer.customerPhone}`;
  return `网名：${customer.customerNickname || "未命名"}`;
}

function getContextMenuState(clientX: number, clientY: number, order: OrderSummary): ContextMenuState {
  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 800;
  const maxX = viewportWidth - contextMenuWidth - contextMenuMargin;
  const maxY = viewportHeight - contextMenuEstimatedHeight - contextMenuMargin;
  const x = Math.max(contextMenuMargin, Math.min(clientX, maxX));
  const y = Math.max(contextMenuMargin, Math.min(clientY, maxY));

  return {
    x,
    y,
    maxHeight: Math.max(180, viewportHeight - y - contextMenuMargin),
    order
  };
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>("orders");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [trashedOrders, setTrashedOrders] = useState<OrderSummary[]>([]);
  const [archivedFiles, setArchivedFiles] = useState<ArchivedFile[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [quickPhrases, setQuickPhrases] = useState<QuickPhrase[]>([]);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [lastBackupResult, setLastBackupResult] = useState<StorageBackupResult | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [query, setQuery] = useState("");
  const [trashQuery, setTrashQuery] = useState("");
  const [archiveQuery, setArchiveQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [quickPhraseQuery, setQuickPhraseQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(allCategoryLabel);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [orderDisplayMode, setOrderDisplayMode] = useState<OrderDisplayMode>("table");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingQuickPhraseId, setEditingQuickPhraseId] = useState<string | null>(null);
  const [smartText, setSmartText] = useState("");
  const [form, setForm] = useState<OrderFormState>(() => createEmptyForm());
  const [quickPhraseForm, setQuickPhraseForm] = useState<QuickPhraseFormState>({ title: "", content: "" });
  const [formErrors, setFormErrors] = useState<OrderFormErrors>({});
  const [pendingWechatQrSourcePath, setPendingWechatQrSourcePath] = useState("");
  const [pendingWechatQrName, setPendingWechatQrName] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderSummary | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<OrderSummary | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isDeleting, setDeleting] = useState(false);
  const [isPermanentlyDeleting, setPermanentlyDeleting] = useState(false);
  const [isSavingQuickPhrase, setSavingQuickPhrase] = useState(false);
  const [isUploading, setUploading] = useState(false);
  const [isQrUploading, setQrUploading] = useState(false);
  const [isExportingBackup, setExportingBackup] = useState(false);
  const [isCheckingUpdate, setCheckingUpdate] = useState(false);
  const [isUpdatingApp, setUpdatingApp] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const lastCustomerLookupKey = useRef("");

  useEffect(() => {
    void refreshOrders();
    void refreshTrashedOrders();
    void refreshCustomers();
    void refreshQuickPhrases();
    void refreshStorageInfo();
    void checkAppUpdateOnStart();
  }, []);

  useEffect(() => {
    if (activeView === "archive") {
      void refreshArchivedFiles();
    }
    if (activeView === "trash") {
      void refreshTrashedOrders();
    }
    if (activeView === "customers") {
      void refreshCustomers();
    }
    if (activeView === "quickPhrases") {
      void refreshQuickPhrases();
    }
    if (activeView === "data") {
      void refreshStorageInfo();
    }
  }, [activeView]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedCustomer(null);
      return;
    }

    let alive = true;
    window.orderApi.getCustomer(selectedCustomerId).then((customer) => {
      if (alive) setSelectedCustomer(customer);
    });

    return () => {
      alive = false;
    };
  }, [selectedCustomerId]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrder(null);
      return;
    }

    let alive = true;
    window.orderApi.getOrder(selectedOrderId).then((order) => {
      if (alive) setSelectedOrder(order);
    });

    return () => {
      alive = false;
    };
  }, [selectedOrderId]);

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (dialogMode !== "create") return;

    const lookupKey = getCustomerLookupKey(form);
    if (!lookupKey || lookupKey === lastCustomerLookupKey.current) return;

    const timer = window.setTimeout(() => {
      lastCustomerLookupKey.current = lookupKey;
      void window.orderApi
        .lookupCustomer({
          customerNickname: form.customerNickname,
          customerWechat: form.customerWechat,
          customerPhone: form.customerPhone
        })
        .then((customer) => {
          if (!customer) return;

          setForm((current) => {
            const next = fillEmptyCustomerFields(current, customer);
            if (next === current) return current;
            showToast("已带出老客户资料");
            return next;
          });
        })
        .catch(() => undefined);
    }, 360);

    return () => window.clearTimeout(timer);
  }, [dialogMode, form.customerNickname, form.customerPhone, form.customerWechat]);

  useEffect(() => {
    function closeFloatingUi() {
      setContextMenu(null);
    }

    window.addEventListener("click", closeFloatingUi);
    window.addEventListener("resize", closeFloatingUi);
    return () => {
      window.removeEventListener("click", closeFloatingUi);
      window.removeEventListener("resize", closeFloatingUi);
    };
  }, []);

  useEffect(() => {
    function refreshWhenFocused() {
      void window.orderApi.listOrders().then(setOrders);
      void window.orderApi.listTrashedOrders().then(setTrashedOrders);
      void window.orderApi.listCustomers().then(setCustomers);
      if (activeView === "quickPhrases") {
        void window.orderApi.listQuickPhrases().then(setQuickPhrases);
      }
      if (selectedOrderId) {
        void window.orderApi.getOrder(selectedOrderId).then(setSelectedOrder);
      }
      if (selectedCustomerId) {
        void window.orderApi.getCustomer(selectedCustomerId).then(setSelectedCustomer);
      }
      if (activeView === "archive") {
        void window.orderApi.listFiles().then(setArchivedFiles);
      }
    }

    window.addEventListener("focus", refreshWhenFocused);
    return () => window.removeEventListener("focus", refreshWhenFocused);
  }, [activeView, selectedCustomerId, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return orders.filter((order) => {
      const statusLabel = getOrderStatusOption(order.status).label;
      const matchesCategory = categoryFilter === allCategoryLabel || order.category === categoryFilter;
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesDate = isWithinDateRange(order.orderTime, dateFrom, dateTo);
      const matchesQuery =
        !normalizedQuery ||
        [
          order.workOrderNo,
          order.customerNickname,
          order.customerWechat,
          order.customerPhone,
          order.shippingAddress,
          order.trackingNumber,
          order.designSize,
          order.category,
          statusLabel
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesStatus && matchesDate && matchesQuery;
    });
  }, [orders, query, categoryFilter, statusFilter, dateFrom, dateTo]);

  const filteredTrashedOrders = useMemo(() => {
    const normalizedQuery = trashQuery.trim().toLowerCase();
    if (!normalizedQuery) return trashedOrders;

    return trashedOrders.filter((order) =>
      [
        order.workOrderNo,
        order.customerNickname,
        order.customerWechat,
        order.customerPhone,
        order.shippingAddress,
        order.trackingNumber,
        order.designSize,
        order.category,
        getOrderStatusOption(order.status).label
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [trashQuery, trashedOrders]);

  const filteredArchivedFiles = useMemo(() => {
    const normalizedQuery = archiveQuery.trim().toLowerCase();
    if (!normalizedQuery) return archivedFiles;

    return archivedFiles.filter((file) =>
      [
        file.originalName,
        file.fileType,
        file.extension,
        file.workOrderNo,
        file.customerNickname,
        file.customerWechat,
        file.designSize,
        file.category,
        getOrderStatusOption(file.orderStatus).label
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [archiveQuery, archivedFiles]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = customerQuery.trim().toLowerCase();
    if (!normalizedQuery) return customers;

    return customers.filter((customer) =>
      [
        customer.customerNickname,
        customer.customerWechat,
        customer.customerPhone,
        customer.shippingAddress
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [customerQuery, customers]);

  const filteredQuickPhrases = useMemo(() => {
    const normalizedQuery = quickPhraseQuery.trim().toLowerCase();
    if (!normalizedQuery) return quickPhrases;

    return quickPhrases.filter((phrase) =>
      [phrase.title, phrase.content]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [quickPhraseQuery, quickPhrases]);

  const stats = useMemo(() => {
    const completedOrders = orders.filter((order) => order.status === "finished_uploaded");
    const now = new Date();
    const weekStart = getLocalWeekStart(now);
    const nextWeekStart = addDays(weekStart, 7);

    return completedOrders.reduce(
      (acc, order) => {
        const orderTime = new Date(order.orderTime);
        acc.totalFee += order.designFee;
        if (isSameLocalDay(orderTime, now)) acc.todayFee += order.designFee;
        if (orderTime >= weekStart && orderTime < nextWeekStart) acc.weekFee += order.designFee;
        if (isSameLocalMonth(orderTime, now)) acc.monthFee += order.designFee;
        acc.completedCount += 1;
        return acc;
      },
      { totalFee: 0, todayFee: 0, weekFee: 0, monthFee: 0, completedCount: 0 }
    );
  }, [orders]);

  const orderOverview = useMemo(() => {
    const now = new Date();
    return {
      total: orders.length,
      today: orders.filter((order) => isSameLocalDay(new Date(order.orderTime), now)).length,
      wechatPending: orders.filter((order) => order.status === "wechat_pending").length,
      designing: orders.filter((order) => order.status === "designing").length,
      finished: orders.filter((order) => order.status === "finished_uploaded").length,
      trashed: trashedOrders.length
    };
  }, [orders, trashedOrders.length]);
  const todayDateFilter = toDateInputValue(new Date());
  const isOrderFilterClear =
    query.trim() === "" &&
    categoryFilter === allCategoryLabel &&
    statusFilter === "all" &&
    !dateFrom &&
    !dateTo;

  const archiveOverview = useMemo(() => {
    return {
      total: archivedFiles.length,
      images: archivedFiles.filter((file) => file.fileType === "图片文件").length,
      sourceFiles: archivedFiles.filter((file) => ["CorelDRAW", "Photoshop", "Illustrator"].includes(file.fileType)).length,
      packages: archivedFiles.filter((file) => file.fileType === "压缩包").length
    };
  }, [archivedFiles]);

  const customerOverview = useMemo(() => {
    return {
      total: customers.length,
      withWechat: customers.filter((customer) => customer.customerWechat).length,
      withPhone: customers.filter((customer) => customer.customerPhone).length,
      repeatCustomers: customers.filter((customer) => customer.orderCount > 1).length
    };
  }, [customers]);

  const feeSummary = useMemo(() => {
    const completedOrders = orders.filter((order) => order.status === "finished_uploaded");
    const byCategory = DESIGN_CATEGORIES.map((category) => {
      const categoryOrders = completedOrders.filter((order) => order.category === category);
      return {
        category,
        count: categoryOrders.length,
        total: categoryOrders.reduce((sum, order) => sum + order.designFee, 0)
      };
    });
    const maxCategoryTotal = Math.max(1, ...byCategory.map((item) => item.total));
    const highestOrder = completedOrders.reduce<OrderSummary | null>(
      (best, order) => (!best || order.designFee > best.designFee ? order : best),
      null
    );

    return {
      byCategory,
      maxCategoryTotal,
      totalFee: stats.totalFee,
      todayFee: stats.todayFee,
      weekFee: stats.weekFee,
      monthFee: stats.monthFee,
      completedCount: stats.completedCount,
      averageFee: stats.completedCount > 0 ? stats.totalFee / stats.completedCount : 0,
      highestOrder
    };
  }, [orders, stats.completedCount, stats.monthFee, stats.todayFee, stats.totalFee, stats.weekFee]);

  const title =
    activeView === "orders"
      ? "客户订单管理系统"
      : activeView === "customers"
        ? "客户资料库"
        : activeView === "quickPhrases"
          ? "常用快捷语"
          : activeView === "archive"
            ? "文件归档"
            : activeView === "trash"
              ? "垃圾箱"
              : activeView === "fees"
                ? "费用总览"
                : "数据中心";
  const eyebrow =
    activeView === "orders"
      ? "订单工作台"
      : activeView === "customers"
        ? "老客户自动补全"
        : activeView === "quickPhrases"
          ? "一键复制常用话术"
          : activeView === "archive"
            ? "全部订单附件"
            : activeView === "trash"
              ? "可恢复的订单"
              : activeView === "fees"
                ? "设计费统计"
                : "本机数据位置";

  async function refreshOrders() {
    const nextOrders = await window.orderApi.listOrders();
    setOrders(nextOrders);
  }

  async function refreshTrashedOrders() {
    const nextOrders = await window.orderApi.listTrashedOrders();
    setTrashedOrders(nextOrders);
  }

  async function refreshArchivedFiles() {
    const files = await window.orderApi.listFiles();
    setArchivedFiles(files);
  }

  async function refreshCustomers() {
    const nextCustomers = await window.orderApi.listCustomers();
    setCustomers(nextCustomers);
  }

  async function refreshQuickPhrases() {
    const nextQuickPhrases = await window.orderApi.listQuickPhrases();
    setQuickPhrases(nextQuickPhrases);
  }

  async function refreshStorageInfo() {
    const info = await window.orderApi.getStorageInfo();
    setStorageInfo(info);
  }

  async function refreshCurrentView() {
    await refreshOrders();
    await refreshSelectedOrder();
    await refreshCustomers();
    if (activeView === "archive") {
      await refreshArchivedFiles();
    }
    if (activeView === "trash") {
      await refreshTrashedOrders();
    }
    if (activeView === "quickPhrases") {
      await refreshQuickPhrases();
    }
    if (activeView === "data") {
      await refreshStorageInfo();
    }
  }

  async function refreshSelectedOrder(orderId = selectedOrderId) {
    if (!orderId) return;
    const detail = await window.orderApi.getOrder(orderId);
    setSelectedOrder(detail);
  }

  function applyOrderQuickFilter(filter: OrderQuickFilter) {
    const today = toDateInputValue(new Date());
    setActiveView("orders");
    setQuery("");
    setCategoryFilter(allCategoryLabel);

    if (filter === "today") {
      setStatusFilter("all");
      setDateFrom(today);
      setDateTo(today);
      showToast("已筛选今日订单");
      return;
    }

    setDateFrom("");
    setDateTo("");
    if (filter === "all") {
      setStatusFilter("all");
      showToast("已显示全部订单");
      return;
    }

    setStatusFilter(filter);
    showToast(`已筛选：${getOrderStatusOption(filter).label}`);
  }

  function openCreateDialog() {
    setActiveView("orders");
    setForm(createEmptyForm());
    setSmartText("");
    setFormErrors({});
    setPendingWechatQrSourcePath("");
    setPendingWechatQrName("");
    setEditingOrderId(null);
    setDialogMode("create");
  }

  function openEditDialog(order: OrderSummary | OrderDetail) {
    setContextMenu(null);
    setSelectedOrderId(order.id);
    setForm(createFormFromOrder(order));
    setSmartText("");
    setFormErrors({});
    setPendingWechatQrSourcePath("");
    setPendingWechatQrName("");
    setEditingOrderId(order.id);
    setDialogMode("edit");
  }

  function closeOrderDialog() {
    setDialogMode(null);
    setEditingOrderId(null);
    setSmartText("");
    setFormErrors({});
    setPendingWechatQrSourcePath("");
    setPendingWechatQrName("");
  }

  function handleSmartTextChange(value: string) {
    setSmartText(value);
    const recognized = recognizeCustomerInfo(value);

    setForm((current) => ({
      ...current,
      customerNickname: recognized.nickname ?? current.customerNickname,
      customerWechat: recognized.wechat ?? current.customerWechat,
      customerPhone: recognized.phone ?? current.customerPhone,
      shippingAddress: recognized.address ?? current.shippingAddress,
      designSize: recognized.designSize ?? current.designSize
    }));
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: OrderInput = {
      ...form,
      orderTime: new Date(form.orderTime).toISOString()
    };
    const errors = validateOrderInput(input);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setSaving(true);
      let saved =
        dialogMode === "edit" && editingOrderId
          ? await window.orderApi.updateOrder({ id: editingOrderId, ...input })
          : await window.orderApi.createOrder(input);

      if (dialogMode === "create" && pendingWechatQrSourcePath) {
        saved = await window.orderApi.setWechatQr(saved.id, pendingWechatQrSourcePath);
      }

      await refreshOrders();
      await refreshCustomers();
      if (activeView === "archive") await refreshArchivedFiles();
      setSelectedOrderId(saved.id);
      setSelectedOrder(saved);
      closeOrderDialog();
      showToast(dialogMode === "edit" ? "订单已更新" : pendingWechatQrSourcePath ? "订单已创建，二维码已上传" : "订单已创建");
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(order: OrderSummary, status: OrderStatus) {
    try {
      setContextMenu(null);
      const updated = await window.orderApi.updateOrderStatus(order.id, status);
      await refreshOrders();
      await refreshCustomers();
      if (activeView === "archive") await refreshArchivedFiles();
      if (selectedOrderId === order.id) {
        setSelectedOrder(updated);
      }
      showToast(`已标注：${getOrderStatusOption(status).label}`);
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function uploadWechatQr(orderId = selectedOrderId) {
    if (!orderId) return;

    try {
      setQrUploading(true);
      const updated = await window.orderApi.pickWechatQr(orderId);
      if (updated) {
        await refreshOrders();
        setSelectedOrder(updated);
        setSelectedOrderId(updated.id);
        showToast("微信二维码已上传");
      }
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setQrUploading(false);
    }
  }

  async function uploadWechatQrFromFiles(files: FileList, orderId = selectedOrderId) {
    if (!orderId || files.length === 0) return;

    const sourcePath = window.orderApi.getFilePath(files[0]);
    if (!sourcePath) {
      showToast("未读取到二维码文件路径");
      return;
    }

    try {
      setQrUploading(true);
      const updated = await window.orderApi.setWechatQr(orderId, sourcePath);
      await refreshOrders();
      setSelectedOrder(updated);
      setSelectedOrderId(updated.id);
      showToast("微信二维码已上传");
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setQrUploading(false);
    }
  }

  function stageWechatQrFromFiles(files: FileList) {
    if (files.length === 0) return;

    const file = files[0];
    const sourcePath = window.orderApi.getFilePath(file);
    if (!sourcePath) {
      showToast("未读取到二维码文件路径");
      return;
    }

    setPendingWechatQrSourcePath(sourcePath);
    setPendingWechatQrName(file.name);
    showToast("二维码已暂存，保存订单后自动上传");
  }

  async function confirmDeleteOrder() {
    if (!deleteTarget) return;

    try {
      setDeleting(true);
      await window.orderApi.deleteOrder(deleteTarget.id);
      const nextOrders = await window.orderApi.listOrders();
      const nextTrashedOrders = await window.orderApi.listTrashedOrders();
      setOrders(nextOrders);
      setTrashedOrders(nextTrashedOrders);
      await refreshCustomers();
      if (activeView === "archive") await refreshArchivedFiles();

      if (selectedOrderId === deleteTarget.id) {
        setSelectedOrderId(nextOrders[0]?.id ?? null);
      }

      setDeleteTarget(null);
      showToast("订单已移入垃圾箱");
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  async function restoreTrashedOrder(order: OrderSummary) {
    try {
      const restored = await window.orderApi.restoreOrder(order.id);
      await refreshOrders();
      await refreshTrashedOrders();
      await refreshCustomers();
      setSelectedOrderId(restored.id);
      setSelectedOrder(restored);
      setActiveView("orders");
      showToast("订单已恢复");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function confirmPermanentlyDeleteOrder() {
    if (!permanentDeleteTarget) return;

    try {
      setPermanentlyDeleting(true);
      await window.orderApi.permanentlyDeleteOrder(permanentDeleteTarget.id);
      const nextTrashedOrders = await window.orderApi.listTrashedOrders();
      setTrashedOrders(nextTrashedOrders);
      await refreshCustomers();
      if (selectedOrderId === permanentDeleteTarget.id) {
        setSelectedOrderId(orders[0]?.id ?? null);
      }
      setPermanentDeleteTarget(null);
      showToast("订单已永久删除");
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setPermanentlyDeleting(false);
    }
  }

  async function uploadByDialog() {
    if (!selectedOrderId) return;
    try {
      setUploading(true);
      const added = await window.orderApi.pickAndAttachFiles(selectedOrderId);
      if (added.length > 0) {
        await refreshSelectedOrder();
        await refreshOrders();
        if (activeView === "archive") await refreshArchivedFiles();
        showToast(`已上传 ${added.length} 个文件`);
      }
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function uploadDroppedFiles(files: FileList) {
    if (!selectedOrderId || files.length === 0) return;

    const sourcePaths = Array.from(files)
      .map((file) => window.orderApi.getFilePath(file))
      .filter(Boolean);

    if (sourcePaths.length === 0) {
      showToast("未读取到文件路径");
      return;
    }

    try {
      setUploading(true);
      const added = await window.orderApi.attachFiles(selectedOrderId, sourcePaths);
      await refreshSelectedOrder();
      await refreshOrders();
      if (activeView === "archive") await refreshArchivedFiles();
      showToast(`已上传 ${added.length} 个文件`);
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setUploading(false);
      setDragging(false);
    }
  }

  async function openOrderFolder(orderId = selectedOrderId) {
    if (!orderId) return;

    try {
      await window.orderApi.openOrderFolder(orderId);
      await refreshOrders();
      await refreshSelectedOrder(orderId);
      if (activeView === "archive") await refreshArchivedFiles();
      showToast("已打开客户文件夹");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function refreshOrderFiles(orderId = selectedOrderId) {
    if (!orderId) return;

    try {
      const detail = await window.orderApi.getOrder(orderId);
      await refreshOrders();
      if (activeView === "archive") await refreshArchivedFiles();
      setSelectedOrder(detail);
      showToast("文件列表已刷新");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function openDataRoot() {
    try {
      await window.orderApi.openDataRoot();
      showToast("已打开数据目录");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function openFilesRoot() {
    try {
      await window.orderApi.openFilesRoot();
      showToast("已打开客户文件目录");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function revealDatabase() {
    try {
      await window.orderApi.revealDatabase();
      showToast("已定位数据库文件");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function exportBackup() {
    try {
      setExportingBackup(true);
      const result = await window.orderApi.exportBackup();
      if (!result) {
        showToast("已取消导出备份");
        return;
      }
      setLastBackupResult(result);
      showToast("备份已导出");
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setExportingBackup(false);
    }
  }

  async function openBackupFolder(backupPath: string) {
    try {
      await window.orderApi.openBackupFolder(backupPath);
      showToast("已打开备份目录");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  async function checkAppUpdateOnStart() {
    try {
      const update = await window.orderApi.checkAppUpdate();
      if (update?.hasUpdate) {
        setAvailableUpdate(update);
      }
    } catch {
      // Startup update checks should never block daily work.
    }
  }

  async function checkAppUpdateManually() {
    try {
      setCheckingUpdate(true);
      const update = await window.orderApi.checkAppUpdate();
      if (update?.hasUpdate) {
        setAvailableUpdate(update);
        showToast("发现可用更新");
        return;
      }
      showToast("当前已经是最新版");
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function updateAppFromFolder(sourcePath?: string) {
    try {
      setUpdatingApp(true);
      const result = await window.orderApi.updateAppFromFolder(sourcePath);
      if (!result) {
        showToast("已取消更新");
        setUpdatingApp(false);
        return;
      }
      showToast(`正在更新到 ${result.sourceVersion}，应用会自动重启`);
    } catch (error) {
      setUpdatingApp(false);
      showToast(getErrorMessage(error));
    }
  }

  async function applyAvailableUpdate(update: AppUpdateInfo) {
    try {
      setUpdatingApp(true);
      if (update.sourceKind === "github-release") {
        const result = await window.orderApi.installRemoteUpdate(update.sourceVersion);
        showToast(`正在安装 ${result.sourceVersion}，应用会自动重启`);
        return;
      }

      if (!update.sourcePath) {
        throw new Error("缺少新版目录，请重新检查更新");
      }
      const result = await window.orderApi.updateAppFromFolder(update.sourcePath);
      if (!result) {
        showToast("已取消更新");
        setUpdatingApp(false);
        return;
      }
      showToast(`正在更新到 ${result.sourceVersion}，应用会自动重启`);
    } catch (error) {
      setUpdatingApp(false);
      showToast(getErrorMessage(error));
    }
  }

  function resetQuickPhraseForm() {
    setEditingQuickPhraseId(null);
    setQuickPhraseForm({ title: "", content: "" });
  }

  function editQuickPhrase(phrase: QuickPhrase) {
    setEditingQuickPhraseId(phrase.id);
    setQuickPhraseForm({ title: phrase.title, content: phrase.content });
  }

  async function submitQuickPhrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!quickPhraseForm.content.trim()) {
      showToast("先填写快捷语内容");
      return;
    }

    try {
      setSavingQuickPhrase(true);
      if (editingQuickPhraseId) {
        await window.orderApi.updateQuickPhrase({ id: editingQuickPhraseId, ...quickPhraseForm });
        showToast("快捷语已更新");
      } else {
        await window.orderApi.createQuickPhrase(quickPhraseForm);
        showToast("快捷语已添加");
      }
      await refreshQuickPhrases();
      resetQuickPhraseForm();
    } catch (error) {
      showToast(getErrorMessage(error));
    } finally {
      setSavingQuickPhrase(false);
    }
  }

  async function deleteQuickPhrase(phrase: QuickPhrase) {
    try {
      await window.orderApi.deleteQuickPhrase(phrase.id);
      await refreshQuickPhrases();
      if (editingQuickPhraseId === phrase.id) {
        resetQuickPhraseForm();
      }
      showToast("快捷语已删除");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, orderId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedOrderId(orderId);
    }
  }

  function copyValue(label: string, value: string) {
    const text = value.trim();
    if (!text) return;
    window.orderApi.copyText(text);
    showToast(`已复制${label}`);
  }

  async function updateTrackingNumber(value: string) {
    if (!selectedOrder) return;

    try {
      const updated = await window.orderApi.updateOrder({
        id: selectedOrder.id,
        workOrderNo: selectedOrder.workOrderNo,
        designFee: selectedOrder.designFee,
        category: selectedOrder.category,
        designSize: selectedOrder.designSize,
        customerNickname: selectedOrder.customerNickname,
        customerWechat: selectedOrder.customerWechat,
        customerPhone: selectedOrder.customerPhone,
        shippingAddress: selectedOrder.shippingAddress,
        trackingNumber: value,
        orderTime: selectedOrder.orderTime
      });
      await refreshOrders();
      setSelectedOrder(updated);
      showToast("快递单号已更新");
    } catch (error) {
      showToast(getErrorMessage(error));
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }

  return (
    <div className={`app-shell ${activeView === "orders" ? "" : "app-shell-no-detail"}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">设</div>
          <div>
            <div className="brand-title">设计订单</div>
            <div className="brand-subtitle">Client Orders</div>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          <button
            className={`nav-item ${activeView === "orders" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("orders")}
          >
            <ReceiptText size={18} />
            <span>客户订单</span>
          </button>
          <button
            className={`nav-item ${activeView === "customers" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("customers")}
          >
            <UsersRound size={18} />
            <span>客户资料</span>
          </button>
          <button
            className={`nav-item ${activeView === "quickPhrases" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("quickPhrases")}
          >
            <Sparkles size={18} />
            <span>常用快捷语</span>
          </button>
          <button
            className={`nav-item ${activeView === "archive" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("archive")}
          >
            <Archive size={18} />
            <span>文件归档</span>
          </button>
          <button
            className={`nav-item ${activeView === "trash" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("trash")}
          >
            <Trash2 size={18} />
            <span>垃圾箱</span>
          </button>
          <button
            className={`nav-item ${activeView === "fees" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("fees")}
          >
            <WalletCards size={18} />
            <span>费用总览</span>
          </button>
          <button
            className={`nav-item ${activeView === "data" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("data")}
          >
            <Database size={18} />
            <span>数据中心</span>
          </button>
        </nav>

        <button className="sidebar-footer" type="button" onClick={() => setActiveView("data")}>
          <div className="storage-dot" />
          <span>本机 SQLite</span>
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" type="button" onClick={() => void refreshCurrentView()} aria-label="刷新">
              <RefreshCw size={18} />
            </button>
            {activeView === "orders" ? (
              <button className="primary-button" type="button" onClick={openCreateDialog}>
                <Plus size={18} />
                <span>新建订单</span>
              </button>
            ) : null}
            {activeView === "quickPhrases" ? (
              <button className="primary-button" type="button" onClick={resetQuickPhraseForm}>
                <Plus size={18} />
                <span>新增快捷语</span>
              </button>
            ) : null}
          </div>
        </header>

        {activeView === "orders" ? (
          <section className="metric-strip compact" aria-label="订单概览">
            <Metric label="订单数" value={orderOverview.total.toString()} icon={<ReceiptText size={18} />} onReveal={showToast} />
            <Metric label="今日订单" value={orderOverview.today.toString()} icon={<CalendarDays size={18} />} onReveal={showToast} />
            <Metric label="微信未加" value={orderOverview.wechatPending.toString()} icon={<WalletCards size={18} />} onReveal={showToast} />
            <Metric label="设计中" value={orderOverview.designing.toString()} icon={<RefreshCw size={18} />} onReveal={showToast} />
            <Metric label="已完稿上传" value={orderOverview.finished.toString()} icon={<CheckCircle2 size={18} />} onReveal={showToast} />
            <Metric
              label="垃圾箱"
              value={orderOverview.trashed.toString()}
              icon={<Trash2 size={18} />}
              tone="danger"
              onClick={() => setActiveView("trash")}
            />
          </section>
        ) : null}

        {activeView === "orders" ? (
          <section className="quick-filter-strip" aria-label="订单快捷筛选">
            <button className={isOrderFilterClear ? "active" : ""} type="button" onClick={() => applyOrderQuickFilter("all")}>
              全部订单
            </button>
            <button
              className={dateFrom === todayDateFilter && dateTo === todayDateFilter && statusFilter === "all" ? "active" : ""}
              type="button"
              onClick={() => applyOrderQuickFilter("today")}
            >
              今日订单
            </button>
            <button
              className={statusFilter === "wechat_pending" && !dateFrom && !dateTo ? "active" : ""}
              type="button"
              onClick={() => applyOrderQuickFilter("wechat_pending")}
            >
              微信未加
            </button>
            <button
              className={statusFilter === "designing" && !dateFrom && !dateTo ? "active" : ""}
              type="button"
              onClick={() => applyOrderQuickFilter("designing")}
            >
              设计中
            </button>
            <button
              className={statusFilter === "finished_uploaded" && !dateFrom && !dateTo ? "active" : ""}
              type="button"
              onClick={() => applyOrderQuickFilter("finished_uploaded")}
            >
              已完稿上传
            </button>
          </section>
        ) : null}

        {activeView === "archive" ? (
          <section className="metric-strip compact" aria-label="文件归档概览">
            <Metric label="附件总数" value={archiveOverview.total.toString()} icon={<FolderOpen size={18} />} onReveal={showToast} />
            <Metric label="图片文件" value={archiveOverview.images.toString()} icon={<FileImage size={18} />} onReveal={showToast} />
            <Metric label="设计源文件" value={archiveOverview.sourceFiles.toString()} icon={<FileText size={18} />} onReveal={showToast} />
            <Metric label="压缩包" value={archiveOverview.packages.toString()} icon={<FileArchive size={18} />} onReveal={showToast} />
          </section>
        ) : null}

        {activeView === "customers" ? (
          <section className="metric-strip compact" aria-label="客户资料概览">
            <Metric label="客户数" value={customerOverview.total.toString()} icon={<UsersRound size={18} />} onReveal={showToast} />
            <Metric label="有微信" value={customerOverview.withWechat.toString()} icon={<WalletCards size={18} />} onReveal={showToast} />
            <Metric label="有手机号" value={customerOverview.withPhone.toString()} icon={<Phone size={18} />} onReveal={showToast} />
            <Metric label="复购客户" value={customerOverview.repeatCustomers.toString()} icon={<RefreshCw size={18} />} onReveal={showToast} />
          </section>
        ) : null}

        {activeView === "orders" ? (
          <OrdersView
            categoryFilter={categoryFilter}
            categoryFilters={categoryFilters}
            dateFrom={dateFrom}
            dateTo={dateTo}
            displayMode={orderDisplayMode}
            filteredOrders={filteredOrders}
            onCategoryFilterChange={setCategoryFilter}
            onContextMenu={setContextMenu}
            onCopy={copyValue}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onDisplayModeChange={setOrderDisplayMode}
            onKeyDown={handleRowKeyDown}
            onOpenFolder={(orderId) => void openOrderFolder(orderId)}
            onQueryChange={setQuery}
            onResetDateFilter={() => {
              setDateFrom("");
              setDateTo("");
            }}
            onSelect={setSelectedOrderId}
            onStatusFilterChange={setStatusFilter}
            onUpdateStatus={(order, status) => void updateStatus(order, status)}
            query={query}
            selectedOrderId={selectedOrderId}
            statusFilter={statusFilter}
          />
        ) : null}

        {activeView === "archive" ? (
          <ArchiveView
            files={filteredArchivedFiles}
            onCopy={copyValue}
            onQueryChange={setArchiveQuery}
            onSelectOrder={(orderId) => {
              setSelectedOrderId(orderId);
              setActiveView("orders");
            }}
            query={archiveQuery}
            showToast={showToast}
          />
        ) : null}

        {activeView === "customers" ? (
          <CustomersView
            customers={filteredCustomers}
            onCopy={copyValue}
            onQueryChange={setCustomerQuery}
            onSelectCustomer={setSelectedCustomerId}
            onSelectOrder={(orderId) => {
              setSelectedOrderId(orderId);
              setActiveView("orders");
            }}
            query={customerQuery}
            selectedCustomer={selectedCustomer}
            selectedCustomerId={selectedCustomerId}
          />
        ) : null}

        {activeView === "quickPhrases" ? (
          <QuickPhrasesView
            draft={quickPhraseForm}
            editingId={editingQuickPhraseId}
            isSaving={isSavingQuickPhrase}
            onCopy={copyValue}
            onDelete={(phrase) => void deleteQuickPhrase(phrase)}
            onDraftChange={setQuickPhraseForm}
            onEdit={editQuickPhrase}
            onQueryChange={setQuickPhraseQuery}
            onReset={resetQuickPhraseForm}
            onSubmit={(event) => void submitQuickPhrase(event)}
            phrases={filteredQuickPhrases}
            query={quickPhraseQuery}
            totalCount={quickPhrases.length}
          />
        ) : null}

        {activeView === "trash" ? (
          <TrashView
            orders={filteredTrashedOrders}
            onPermanentDelete={setPermanentDeleteTarget}
            onQueryChange={setTrashQuery}
            onRestore={(order) => void restoreTrashedOrder(order)}
            query={trashQuery}
          />
        ) : null}

        {activeView === "fees" ? <FeesView summary={feeSummary} /> : null}
        {activeView === "data" ? (
          <DataCenterView
            isCheckingUpdate={isCheckingUpdate}
            isExportingBackup={isExportingBackup}
            isUpdatingApp={isUpdatingApp}
            lastBackupResult={lastBackupResult}
            onCheckUpdate={() => void checkAppUpdateManually()}
            onCopy={copyValue}
            onExportBackup={() => void exportBackup()}
            onOpenBackupFolder={(backupPath) => void openBackupFolder(backupPath)}
            onOpenDataRoot={() => void openDataRoot()}
            onOpenFilesRoot={() => void openFilesRoot()}
            onRevealDatabase={() => void revealDatabase()}
            onUpdateApp={() => void updateAppFromFolder()}
            storageInfo={storageInfo}
          />
        ) : null}
      </main>

      {activeView === "orders" ? (
        <aside className="detail-panel">
        {selectedOrder ? (
          <>
            <div className="detail-head">
              <div>
                <p className="eyebrow">订单详情</p>
                <h2>
                  <CopyField label="源单号" value={selectedOrder.workOrderNo} onCopy={copyValue} strong />
                </h2>
              </div>
              <div className="detail-head-actions">
                {selectedOrder.customerId ? (
                  <button
                    className="secondary-button compact-action"
                    type="button"
                    onClick={() => {
                      setSelectedCustomerId(selectedOrder.customerId);
                      setActiveView("customers");
                    }}
                  >
                    <UsersRound size={16} />
                    <span>客户</span>
                  </button>
                ) : null}
                <button className="secondary-button compact-action" type="button" onClick={() => openEditDialog(selectedOrder)}>
                  <Edit3 size={16} />
                  <span>编辑</span>
                </button>
              </div>
            </div>

            <div className="detail-fields">
              <DetailItem label="设计分类" value={selectedOrder.category} />
              <DetailItem label="设计尺寸" value={selectedOrder.designSize || "未填写"} />
              <DetailItem label="订单标记" value={<StatusBadge status={selectedOrder.status} />} />
              <DetailItem label="客户网名" value={selectedOrder.customerNickname} copyLabel="网名" onCopy={copyValue} />
              <DetailItem label="客户微信" value={selectedOrder.customerWechat || "未填写"} copyLabel="微信" onCopy={copyValue} />
              <DetailItem label="手机号" value={selectedOrder.customerPhone || "未填写"} copyLabel="手机号" onCopy={copyValue} />
              <DetailItem label="收货地址" value={selectedOrder.shippingAddress || "未填写"} copyLabel="地址" onCopy={copyValue} />
              <TrackingNumberItem
                onCopy={copyValue}
                onSave={(value) => void updateTrackingNumber(value)}
                value={selectedOrder.trackingNumber}
              />
              <DetailItem label="设计费" value={formatCurrency(selectedOrder.designFee)} />
              <DetailItem label="订单时间" value={formatDateTime(selectedOrder.orderTime)} />
            </div>

            <WechatQrCard
              isUploading={isQrUploading}
              order={selectedOrder}
              onDropUpload={(files) => void uploadWechatQrFromFiles(files, selectedOrder.id)}
              onUpload={() => void uploadWechatQr(selectedOrder.id)}
              onToast={showToast}
            />

            <div
              className={`drop-zone ${isDragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                void uploadDroppedFiles(event.dataTransfer.files);
              }}
            >
              <UploadCloud size={30} />
              <strong>{isUploading ? "上传中..." : "拖拽上传文件"}</strong>
              <span>cdr / psd / jpg / png / ai / pdf / zip / rar，图片文件会显示缩略图</span>
              <div className="drop-zone-actions">
                <button className="secondary-button" type="button" onClick={() => void uploadByDialog()} disabled={isUploading}>
                  <Plus size={16} />
                  <span>选择文件</span>
                </button>
                <button className="secondary-button" type="button" onClick={() => void openOrderFolder(selectedOrder.id)}>
                  <FolderOpen size={16} />
                  <span>进入客户文件夹</span>
                </button>
                <button className="secondary-button" type="button" onClick={() => void refreshOrderFiles(selectedOrder.id)}>
                  <RefreshCw size={16} />
                  <span>刷新文件</span>
                </button>
              </div>
            </div>

            <div className="file-section">
              <div className="section-title">
                <h3>订单文件</h3>
                <span>{selectedOrder.files.length} 个</span>
              </div>
              <div className="file-list">
                {selectedOrder.files.length === 0 ? (
                  <div className="file-empty">暂无上传文件</div>
                ) : (
                  selectedOrder.files.map((file) => <FileRow key={file.id} file={file} onToast={showToast} />)
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="detail-empty">
            <ChevronRight size={36} />
            <span>选择订单查看详情</span>
          </div>
        )}
        </aside>
      ) : null}

      {contextMenu ? (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y, maxHeight: contextMenu.maxHeight }}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => setSelectedOrderId(contextMenu.order.id)}>
            <ReceiptText size={16} />
            <span>查看详情</span>
          </button>
          <button type="button" onClick={() => openEditDialog(contextMenu.order)}>
            <Edit3 size={16} />
            <span>编辑订单</span>
          </button>
          <div className="context-menu-label">标记状态</div>
          {ORDER_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              className="status-menu-item"
              type="button"
              onClick={() => void updateStatus(contextMenu.order, option.value)}
            >
              <span className={`status-dot ${option.tone}`} />
              <span>{option.label}</span>
              {contextMenu.order.status === option.value ? <CheckCircle2 size={15} /> : null}
            </button>
          ))}
          <button
            className="danger-menu-item"
            type="button"
            onClick={() => {
              setDeleteTarget(contextMenu.order);
              setContextMenu(null);
            }}
          >
            <Trash2 size={16} />
            <span>移入垃圾箱</span>
          </button>
        </div>
      ) : null}

      {dialogMode ? (
        <OrderDialog
          dialogMode={dialogMode}
          editingOrderId={editingOrderId}
          errors={formErrors}
          form={form}
          isQrUploading={isQrUploading}
          isSaving={isSaving}
          onClose={closeOrderDialog}
          onFormChange={setForm}
          onSmartTextChange={handleSmartTextChange}
          onSubmit={submitOrder}
          onDropQr={(files) => {
            if (editingOrderId) {
              void uploadWechatQrFromFiles(files, editingOrderId);
              return;
            }
            stageWechatQrFromFiles(files);
          }}
          onStageCreateQr={stageWechatQrFromFiles}
          onUploadQr={() => editingOrderId && void uploadWechatQr(editingOrderId)}
          pendingQrName={pendingWechatQrName}
          selectedOrder={selectedOrder}
          smartText={smartText}
        />
      ) : null}

      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-label="确认移入垃圾箱">
            <div className="confirm-icon">
              <AlertTriangle size={24} />
            </div>
            <h2>移入垃圾箱？</h2>
            <p>
              将订单 <strong>{deleteTarget.workOrderNo}</strong> 移入垃圾箱，之后可以在垃圾箱中恢复。
            </p>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={() => void confirmDeleteOrder()} disabled={isDeleting}>
                <Trash2 size={18} />
                <span>{isDeleting ? "移动中..." : "移入垃圾箱"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {permanentDeleteTarget ? (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-label="确认永久删除订单">
            <div className="confirm-icon">
              <AlertTriangle size={24} />
            </div>
            <h2>永久删除订单？</h2>
            <p>
              将彻底删除订单 <strong>{permanentDeleteTarget.workOrderNo}</strong> 以及系统归档的附件文件。这个操作不可撤销。
            </p>
            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPermanentDeleteTarget(null)}
                disabled={isPermanentlyDeleting}
              >
                取消
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={() => void confirmPermanentlyDeleteOrder()}
                disabled={isPermanentlyDeleting}
              >
                <Trash2 size={18} />
                <span>{isPermanentlyDeleting ? "删除中..." : "永久删除"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {availableUpdate ? (
        <UpdatePrompt
          isUpdating={isUpdatingApp}
          update={availableUpdate}
          onApply={() => void applyAvailableUpdate(availableUpdate)}
          onDismiss={() => setAvailableUpdate(null)}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function UpdatePrompt({
  isUpdating,
  onApply,
  onDismiss,
  update
}: {
  isUpdating: boolean;
  onApply: () => void;
  onDismiss: () => void;
  update: AppUpdateInfo;
}) {
  const isRemoteUpdate = update.sourceKind === "github-release";
  const actionLabel = isRemoteUpdate ? "更新并重启" : "立即更新";
  const workingLabel = isRemoteUpdate ? "正在下载安装..." : "正在准备...";

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="confirm-modal update-modal" role="dialog" aria-modal="true" aria-label="发现新版本">
        <div className="confirm-icon">
          <RefreshCw size={24} />
        </div>
        <h2>发现新版本</h2>
        <p>
          当前版本 <strong>{update.currentVersion}</strong>，可更新到 <strong>{update.sourceVersion}</strong>。
        </p>
        <div className="update-meta">
          <span>更新来源：{isRemoteUpdate ? "GitHub Release" : "本地新版目录"}</span>
          <span>当前构建：{update.currentBuildTime ? formatDateTime(update.currentBuildTime) : "未知"}</span>
          <span>新版构建：{update.sourceBuildTime ? formatDateTime(update.sourceBuildTime) : "未知"}</span>
          {update.assetName ? (
            <span>
              安装包：{update.assetName}
              {update.assetSize ? ` · ${formatBytes(update.assetSize)}` : ""}
            </span>
          ) : null}
        </div>
        <div className="update-notes">
          <strong>更新内容</strong>
          <ul>
            {update.releaseNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onDismiss} disabled={isUpdating}>
            暂不更新
          </button>
          <button className="primary-button" type="button" onClick={onApply} disabled={isUpdating}>
            <RefreshCw size={18} />
            <span>{isUpdating ? workingLabel : actionLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderDialog({
  dialogMode,
  editingOrderId,
  errors,
  form,
  isQrUploading,
  isSaving,
  onClose,
  onFormChange,
  onStageCreateQr,
  onSmartTextChange,
  onSubmit,
  onDropQr,
  onUploadQr,
  pendingQrName,
  selectedOrder,
  smartText
}: {
  dialogMode: "create" | "edit";
  editingOrderId: string | null;
  errors: OrderFormErrors;
  form: OrderFormState;
  isQrUploading: boolean;
  isSaving: boolean;
  onClose: () => void;
  onFormChange: (form: OrderFormState) => void;
  onStageCreateQr: (files: FileList) => void;
  onSmartTextChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDropQr: (files: FileList) => void;
  onUploadQr: () => void;
  pendingQrName: string;
  selectedOrder: OrderDetail | null;
  smartText: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal order-editor-modal" role="dialog" aria-modal="true" aria-label={dialogMode === "edit" ? "编辑订单" : "新建订单"}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{dialogMode === "edit" ? "修改记录" : "新增记录"}</p>
            <h2>{dialogMode === "edit" ? "编辑订单" : "新建订单"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <form className="order-form enhanced" onSubmit={(event) => onSubmit(event)}>
          <div className="form-main">
            <section className="form-section">
              <SectionHeading icon={<ReceiptText size={17} />} title="基础订单" />
              <div className="form-grid">
                <FormField label="源单号" error={errors.workOrderNo}>
                  <input
                    value={form.workOrderNo}
                    onChange={(event) => onFormChange({ ...form, workOrderNo: event.target.value })}
                    placeholder="如 GD-20260512-001"
                  />
                </FormField>
                <FormField label="设计费" error={errors.designFee}>
                  <input
                    value={form.designFee}
                    onChange={(event) => onFormChange({ ...form, designFee: event.target.value })}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </FormField>
                <FormField label="设计分类" error={errors.category}>
                  <select value={form.category} onChange={(event) => onFormChange({ ...form, category: event.target.value })}>
                    {DESIGN_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="设计尺寸" error={errors.designSize}>
                  <input
                    value={form.designSize}
                    onChange={(event) => onFormChange({ ...form, designSize: event.target.value })}
                    placeholder="如 210×285mm / 90×54mm"
                  />
                </FormField>
                <FormField label="时间" error={errors.orderTime} wide>
                  <input
                    value={form.orderTime}
                    onChange={(event) => onFormChange({ ...form, orderTime: event.target.value })}
                    type="datetime-local"
                  />
                </FormField>
              </div>
            </section>

            <section className="form-section">
              <SectionHeading icon={<Sparkles size={17} />} title="智能识别" />
              <label className="smart-recognizer">
                <textarea
                  value={smartText}
                  onChange={(event) => onSmartTextChange(event.target.value)}
                  placeholder="粘贴客户信息，例如：张三 13800138000 微信 wx888 尺寸 210×285mm 上海市浦东新区..."
                />
              </label>
            </section>

            <section className="form-section">
              <SectionHeading icon={<WalletCards size={17} />} title="客户信息" />
              <div className="form-grid">
                <FormField label="客户网名" error={errors.customerNickname}>
                  <input
                    value={form.customerNickname}
                    onChange={(event) => onFormChange({ ...form, customerNickname: event.target.value })}
                    placeholder="客户昵称"
                  />
                </FormField>
                <FormField label="客户微信（选填）" error={errors.customerWechat}>
                  <input
                    value={form.customerWechat}
                    onChange={(event) => onFormChange({ ...form, customerWechat: event.target.value })}
                    placeholder="WeChat ID"
                  />
                </FormField>
                <FormField label="手机号" error={errors.customerPhone}>
                  <input
                    value={form.customerPhone}
                    onChange={(event) => onFormChange({ ...form, customerPhone: event.target.value })}
                    placeholder="13800138000"
                  />
                </FormField>
                <FormField label="收货地址" error={errors.shippingAddress} wide>
                  <input
                    value={form.shippingAddress}
                    onChange={(event) => onFormChange({ ...form, shippingAddress: event.target.value })}
                    placeholder="省市区街道门牌号"
                  />
                </FormField>
                <FormField label="快递单号" error={errors.trackingNumber} wide>
                  <input
                    value={form.trackingNumber}
                    onChange={(event) => onFormChange({ ...form, trackingNumber: event.target.value })}
                    placeholder="输入后可在订单详情一键复制"
                  />
                </FormField>
              </div>
            </section>
          </div>

          <aside className="form-side">
            <section className="form-section qr-form-section">
              <SectionHeading icon={<QrCode size={17} />} title="微信二维码" />
              {dialogMode === "edit" && selectedOrder && editingOrderId ? (
                <WechatQrCard
                  compact
                  isUploading={isQrUploading}
                  order={selectedOrder}
                  onDropUpload={onDropQr}
                  onUpload={onUploadQr}
                  onToast={() => undefined}
                />
              ) : (
                <PendingWechatQrCard fileName={pendingQrName} onSelect={onStageCreateQr} />
              )}
            </section>
          </aside>

          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={isSaving}>
              {dialogMode === "edit" ? <Edit3 size={18} /> : <Plus size={18} />}
              <span>{isSaving ? "保存中..." : dialogMode === "edit" ? "保存修改" : "保存订单"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PendingWechatQrCard({
  fileName,
  onSelect
}: {
  fileName: string;
  onSelect: (files: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDraggingQr, setDraggingQr] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const file = files[0];
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
    onSelect(files);
  }

  return (
    <div
      className={`wechat-qr-card compact pending-qr-card ${isDraggingQr ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDraggingQr(true);
      }}
      onDragLeave={() => setDraggingQr(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDraggingQr(false);
        selectFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp"
        onChange={(event) => selectFiles(event.target.files)}
      />
      <button className="qr-preview pending-qr-preview" type="button" onClick={() => inputRef.current?.click()}>
        {previewUrl ? <img src={previewUrl} alt="待上传微信二维码" /> : <QrCode size={44} />}
      </button>
      <div className="qr-copy">
        <strong>{fileName ? "二维码已选择" : "新建时上传二维码"}</strong>
        <span>{fileName || "点击选择图片，或把二维码图片拖到这里"}</span>
        <small>保存订单后会自动复制到该客户订单文件夹。</small>
        <div className="qr-actions">
          <button className="secondary-button compact-action" type="button" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={15} />
            <span>{fileName ? "更换" : "选择图片"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OrdersView({
  categoryFilter,
  categoryFilters,
  dateFrom,
  dateTo,
  displayMode,
  filteredOrders,
  onCategoryFilterChange,
  onContextMenu,
  onCopy,
  onDateFromChange,
  onDateToChange,
  onDisplayModeChange,
  onKeyDown,
  onOpenFolder,
  onQueryChange,
  onResetDateFilter,
  onSelect,
  onStatusFilterChange,
  onUpdateStatus,
  query,
  selectedOrderId,
  statusFilter
}: {
  categoryFilter: string;
  categoryFilters: string[];
  dateFrom: string;
  dateTo: string;
  displayMode: OrderDisplayMode;
  filteredOrders: OrderSummary[];
  onCategoryFilterChange: (value: string) => void;
  onContextMenu: (menu: ContextMenuState) => void;
  onCopy: (label: string, value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onDisplayModeChange: (value: OrderDisplayMode) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, orderId: string) => void;
  onOpenFolder: (orderId: string) => void;
  onQueryChange: (value: string) => void;
  onResetDateFilter: () => void;
  onSelect: (id: string) => void;
  onStatusFilterChange: (value: StatusFilterValue) => void;
  onUpdateStatus: (order: OrderSummary, status: OrderStatus) => void;
  query: string;
  selectedOrderId: string | null;
  statusFilter: StatusFilterValue;
}) {
  return (
    <>
      <section className="toolbar" aria-label="订单筛选">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索源单号 / 客户 / 微信 / 手机 / 地址 / 尺寸 / 状态"
          />
        </label>
        <label className="select-field">
          <Layers3 size={18} />
          <select value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
            {categoryFilters.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <StatusFilter value={statusFilter} onChange={onStatusFilterChange} />
        <label className="date-field" title="开始日期">
          <CalendarDays size={18} />
          <input
            aria-label="开始日期"
            type="date"
            value={dateFrom}
            onChange={(event) => onDateFromChange(event.target.value)}
          />
        </label>
        <span className="date-range-separator">至</span>
        <label className="date-field" title="结束日期">
          <CalendarDays size={18} />
          <input
            aria-label="结束日期"
            type="date"
            value={dateTo}
            onChange={(event) => onDateToChange(event.target.value)}
          />
        </label>
        <button
          className="secondary-button compact-action"
          type="button"
          onClick={onResetDateFilter}
          disabled={!dateFrom && !dateTo}
        >
          清空日期
        </button>
      </section>

      <section className="view-switch" aria-label="订单显示方式">
        <button
          className={displayMode === "table" ? "active" : ""}
          type="button"
          onClick={() => onDisplayModeChange("table")}
        >
          表格
        </button>
        <button
          className={displayMode === "board" ? "active" : ""}
          type="button"
          onClick={() => onDisplayModeChange("board")}
        >
          看板
        </button>
      </section>

      {displayMode === "table" ? (
      <section className="order-table-wrap" aria-label="订单列表">
        <div className="table-header table-grid">
          <span>源单号</span>
          <span>客户</span>
          <span>分类</span>
          <span>尺寸</span>
          <span>标记</span>
          <span>设计费</span>
          <span>时间</span>
          <span>文件数</span>
        </div>

        <div className="table-body">
          {filteredOrders.length === 0 ? (
            <div className="empty-state">
              <ReceiptText size={34} />
              <span>暂无订单</span>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div
                className={`order-row table-grid ${selectedOrderId === order.id ? "selected" : ""}`}
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(order.id)}
                onKeyDown={(event) => onKeyDown(event, order.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelect(order.id);
                  onContextMenu(getContextMenuState(event.clientX, event.clientY, order));
                }}
              >
                <CopyField label="源单号" value={order.workOrderNo} onCopy={onCopy} strong />
                <span className="customer-cell">
                  <CopyField label="网名" value={order.customerNickname} onCopy={onCopy} />
                  {order.customerWechat ? (
                    <CopyField label="微信" value={order.customerWechat} onCopy={onCopy} small />
                  ) : (
                    <small>微信未填</small>
                  )}
                </span>
                <Badge>{order.category}</Badge>
                <span className="design-size-cell">{order.designSize || "未填"}</span>
                <StatusBadge status={order.status} />
                <span>{formatCurrency(order.designFee)}</span>
                <span>{formatDate(order.orderTime)}</span>
                <button
                  className="file-count"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenFolder(order.id);
                  }}
                  title="进入客户文件夹"
                >
                  {order.fileCount} 个文件
                </button>
              </div>
            ))
          )}
        </div>
      </section>
      ) : (
        <OrderBoard
          orders={filteredOrders}
          onCopy={onCopy}
          onKeyDown={onKeyDown}
          onOpenFolder={onOpenFolder}
          onSelect={onSelect}
          onUpdateStatus={onUpdateStatus}
          selectedOrderId={selectedOrderId}
        />
      )}
    </>
  );
}

function OrderBoard({
  onCopy,
  onKeyDown,
  onOpenFolder,
  onSelect,
  onUpdateStatus,
  orders,
  selectedOrderId
}: {
  onCopy: (label: string, value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, orderId: string) => void;
  onOpenFolder: (orderId: string) => void;
  onSelect: (id: string) => void;
  onUpdateStatus: (order: OrderSummary, status: OrderStatus) => void;
  orders: OrderSummary[];
  selectedOrderId: string | null;
}) {
  const ordersByStatus = boardStatusColumns.map((column) => ({
    ...column,
    orders: orders.filter((order) => order.status === column.value)
  }));

  function handleDrop(event: DragEvent<HTMLDivElement>, status: OrderStatus) {
    event.preventDefault();
    const orderId = event.dataTransfer.getData("text/plain");
    const order = orders.find((item) => item.id === orderId);
    if (!order || order.status === status) return;
    onUpdateStatus(order, status);
  }

  return (
    <section className="order-board" aria-label="订单状态看板">
      {ordersByStatus.map((column) => (
        <div
          className={`board-column ${column.tone}`}
          key={column.value}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, column.value)}
        >
          <div className="board-column-head">
            <span className={`status-dot ${column.tone}`} />
            <strong>{column.label}</strong>
            <small>{column.orders.length} 单</small>
          </div>
          <div className="board-column-body">
            {column.orders.length === 0 ? (
              <div className="board-empty">暂无订单</div>
            ) : (
              column.orders.map((order) => (
                <div
                  className={`board-card ${selectedOrderId === order.id ? "selected" : ""}`}
                  draggable
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(order.id)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", order.id);
                  }}
                  onKeyDown={(event) => onKeyDown(event, order.id)}
                >
                  <div className="board-card-head">
                    <CopyField label="源单号" value={order.workOrderNo} onCopy={onCopy} strong />
                    <button
                      className="icon-button compact"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenFolder(order.id);
                      }}
                      aria-label="进入客户文件夹"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>
                  <div className="board-card-customer">
                    <strong>{order.customerNickname}</strong>
                    <span>{order.customerWechat || order.customerPhone || "微信未填"}</span>
                  </div>
                  <div className="board-card-meta">
                    <Badge>{order.category}</Badge>
                    <span>{order.designSize || "未填尺寸"}</span>
                  </div>
                  <div className="board-card-foot">
                    <span>{formatCurrency(order.designFee)}</span>
                    <span>{formatDate(order.orderTime)}</span>
                    <span>{order.fileCount} 文件</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function StatusFilter({
  onChange,
  value
}: {
  onChange: (value: StatusFilterValue) => void;
  value: StatusFilterValue;
}) {
  const [isOpen, setOpen] = useState(false);
  const selected = statusFilterOptions.find((option) => option.value === value) ?? statusFilterOptions[0];

  useEffect(() => {
    if (!isOpen) return;

    function closeMenu() {
      setOpen(false);
    }

    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, [isOpen]);

  return (
    <div className="status-filter" onClick={(event) => event.stopPropagation()}>
      <button
        className={`status-filter-trigger ${isOpen ? "open" : ""}`}
        type="button"
        aria-expanded={isOpen}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={`status-dot ${selected.tone}`} />
        <span>{selected.label}</span>
        <ChevronRight size={15} />
      </button>
      {isOpen ? (
        <div className="status-filter-menu" role="menu">
          {statusFilterOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span className={`status-dot ${option.tone}`} />
              <span>{option.label}</span>
              {value === option.value ? <CheckCircle2 size={15} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuickPhrasesView({
  draft,
  editingId,
  isSaving,
  onCopy,
  onDelete,
  onDraftChange,
  onEdit,
  onQueryChange,
  onReset,
  onSubmit,
  phrases,
  query,
  totalCount
}: {
  draft: QuickPhraseFormState;
  editingId: string | null;
  isSaving: boolean;
  onCopy: (label: string, value: string) => void;
  onDelete: (phrase: QuickPhrase) => void;
  onDraftChange: (draft: QuickPhraseFormState) => void;
  onEdit: (phrase: QuickPhrase) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  phrases: QuickPhrase[];
  query: string;
  totalCount: number;
}) {
  const trimmedQuery = query.trim();

  return (
    <>
      <section className="toolbar" aria-label="快捷语筛选">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索快捷语标题 / 内容"
          />
        </label>
      </section>

      <section className="quick-phrases-panel" aria-label="常用快捷语">
        <form className="quick-phrase-editor" onSubmit={onSubmit}>
          <div className="section-title">
            <h3>{editingId ? "编辑快捷语" : "添加快捷语"}</h3>
            <span>{editingId ? "修改后保存" : "内容会保存在本机"}</span>
          </div>

          <FormField label="标题">
            <input
              value={draft.title}
              onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
              placeholder="例如：加微信提醒"
            />
          </FormField>

          <FormField label="快捷语内容" wide>
            <textarea
              value={draft.content}
              onChange={(event) => onDraftChange({ ...draft, content: event.target.value })}
              placeholder="输入常用话术，之后可以一键复制"
              rows={9}
            />
          </FormField>

          <div className="quick-phrase-editor-actions">
            {editingId ? (
              <button className="secondary-button" type="button" onClick={onReset}>
                取消编辑
              </button>
            ) : null}
            <button className="primary-button" type="submit" disabled={isSaving || !draft.content.trim()}>
              <Plus size={17} />
              <span>{isSaving ? "保存中..." : editingId ? "保存修改" : "添加快捷语"}</span>
            </button>
          </div>
        </form>

        <div className="quick-phrase-list-panel">
          <div className="section-title">
            <h3>快捷语列表</h3>
            <span>
              {trimmedQuery ? `${phrases.length} / ${totalCount} 条` : `${totalCount} 条`}
            </span>
          </div>

          {phrases.length === 0 ? (
            <div className="empty-state">
              <Sparkles size={34} />
              <span>{trimmedQuery ? "没有匹配的快捷语" : "还没有快捷语，先添加一条"}</span>
            </div>
          ) : (
            <div className="quick-phrase-list">
              {phrases.map((phrase) => (
                <article className={`quick-phrase-card ${editingId === phrase.id ? "editing" : ""}`} key={phrase.id}>
                  <div className="quick-phrase-card-head">
                    <strong>{phrase.title}</strong>
                    <span>{formatDateTime(phrase.updatedAt)}</span>
                  </div>
                  <p>{phrase.content}</p>
                  <div className="quick-phrase-actions">
                    <button className="secondary-button compact-action" type="button" onClick={() => onCopy("快捷语", phrase.content)}>
                      <Copy size={15} />
                      <span>复制</span>
                    </button>
                    <button className="secondary-button compact-action" type="button" onClick={() => onEdit(phrase)}>
                      <Edit3 size={15} />
                      <span>编辑</span>
                    </button>
                    <button className="danger-button compact-action" type="button" onClick={() => onDelete(phrase)}>
                      <Trash2 size={15} />
                      <span>删除</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function CustomersView({
  customers,
  onCopy,
  onQueryChange,
  onSelectCustomer,
  onSelectOrder,
  query,
  selectedCustomer,
  selectedCustomerId
}: {
  customers: CustomerProfile[];
  onCopy: (label: string, value: string) => void;
  onQueryChange: (value: string) => void;
  onSelectCustomer: (customerId: string) => void;
  onSelectOrder: (orderId: string) => void;
  query: string;
  selectedCustomer: CustomerDetail | null;
  selectedCustomerId: string | null;
}) {
  return (
    <>
      <section className="toolbar" aria-label="客户筛选">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索客户网名 / 微信 / 手机号 / 地址"
          />
        </label>
      </section>

      <section className="customers-panel" aria-label="客户资料库">
        <div className="customer-list-panel">
          {customers.length === 0 ? (
            <div className="empty-state">
              <UsersRound size={34} />
              <span>暂无客户资料</span>
            </div>
          ) : (
            customers.map((customer) => (
              <div
                className={`customer-card ${selectedCustomerId === customer.id ? "selected" : ""}`}
                key={customer.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectCustomer(customer.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectCustomer(customer.id);
                  }
                }}
              >
                <div className="customer-card-head">
                  <strong>{customer.customerNickname || "未命名客户"}</strong>
                  <span>{customer.orderCount} 单</span>
                </div>
                <div className="customer-card-lines">
                  <span>{getCustomerIdentityLabel(customer)}</span>
                  <span>{customer.customerPhone || "手机号未填"}</span>
                </div>
                <div className="customer-card-foot">
                  <span>{customer.lastOrderTime ? formatDate(customer.lastOrderTime) : "暂无订单"}</span>
                  <strong>{formatCurrency(customer.totalDesignFee)}</strong>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="customer-detail-panel">
          {selectedCustomer ? (
            <>
              <div className="customer-profile-head">
                <div>
                  <p className="eyebrow">客户资料</p>
                  <h2>{selectedCustomer.customerNickname || "未命名客户"}</h2>
                </div>
                <div className="customer-profile-total">
                  <span>累计设计费</span>
                  <strong>{formatCurrency(selectedCustomer.totalDesignFee)}</strong>
                </div>
              </div>

              <div className="customer-info-grid">
                <DetailItem label="客户网名" value={selectedCustomer.customerNickname || "未填写"} copyLabel="网名" onCopy={onCopy} />
                <DetailItem label="客户微信" value={selectedCustomer.customerWechat || "未填写"} copyLabel="微信" onCopy={onCopy} />
                <DetailItem label="手机号" value={selectedCustomer.customerPhone || "未填写"} copyLabel="手机号" onCopy={onCopy} />
                <DetailItem label="收货地址" value={selectedCustomer.shippingAddress || "未填写"} copyLabel="地址" onCopy={onCopy} />
                <DetailItem label="识别依据" value={getCustomerIdentityLabel(selectedCustomer)} />
                <DetailItem label="订单数" value={`${selectedCustomer.orderCount} 单`} />
                <DetailItem label="已完稿" value={`${selectedCustomer.completedOrderCount} 单`} />
                <DetailItem label="最近下单" value={selectedCustomer.lastOrderTime ? formatDateTime(selectedCustomer.lastOrderTime) : "暂无订单"} />
                <DetailItem label="资料更新" value={formatDateTime(selectedCustomer.updatedAt)} />
              </div>

              <div className="customer-history">
                <div className="section-title">
                  <h3>历史订单</h3>
                  <span>{selectedCustomer.orders.length} 单</span>
                </div>
                {selectedCustomer.orders.length === 0 ? (
                  <div className="file-empty">暂无历史订单</div>
                ) : (
                  selectedCustomer.orders.map((order) => (
                    <button className="customer-order-row" key={order.id} type="button" onClick={() => onSelectOrder(order.id)}>
                      <strong>{order.workOrderNo}</strong>
                      <Badge>{order.category}</Badge>
                      <span>{order.designSize || "未填尺寸"}</span>
                      <StatusBadge status={order.status} />
                      <span>{formatCurrency(order.designFee)}</span>
                      <span>{formatDate(order.orderTime)}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <UsersRound size={36} />
              <span>选择客户查看资料和历史订单</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function TrashView({
  onPermanentDelete,
  onQueryChange,
  onRestore,
  orders,
  query
}: {
  onPermanentDelete: (order: OrderSummary) => void;
  onQueryChange: (value: string) => void;
  onRestore: (order: OrderSummary) => void;
  orders: OrderSummary[];
  query: string;
}) {
  return (
    <>
      <section className="toolbar" aria-label="垃圾箱筛选">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索垃圾箱中的源单号 / 客户 / 微信 / 手机 / 地址 / 尺寸 / 状态"
          />
        </label>
      </section>

      <section className="trash-panel" aria-label="垃圾箱列表">
        {orders.length === 0 ? (
          <div className="empty-state">
            <Trash2 size={34} />
            <span>垃圾箱为空</span>
          </div>
        ) : (
          orders.map((order) => (
            <div className="trash-row" key={order.id}>
              <div className="trash-row-main">
                <strong>{order.workOrderNo}</strong>
                <span>
                  {order.customerNickname} · {order.category} · {formatCurrency(order.designFee)}
                </span>
                <small>
                  移入时间：{formatDateTime(order.trashedAt ?? order.updatedAt)} · 原订单时间：{formatDate(order.orderTime)}
                </small>
              </div>
              <StatusBadge status={order.status} />
              <span className="trash-file-count">{order.fileCount} 个文件</span>
              <div className="trash-actions">
                <button className="secondary-button compact-action" type="button" onClick={() => onRestore(order)}>
                  <RefreshCw size={15} />
                  <span>恢复</span>
                </button>
                <button className="danger-button compact-action" type="button" onClick={() => onPermanentDelete(order)}>
                  <Trash2 size={15} />
                  <span>永久删除</span>
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function ArchiveView({
  files,
  onCopy,
  onQueryChange,
  onSelectOrder,
  query,
  showToast
}: {
  files: ArchivedFile[];
  onCopy: (label: string, value: string) => void;
  onQueryChange: (value: string) => void;
  onSelectOrder: (orderId: string) => void;
  query: string;
  showToast: (message: string) => void;
}) {
  return (
    <>
      <section className="toolbar" aria-label="文件筛选">
        <label className="search-field">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索文件名 / 源单号 / 客户 / 尺寸 / 类型"
          />
        </label>
      </section>

      <section className="archive-panel" aria-label="文件归档列表">
        {files.length === 0 ? (
          <div className="empty-state">
            <Archive size={34} />
            <span>暂无归档文件</span>
          </div>
        ) : (
          files.map((file) => (
            <div className="archive-row" key={file.id}>
              <FileRow
                file={file}
                onToast={showToast}
                meta={
                  <span>
                    {file.fileType} · {formatBytes(file.size)} · {formatDate(file.uploadedAt)}
                  </span>
                }
              />
              <div className="archive-meta">
                <CopyField label="源单号" value={file.workOrderNo} onCopy={onCopy} strong />
                <CopyField label="网名" value={file.customerNickname} onCopy={onCopy} />
                <StatusBadge status={file.orderStatus} />
                <button className="secondary-button compact-action" type="button" onClick={() => onSelectOrder(file.orderId)}>
                  查看订单
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function FeesView({
  summary
}: {
  summary: {
    byCategory: Array<{ category: string; count: number; total: number }>;
    maxCategoryTotal: number;
    totalFee: number;
    todayFee: number;
    weekFee: number;
    monthFee: number;
    completedCount: number;
    averageFee: number;
    highestOrder: OrderSummary | null;
  };
}) {
  return (
    <section className="fees-view" aria-label="费用总览">
      <div className="fee-card">
        <span>今日设计费</span>
        <strong>{formatCurrency(summary.todayFee)}</strong>
        <small>仅统计已完稿上传</small>
      </div>
      <div className="fee-card">
        <span>本周设计费</span>
        <strong>{formatCurrency(summary.weekFee)}</strong>
        <small>周一至周日</small>
      </div>
      <div className="fee-card">
        <span>本月设计费</span>
        <strong>{formatCurrency(summary.monthFee)}</strong>
        <small>当前自然月</small>
      </div>
      <div className="fee-card">
        <span>累计设计费</span>
        <strong>{formatCurrency(summary.totalFee)}</strong>
        <small>仅统计已完稿上传</small>
      </div>
      <div className="fee-card">
        <span>平均设计费</span>
        <strong>{formatCurrency(summary.averageFee)}</strong>
        <small>{summary.completedCount} 单已完稿</small>
      </div>
      <div className="fee-card">
        <span>最高订单</span>
        <strong>{summary.highestOrder ? formatCurrency(summary.highestOrder.designFee) : formatCurrency(0)}</strong>
        {summary.highestOrder ? <small>{summary.highestOrder.workOrderNo}</small> : <small>暂无订单</small>}
      </div>
      <div className="fee-breakdown">
        <div className="section-title">
          <h3>分类费用</h3>
          <span>{summary.byCategory.reduce((sum, item) => sum + item.count, 0)} 单</span>
        </div>
        {summary.byCategory.map((item) => (
          <div className="fee-bar-row" key={item.category}>
            <div>
              <strong>{item.category}</strong>
              <span>{item.count} 单</span>
            </div>
            <div className="fee-bar-track">
              <div className="fee-bar-fill" style={{ width: `${Math.max(4, (item.total / summary.maxCategoryTotal) * 100)}%` }} />
            </div>
            <strong>{formatCurrency(item.total)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataCenterView({
  isCheckingUpdate,
  isExportingBackup,
  isUpdatingApp,
  lastBackupResult,
  onCheckUpdate,
  onCopy,
  onExportBackup,
  onOpenBackupFolder,
  onOpenDataRoot,
  onOpenFilesRoot,
  onRevealDatabase,
  onUpdateApp,
  storageInfo
}: {
  isCheckingUpdate: boolean;
  isExportingBackup: boolean;
  isUpdatingApp: boolean;
  lastBackupResult: StorageBackupResult | null;
  onCheckUpdate: () => void;
  onCopy: (label: string, value: string) => void;
  onExportBackup: () => void;
  onOpenBackupFolder: (backupPath: string) => void;
  onOpenDataRoot: () => void;
  onOpenFilesRoot: () => void;
  onRevealDatabase: () => void;
  onUpdateApp: () => void;
  storageInfo: StorageInfo | null;
}) {
  if (!storageInfo) {
    return (
      <section className="data-center-view" aria-label="数据中心">
        <div className="empty-state">
          <Database size={34} />
          <span>正在读取本机数据位置</span>
        </div>
      </section>
    );
  }

  return (
    <section className="data-center-view" aria-label="数据中心">
      <div className="data-hero">
        <div className="data-hero-icon">
          <ShieldCheck size={24} />
        </div>
        <div>
          <p className="eyebrow">DATA CENTER</p>
          <h2>数据中心</h2>
          <span>当前版本 {storageInfo.appVersion || "本地调试"}</span>
        </div>
      </div>

      <div className="data-storage-grid" aria-label="数据容量概览">
        <DataStatCard label="数据库大小" value={formatBytes(storageInfo.databaseSize)} />
        <DataStatCard label="客户文件大小" value={formatBytes(storageInfo.filesSize)} />
        <DataStatCard label="客户文件数量" value={`${storageInfo.fileCount} 个`} />
      </div>

      <div className="data-path-grid">
        <DataPathCard
          icon={<HardDrive size={20} />}
          label="数据根目录"
          value={storageInfo.dataRoot}
          actionLabel="打开"
          onAction={onOpenDataRoot}
          onCopy={onCopy}
        />
        <DataPathCard
          icon={<Database size={20} />}
          label="SQLite 数据库"
          value={storageInfo.databasePath}
          actionLabel="定位"
          onAction={onRevealDatabase}
          onCopy={onCopy}
        />
        <DataPathCard
          icon={<FolderOpen size={20} />}
          label="客户文件目录"
          value={storageInfo.filesRoot}
          actionLabel="打开"
          onAction={onOpenFilesRoot}
          onCopy={onCopy}
        />
      </div>

      <div className="data-backup-card">
        <div className="data-backup-copy">
          <div className="data-path-icon">
            <FileArchive size={20} />
          </div>
          <div>
            <h3>导出备份</h3>
            <p>选择一个安全位置，导出 SQLite 数据库和客户文件目录。不会覆盖当前数据。</p>
          </div>
        </div>
        <button className="primary-button" type="button" onClick={onExportBackup} disabled={isExportingBackup}>
          <FileArchive size={17} />
          <span>{isExportingBackup ? "导出中..." : "导出备份"}</span>
        </button>
        {lastBackupResult ? (
          <div className="data-backup-result">
            <span>最近备份：{formatDateTime(lastBackupResult.createdAt)}</span>
            <CopyField label="备份目录" value={lastBackupResult.backupPath} onCopy={onCopy} />
            <button className="secondary-button" type="button" onClick={() => onOpenBackupFolder(lastBackupResult.backupPath)}>
              <FolderOpen size={16} />
              <span>打开最近备份</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="data-backup-card data-update-card">
        <div className="data-backup-copy">
          <div className="data-path-icon">
            <RefreshCw size={20} />
          </div>
          <div>
            <h3>应用更新</h3>
            <p>启动时会检查 GitHub Release。也可以选择新版 win-unpacked 文件夹进行本地更新。</p>
          </div>
        </div>
        <button className="secondary-button" type="button" onClick={onUpdateApp} disabled={isUpdatingApp}>
          <RefreshCw size={17} />
          <span>{isUpdatingApp ? "准备更新..." : "选择本地新版目录"}</span>
        </button>
        <div className="data-update-actions">
          <button className="secondary-button" type="button" onClick={onCheckUpdate} disabled={isCheckingUpdate || isUpdatingApp}>
            <RefreshCw size={16} />
            <span>{isCheckingUpdate ? "检查中..." : "检查远程更新"}</span>
          </button>
        </div>
      </div>

      <div className="data-safety-note">
        <ShieldCheck size={18} />
        <span>当前只支持导出备份，暂不提供恢复覆盖操作，避免误伤现有订单和客户文件。</span>
      </div>
    </section>
  );
}

function DataStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataPathCard({
  actionLabel,
  icon,
  label,
  onAction,
  onCopy,
  value
}: {
  actionLabel: string;
  icon: ReactNode;
  label: string;
  onAction: () => void;
  onCopy: (label: string, value: string) => void;
  value: string;
}) {
  return (
    <div className="data-path-card">
      <div className="data-path-head">
        <div className="data-path-icon">{icon}</div>
        <span>{label}</span>
      </div>
      <CopyField label={label} value={value} onCopy={onCopy} />
      <button className="secondary-button" type="button" onClick={onAction}>
        <FolderOpen size={16} />
        <span>{actionLabel}</span>
      </button>
    </div>
  );
}

function WechatQrCard({
  compact,
  isUploading,
  order,
  onDropUpload,
  onToast,
  onUpload
}: {
  compact?: boolean;
  isUploading: boolean;
  order: OrderDetail;
  onDropUpload?: (files: FileList) => void;
  onToast: (message: string) => void;
  onUpload: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDraggingQr, setDraggingQr] = useState(false);

  useEffect(() => {
    let alive = true;
    window.orderApi
      .getWechatQrPreview(order.id)
      .then((preview) => {
        if (alive) setPreviewUrl(preview);
      })
      .catch(() => {
        if (alive) setPreviewUrl(null);
      });

    return () => {
      alive = false;
    };
  }, [order.id, order.wechatQrPath]);

  async function openQr() {
    try {
      await window.orderApi.openWechatQr(order.id);
    } catch (error) {
      onToast(getErrorMessage(error));
    }
  }

  async function revealQr() {
    try {
      await window.orderApi.revealWechatQr(order.id);
    } catch (error) {
      onToast(getErrorMessage(error));
    }
  }

  return (
    <section
      className={`wechat-qr-card ${compact ? "compact" : ""} ${isDraggingQr ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDraggingQr(true);
      }}
      onDragLeave={() => setDraggingQr(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDraggingQr(false);
        onDropUpload?.(event.dataTransfer.files);
      }}
    >
      <div className="qr-preview">
        {previewUrl ? (
          <button type="button" onClick={() => void openQr()} aria-label="打开微信二维码">
            <img src={previewUrl} alt="客户微信二维码" />
          </button>
        ) : (
          <QrCode size={44} />
        )}
      </div>
      <div className="qr-copy">
        <strong>客户微信二维码</strong>
        <span>{order.wechatQrOriginalName ?? "未上传二维码图片"}</span>
        <small>可点击上传，也可以把二维码图片拖到这里</small>
        <div className="qr-actions">
          <button className="secondary-button compact-action" type="button" onClick={onUpload} disabled={isUploading}>
            <UploadCloud size={15} />
            <span>{isUploading ? "上传中" : order.wechatQrPath ? "替换" : "上传"}</span>
          </button>
          {order.wechatQrPath ? (
            <button className="icon-button compact" type="button" onClick={() => void revealQr()} aria-label="定位二维码文件">
              <FolderOpen size={15} />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="form-section-heading">
      {icon}
      <h3>{title}</h3>
    </div>
  );
}

function Metric({
  label,
  onClick,
  onReveal,
  tone,
  value,
  icon
}: {
  label: string;
  onClick?: () => void;
  onReveal?: (message: string) => void;
  tone?: "danger";
  value: string;
  icon: ReactNode;
}) {
  return (
    <button
      className={`metric ${tone ?? ""}`}
      type="button"
      title={`${label}: ${value}`}
      onClick={() => {
        if (onClick) {
          onClick();
          return;
        }
        onReveal?.(`${label}：${value}`);
      }}
    >
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const option = getOrderStatusOption(status);
  return <span className={`status-badge ${option.tone}`}>{option.label}</span>;
}

function CopyField({
  label,
  value,
  onCopy,
  strong,
  small
}: {
  label: string;
  value: string;
  onCopy: (label: string, value: string) => void;
  strong?: boolean;
  small?: boolean;
}) {
  return (
    <button
      className={`copy-field ${strong ? "strong" : ""} ${small ? "small" : ""}`}
      type="button"
      title={`点击复制${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onCopy(label, value);
      }}
    >
      <span>{value}</span>
      <Copy size={small ? 12 : 14} />
    </button>
  );
}

function DetailItem({
  label,
  value,
  copyLabel,
  onCopy
}: {
  label: string;
  value: string | ReactNode;
  copyLabel?: string;
  onCopy?: (label: string, value: string) => void;
}) {
  const canCopy = typeof value === "string" && copyLabel && onCopy && value !== "未填写";
  return (
    <div className="detail-item">
      <span>{label}</span>
      {canCopy ? <CopyField label={copyLabel} value={value} onCopy={onCopy} strong /> : <strong>{value}</strong>}
    </div>
  );
}

function TrackingNumberItem({
  onCopy,
  onSave,
  value
}: {
  onCopy: (label: string, value: string) => void;
  onSave: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function save() {
    const nextValue = draft.trim();
    setEditing(false);
    if (nextValue !== value) {
      onSave(nextValue);
    }
  }

  return (
    <div className="detail-item tracking-item">
      <span>快递单号</span>
      <div className="tracking-control">
        {isEditing ? (
          <input
            autoFocus
            value={draft}
            onBlur={save}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
            }}
            placeholder="填写快递单号"
          />
        ) : (
          <button className="tracking-value" type="button" onClick={() => setEditing(true)}>
            {value || "点击填写快递单号"}
          </button>
        )}
        <button
          className="tracking-copy"
          type="button"
          onClick={() => onCopy("快递单号", value)}
          disabled={!value.trim()}
          aria-label="复制快递单号"
          title="复制快递单号"
        >
          <Copy size={15} />
        </button>
      </div>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
  wide
}: {
  label: string;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`form-field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function FileRow({
  file,
  meta,
  onToast
}: {
  file: OrderFile;
  meta?: ReactNode;
  onToast: (message: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.orderApi
      .getFilePreview(file.id)
      .then((preview) => {
        if (alive) setPreviewUrl(preview);
      })
      .catch(() => {
        if (alive) setPreviewUrl(null);
      });

    return () => {
      alive = false;
    };
  }, [file.id]);

  async function openFile() {
    try {
      await window.orderApi.openFile(file.id);
    } catch (error) {
      onToast(getErrorMessage(error));
    }
  }

  async function revealFile() {
    try {
      await window.orderApi.revealFile(file.id);
    } catch (error) {
      onToast(getErrorMessage(error));
    }
  }

  return (
    <div className="file-row">
      <button className="file-preview" type="button" onClick={() => void openFile()} aria-label="打开文件">
        {previewUrl ? <img src={previewUrl} alt={file.originalName} /> : getFileIcon(file.fileType)}
      </button>
      <button className="file-main" type="button" onClick={() => void openFile()}>
        <strong>{file.originalName}</strong>
        {meta ?? (
          <span>
            {file.fileType} · {formatBytes(file.size)} · {formatDate(file.uploadedAt)}
          </span>
        )}
      </button>
      <button className="icon-button compact" type="button" onClick={() => void revealFile()} aria-label="在文件夹中显示">
        <FolderOpen size={16} />
      </button>
    </div>
  );
}

function getFileIcon(fileType: OrderFile["fileType"]) {
  if (fileType === "图片文件") return <FileImage size={20} />;
  if (fileType === "压缩包") return <FileArchive size={20} />;
  return <FileText size={20} />;
}

function recognizeCustomerInfo(text: string): RecognizedCustomerInfo {
  const normalized = text.replace(/\r/g, "\n");
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const phone = normalized.match(/(?:\+?86[-\s]?)?(1[3-9]\d{9})/)?.[1];
  const wechat = normalized.match(/(?:微信号?|wechat|wx)[:：\s]*([A-Za-z0-9_-]{4,})/i)?.[1];
  const nickname = normalized.match(/(?:网名|昵称|客户|姓名|收件人)[:：\s]*([^\s，,；;]{2,24})/)?.[1];
  const designSize =
    normalized.match(/(?:设计尺寸|成品尺寸|尺寸|规格)[:：\s]*([A-Za-z0-9一-龥.]+(?:\s*[xX×*]\s*[A-Za-z0-9一-龥.]+){1,2}\s*(?:mm|cm|m|px|厘米|毫米)?)/)?.[1] ??
    normalized.match(/\b(A[0-9]|B[0-9]|[0-9]{2,4}\s*[xX×*]\s*[0-9]{2,4}\s*(?:mm|cm|m|px|厘米|毫米)?)\b/i)?.[1];
  const addressLine =
    normalized.match(/(?:收货地址|地址)[:：\s]*(.+)/)?.[1] ??
    lines
      .map((line) => line.replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, "").trim())
      .filter((line) => /省|市|区|县|镇|街|路|号|室|小区|村|巷|栋|单元/.test(line))
      .sort((a, b) => b.length - a.length)[0];

  return {
    nickname,
    wechat,
    phone,
    address: addressLine?.replace(/^[:：\s]+/, "").trim(),
    designSize: designSize?.replace(/\s+/g, "")
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2
  }).format(value);
}

function isWithinDateRange(value: string, dateFrom: string, dateTo: string): boolean {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;

  const start = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const end = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

  return time >= start && time <= end;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameLocalMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function getLocalWeekStart(value: Date): Date {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  return start;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function toDateTimeInputValue(date: Date): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function toDateInputValue(date: Date): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "操作失败";
}
