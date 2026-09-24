import type {
  AppealStatus,
  DeviceModule,
  Grade,
  RobotMessageDirection,
  RobotMessageKind,
  RobotMessageStatus,
  RobotRole,
  StaffRole,
  TicketEventType,
  TicketStatus,
} from './enums.js';

/** 统一响应 envelope：data 放业务数据，error 放错误信息 */
export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, string[]> | null;
}

export interface Envelope<T> {
  data: T;
  error: ApiErrorShape | null;
  request_id: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface ModeDTO {
  id: string;
  department_id: string;
  group_name: string;
  name: string;
  min_requirement: string;
  sort: number;
}

export interface DepartmentDTO {
  id: string;
  name: string;
  tier: string;
  contact: string;
  description: string;
  sort: number;
  enabled: boolean;
  modes: ModeDTO[];
}

export interface TicketEventDTO {
  id: string;
  ticket_id: string;
  type: TicketEventType;
  actor_name: string;
  detail: string;
  created_at: string;
}

export interface ReceiptDTO {
  ticket_id: string;
  is_draft: boolean;
  pe_grade: Grade | null;
  pc_grade: Grade | null;
  pass: boolean | null;
  target_department: string;
  comment: string;
  auditor_id: string | null;
  auditor_name: string | null;
  submitted_at: string | null;
}

export interface AttachmentDTO {
  id: string;
  ticket_id: string;
  kind: 'image' | 'video' | 'other';
  filename: string;
  size: number;
  uploaded_at: string;
  /** 签名限时访问地址，仅审核人员可见 */
  url: string;
}

export interface TicketSummaryDTO {
  id: string;
  circle_name: string;
  department_id: string;
  department_name: string;
  module: DeviceModule;
  mode_id: string;
  mode_name: string;
  mode_group: string;
  self_proof: boolean;
  status: TicketStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  is_priority: boolean;
  supplement_reason: string;
  created_at: string;
  claimed_at: string | null;
  resulted_at: string | null;
  published_at: string | null;
}

export interface TicketDetailDTO extends TicketSummaryDTO {
  contact: string;
  events: TicketEventDTO[];
  receipt: ReceiptDTO | null;
  attachments: AttachmentDTO[];
}

export interface PublicityItemDTO {
  id: string;
  department_name: string;
  mode_name: string;
  mode_group: string;
  module: DeviceModule;
  circle_name_masked: string;
  pe_grade: Grade | null;
  pc_grade: Grade | null;
  pass: boolean;
  target_department: string;
  comment: string;
  auditor_name: string;
  published_at: string;
}

export interface AnnouncementDTO {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface StaffUserDTO {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  qq: string;
  skills: string;
  /** 所属部门（配置中心部门 ID），用于机器人按部门 @审核员 */
  department_id: string | null;
  department_name: string | null;
  status: 'active' | 'disabled';
  created_at: string;
}

export interface AuditLogDTO {
  id: string;
  operator_id: string | null;
  operator_name: string;
  action: string;
  resource: string;
  target_id: string;
  before: string;
  after: string;
  created_at: string;
}

export interface LoginResultDTO {
  token: string;
  user: StaffUserDTO;
}

export interface FeedbackContacts {
  chief: { name: string; qq: string };
  deputy: { name: string; qq: string };
}

export interface UploadLimitsDTO {
  max_file_mb: number;
  max_files: number;
  image_ext: string[];
  video_ext: string[];
}

/** 系统配置（规则配置中心 - 平台项） */
export interface SystemConfigDTO {
  feedback_contacts: FeedbackContacts;
  submission_cooldown_hours: number;
  reviewer_max_concurrent: number;
  upload_limits: UploadLimitsDTO;
  /**
   * 是否强制要求接洽码已绑定 QQ openid 才能提交。
   * 机器人接管入口后开启；仍保留后台手工发码流程时保持关闭。
   */
  robot_require_bound_key: boolean;
}

/** 规则配置中心的对外只读快照：驱动申请表单与规则页 */
export interface RulesBundleDTO {
  departments: DepartmentDTO[];
  feedback_contacts: FeedbackContacts;
  device_notes: string[];
  grade_ladder: string[];
}

/** 接洽码（一次性）：审核员生成后线下交付申请人，提单时消耗 */
export interface ContactKeyDTO {
  id: string;
  code: string;
  /** 签发人；为空表示由 QQ 机器人应玩家请求签发 */
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  status: 'unused' | 'used';
  used_ticket_id: string | null;
  used_at: string | null;
  /** 机器人 @拿码时绑定的 QQ openid；后台手工生成的码为空 */
  bind_openid: string | null;
  bound_at: string | null;
}

/** QQ 机器人身份绑定：openid ↔ 系统用户 */
export interface RobotIdentityDTO {
  openid: string;
  /** QQ 号码，仅用于展示与后台管理，@人一律用 openid */
  qq_number: string;
  role: RobotRole;
  /** 审核员所属部门；申请人为 null */
  dept_id: string | null;
  dept_name: string | null;
  /** 绑定来源：bot 为群里 @机器人 注册，manual 为总管后台录入 */
  source: 'bot' | 'manual';
  /** 绑定时记录的系统账号 ID（认证 ID），玩家为空 */
  user_id: string | null;
  guild_id: string;
  created_at: string;
}

/** 机器人消息日志（收发双向） */
export interface RobotMessageDTO {
  id: string;
  direction: RobotMessageDirection;
  kind: RobotMessageKind;
  status: RobotMessageStatus;
  /** 入站为发送者 openid，出站为接收者 openid */
  openid: string;
  guild_id: string;
  content: string;
  ticket_id: string | null;
  contact_key_id: string | null;
  /** 发送失败原因；成功为空 */
  error: string;
  created_at: string;
  sent_at: string | null;
}

/** 机器人接入状态摘要（管理后台顶部展示） */
export interface RobotStatusDTO {
  /** 缺少任一凭据即为未接通，此时只记消息日志不投递 */
  configured: boolean;
  sandbox: boolean;
  appid: string;
  identity_count: number;
  bound_key_count: number;
  failed_message_count: number;
  /** 机器人签发接洽码时的签发人展示名 */
  issuer_name: string;
}

export interface LookupResultDTO {
  ticket: TicketSummaryDTO;
  receipt: ReceiptDTO | null;
  events: TicketEventDTO[];
}

export interface SubmitResultDTO {
  ticket_id: string;
  query_code: string;
}

export interface StatsDTO {
  status_counts: Record<string, number>;
  today_new: number;
  avg_review_hours: number | null;
  total_published: number;
  active_reviewers: number;
  per_department: { department_id: string; department_name: string; count: number }[];
  recent_published: PublicityItemDTO[];
}

/** 申诉记录（工单子记录） */
export interface AppealDTO {
  id: string;
  ticket_id: string;
  circle_name: string;
  department_name: string;
  mode_name: string;
  status: AppealStatus;
  reason: string;
  contact: string;
  handle_note: string;
  handled_by_name: string | null;
  handled_at: string | null;
  created_at: string;
}
