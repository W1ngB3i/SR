/**
 * 工单状态机。
 * draft 仅存在于客户端草稿，服务端不落库；
 * 其余状态与数据库 ticket.status 取值一致。
 */
export const TicketStatus = {
  Draft: 'draft',
  PendingClaim: 'pending_claim',
  Reviewing: 'reviewing',
  Supplementing: 'supplementing',
  Resulted: 'resulted',
  Published: 'published',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

/** 合法的状态跳转表，前后端共享，用于时间线渲染与流转校验 */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  draft: [TicketStatus.PendingClaim],
  pending_claim: [TicketStatus.Reviewing],
  reviewing: [TicketStatus.Supplementing, TicketStatus.Resulted, TicketStatus.PendingClaim],
  supplementing: [TicketStatus.Reviewing, TicketStatus.PendingClaim],
  resulted: [TicketStatus.Reviewing, TicketStatus.Published],
  published: [],
};

/** 审核模块（设备类别）：PE 触屏 / PC 键鼠 / 双端 */
export const DeviceModule = {
  PE: 'PE',
  PC: 'PC',
  BOTH: 'BOTH',
} as const;
export type DeviceModule = (typeof DeviceModule)[keyof typeof DeviceModule];

/** 人员角色：审核员 / 副总管 / 总管 / 系统管理员 */
export const StaffRole = {
  Reviewer: 'reviewer',
  Deputy: 'deputy',
  Chief: 'chief',
  Admin: 'admin',
} as const;
export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

/** 成绩等级，从低到高 */
export const GRADES = ['E', 'D', 'C', 'B', 'A', 'S', 'S+'] as const;
export type Grade = (typeof GRADES)[number];

/** 时间线事件类型 */
export const TicketEventType = {
  Submitted: 'submitted',
  Claimed: 'claimed',
  Assigned: 'assigned',
  Released: 'released',
  SupplementRequested: 'supplement_requested',
  SupplementProvided: 'supplement_provided',
  ReceiptSubmitted: 'receipt_submitted',
  ReceiptRejected: 'receipt_rejected',
  ReviewConfirmed: 'review_confirmed',
  Published: 'published',
  /** 总管/副总管修订已提交的回执 */
  ReceiptRevised: 'receipt_revised',
  /** 总管/副总管修订工单基础信息 */
  TicketUpdated: 'ticket_updated',
  /** 总管/副总管撤销公示（已公示 → 已出结果） */
  Unpublished: 'unpublished',
} as const;
export type TicketEventType = (typeof TicketEventType)[keyof typeof TicketEventType];

/** 申诉状态：待处理 / 已采纳 / 已驳回 */
export const AppealStatus = {
  Open: 'open',
  Resolved: 'resolved',
  Dismissed: 'dismissed',
} as const;
export type AppealStatus = (typeof AppealStatus)[keyof typeof AppealStatus];
