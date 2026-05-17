import { DESIGN_CATEGORIES } from "./categories";
import type { OrderInput } from "./types";

export type OrderFormErrors = Partial<Record<keyof OrderInput, string>>;

export function parseDesignFee(value: number | string): number {
  if (typeof value === "number") return value;
  const normalized = value.trim();
  return normalized === "" ? Number.NaN : Number(normalized);
}

export function validateOrderInput(input: OrderInput): OrderFormErrors {
  const errors: OrderFormErrors = {};
  const fee = parseDesignFee(input.designFee);

  if (!input.workOrderNo.trim()) {
    errors.workOrderNo = "请输入源单号";
  }

  if (!Number.isFinite(fee) || fee < 0) {
    errors.designFee = "设计费需为不小于 0 的数字";
  }

  if (!DESIGN_CATEGORIES.includes(input.category as never)) {
    errors.category = "请选择设计分类";
  }

  if (!input.customerNickname.trim()) {
    errors.customerNickname = "请输入客户网名";
  }

  const phone = input.customerPhone?.trim();
  if (phone && !/^(\+?86[-\s]?)?1[3-9]\d{9}$/.test(phone)) {
    errors.customerPhone = "手机号格式不正确";
  }

  if (!input.orderTime || Number.isNaN(new Date(input.orderTime).getTime())) {
    errors.orderTime = "请选择有效时间";
  }

  return errors;
}

export function normalizeOrderInput(input: OrderInput): Required<OrderInput> & { designFee: number } {
  const errors = validateOrderInput(input);
  if (Object.keys(errors).length > 0) {
    throw new Error(Object.values(errors)[0] ?? "订单信息不完整");
  }

  return {
    workOrderNo: input.workOrderNo.trim(),
    designFee: parseDesignFee(input.designFee),
    category: input.category,
    designSize: input.designSize?.trim() ?? "",
    customerNickname: input.customerNickname.trim(),
    customerWechat: input.customerWechat?.trim() ?? "",
    customerPhone: input.customerPhone?.trim() ?? "",
    shippingAddress: input.shippingAddress?.trim() ?? "",
    trackingNumber: input.trackingNumber?.trim() ?? "",
    orderTime: new Date(input.orderTime).toISOString()
  };
}
