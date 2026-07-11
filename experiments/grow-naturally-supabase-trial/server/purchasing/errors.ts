export type PurchasingApiErrorCode =
  | "UNSUPPORTED_IMAGE_FORMAT"
  | "IMAGE_TOO_LARGE"
  | "UNSUPPORTED_INTAKE_FILE"
  | "INTAKE_FILE_TOO_LARGE"
  | "EMPTY_INTAKE_FILE"
  | "INTAKE_NOT_FOUND"
  | "AI_SERVICE_UNAVAILABLE"
  | "NO_READABLE_TEXT"
  | "INVALID_AI_RESPONSE"
  | "MISSING_API_KEY"
  | "INVALID_REVIEW_DATA"
  | "INVALID_ORDERING_DATA"
  | "PO_REQUIRED"
  | "SUPPLIER_NOT_PREPARED"
  | "INVALID_ORDER_QUANTITY"
  | "SUPPLIER_PRODUCT_NOT_FOUND"
  | "INTAKE_NOT_READY_FOR_ORDER"
  | "INTAKE_ALREADY_ADDED"
  | "ORDER_BATCH_NOT_FOUND"
  | "ORDER_BATCH_ITEM_NOT_FOUND";

type PurchasingApiErrorDetails = {
  message: string;
  status: number;
};

const errorDetails: Record<PurchasingApiErrorCode, PurchasingApiErrorDetails> = {
  UNSUPPORTED_IMAGE_FORMAT: { message: "仅支持 JPG、PNG、HEIC、HEIF 和 WebP 图片。", status: 415 },
  IMAGE_TOO_LARGE: { message: "图片大小不能超过 15 MB。", status: 413 },
  UNSUPPORTED_INTAKE_FILE: { message: "仅支持 JPG、PNG、HEIC、HEIF、WebP、PDF、XLSX、XLS 和 CSV 文件。", status: 415 },
  INTAKE_FILE_TOO_LARGE: { message: "文件大小不能超过 25 MB。", status: 413 },
  EMPTY_INTAKE_FILE: { message: "不能上传空文件。", status: 400 },
  INTAKE_NOT_FOUND: { message: "未找到采购信息记录。", status: 404 },
  AI_SERVICE_UNAVAILABLE: { message: "识别服务暂时不可用，请稍后重试。", status: 503 },
  NO_READABLE_TEXT: { message: "未识别到可用的采购文字。", status: 422 },
  INVALID_AI_RESPONSE: { message: "识别结果格式无效，请重新识别。", status: 502 },
  MISSING_API_KEY: { message: "服务配置不完整。", status: 500 },
  INVALID_REVIEW_DATA: { message: "采购清单数据无效，请检查后重试。", status: 400 },
  INVALID_ORDERING_DATA: { message: "下单数据无效，请检查后重试。", status: 400 },
  PO_REQUIRED: { message: "请先填写 PO 再继续操作。", status: 400 },
  SUPPLIER_NOT_PREPARED: { message: "请先完成该供应商的下单准备。", status: 409 },
  INVALID_ORDER_QUANTITY: { message: "订购数量无效，请填写大于 0 的数字。", status: 400 },
  SUPPLIER_PRODUCT_NOT_FOUND: { message: "未找到对应历史商品，商品信息已过期。", status: 400 },
  INTAKE_NOT_READY_FOR_ORDER: { message: "该采购清单尚未准备好转入下单模块。", status: 400 },
  INTAKE_ALREADY_ADDED: { message: "该采购清单已转入下单模块。", status: 400 },
  ORDER_BATCH_NOT_FOUND: { message: "当前下单批次不存在。", status: 404 },
  ORDER_BATCH_ITEM_NOT_FOUND: { message: "未找到该下单商品。", status: 404 }
};

export class PurchasingApiError extends Error {
  readonly code: PurchasingApiErrorCode;
  readonly status: number;

  constructor(code: PurchasingApiErrorCode) {
    super(errorDetails[code].message);
    this.name = "PurchasingApiError";
    this.code = code;
    this.status = errorDetails[code].status;
  }
}
