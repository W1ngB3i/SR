import type { AppealStatus, DeviceModule, Grade, StaffRole, TicketEventType, TicketStatus } from './enums.js';

export const STATUS_LABELS: Record<TicketStatus, string> = {
  draft: '草稿',
  pending_claim: '待接单',
  reviewing: '审核中',
  supplementing: '补充中',
  resulted: '已出结果',
  published: '已公示',
};

export const MODULE_LABELS: Record<DeviceModule, string> = {
  PE: 'PE PVP（触屏）',
  PC: 'PC PVP（键鼠）',
  BOTH: 'PE + PC PVP（双端）',
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  reviewer: '审核员',
  deputy: '审核副总管',
  chief: '审核总管',
  admin: '系统管理员',
};

export const EVENT_LABELS: Record<TicketEventType, string> = {
  submitted: '提交工单',
  claimed: '审核员接单',
  assigned: '总管指派',
  released: '释放回公单池',
  supplement_requested: '退回补充材料',
  supplement_provided: '申请人补充材料',
  receipt_submitted: '提交审核回执',
  receipt_rejected: '复核退回',
  review_confirmed: '复核通过',
  published: '结果公示',
  receipt_revised: '回执修订',
  ticket_updated: '工单信息修订',
  unpublished: '撤销公示',
};

export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  open: '待处理',
  resolved: '已采纳',
  dismissed: '已驳回',
};

export const GRADE_LABELS: Record<Grade, string> = {
  E: 'E',
  D: 'D',
  C: 'C',
  B: 'B',
  A: 'A',
  S: 'S',
  'S+': 'S+',
};

/** 设备界定（源自公会 2023.12.13 群公告口径） */
export const DEVICE_NOTES = [
  'PE：手机/iPad 触屏、准星、新触控以及任何设备连接手柄。',
  'PC：一切键鼠，包括电脑键鼠和 OTG 键鼠。',
  '成绩评价分为 PE、PC 两套，均为 E~S+ 的字母级别，具体标准以群管家口径为准。',
] as const;

/** 默认反馈渠道（规则配置中心可覆盖） */
export const DEFAULT_FEEDBACK_CONTACTS = {
  chief: { name: '望北', qq: '2774265885' },
  deputy: { name: '雨夜', qq: '477109615' },
} as const;

/** 附件类型约定 */
export const ATTACHMENT_KIND_RULES = {
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  video: ['.mp4', '.mov', '.webm', '.mkv'],
} as const;

/** 业务错误码（稳定契约，前端据此提示） */
export const BizCode = {
  FieldRequired: 'FIELD_REQUIRED',
  InvalidInput: 'INVALID_INPUT',
  InvalidQueryCode: 'INVALID_QUERY_CODE',
  TicketNotFound: 'TICKET_NOT_FOUND',
  TicketAlreadyClaimed: 'TICKET_ALREADY_CLAIMED',
  InvalidTransition: 'INVALID_TRANSITION',
  CooldownActive: 'COOLDOWN_ACTIVE',
  RateLimited: 'RATE_LIMITED',
  PermissionDenied: 'PERMISSION_DENIED',
  Unauthorized: 'UNAUTHORIZED',
  LimitReached: 'LIMIT_REACHED',
  ResourceNotFound: 'RESOURCE_NOT_FOUND',
  ResourceConflict: 'RESOURCE_CONFLICT',
  UploadRejected: 'UPLOAD_REJECTED',
  InternalError: 'INTERNAL_ERROR',
} as const;
export type BizCode = (typeof BizCode)[keyof typeof BizCode];
