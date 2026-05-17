export const ORDER_STATUS_VALUES = ["none", "wechat_pending", "designing", "finished_uploaded"] as const;

export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

export interface OrderStatusOption {
  value: OrderStatus;
  label: string;
  tone: "neutral" | "amber" | "blue" | "green";
}

export const ORDER_STATUS_OPTIONS: OrderStatusOption[] = [
  { value: "none", label: "未标记", tone: "neutral" },
  { value: "wechat_pending", label: "微信未加", tone: "amber" },
  { value: "designing", label: "设计中", tone: "blue" },
  { value: "finished_uploaded", label: "已完稿上传", tone: "green" }
];

export function normalizeOrderStatus(value: string | null | undefined): OrderStatus {
  return ORDER_STATUS_VALUES.includes(value as OrderStatus) ? (value as OrderStatus) : "none";
}

export function getOrderStatusOption(value: string | null | undefined): OrderStatusOption {
  const normalized = normalizeOrderStatus(value);
  return ORDER_STATUS_OPTIONS.find((option) => option.value === normalized) ?? ORDER_STATUS_OPTIONS[0];
}
