import type {
  DeviceModule,
  Grade,
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
  intention: string;
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
  intentions: string[];
  feedback_contacts: FeedbackContacts;
  submission_cooldown_hours: number;
  reviewer_max_concurrent: number;
  upload_limits: UploadLimitsDTO;
}

/** 规则配置中心的对外只读快照：驱动申请表单与规则页 */
export interface RulesBundleDTO {
  departments: DepartmentDTO[];
  intentions: string[];
  feedback_contacts: FeedbackContacts;
  device_notes: string[];
  grade_ladder: string[];
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
