import {
  API,
  type AnnouncementDTO,
  type AppealDTO,
  type AuditLogDTO,
  type DepartmentDTO,
  type ModeDTO,
  type Page,
  type StaffUserDTO,
  type StatsDTO,
  type SystemConfigDTO,
  type UploadLimitsDTO,
} from '@sr/shared';
import { request } from './client';

// ---------------------------------------------------------------------------
// 规则配置中心：部门与模式
// ---------------------------------------------------------------------------

export const fetchDepartments = () => request<DepartmentDTO[]>(API.admin.departments);

export const createDepartment = (input: {
  name: string;
  tier: string;
  contact: string;
  description: string;
  sort: number;
  enabled: boolean;
}) =>
  request<DepartmentDTO>(API.admin.departments, { method: 'POST', body: JSON.stringify(input) });

export const updateDepartment = (
  id: string,
  patch: Partial<{
    name: string;
    tier: string;
    contact: string;
    description: string;
    sort: number;
    enabled: boolean;
  }>,
) => request<DepartmentDTO>(API.admin.department(id), { method: 'PUT', body: JSON.stringify(patch) });

export const deleteDepartment = (id: string) =>
  request<{ ok: boolean }>(API.admin.department(id), { method: 'DELETE' });

export const createMode = (input: {
  department_id: string;
  group_name: string;
  name: string;
  min_requirement: string;
  sort: number;
}) => request<ModeDTO>(API.admin.modes, { method: 'POST', body: JSON.stringify(input) });

export const updateMode = (
  id: string,
  patch: Partial<{
    department_id: string;
    group_name: string;
    name: string;
    min_requirement: string;
    sort: number;
  }>,
) => request<ModeDTO>(API.admin.mode(id), { method: 'PUT', body: JSON.stringify(patch) });

export const deleteMode = (id: string) =>
  request<{ ok: boolean }>(API.admin.mode(id), { method: 'DELETE' });

// ---------------------------------------------------------------------------
// 人员管理
// ---------------------------------------------------------------------------

export const fetchUsers = () => request<StaffUserDTO[]>(API.admin.users);

export const createUser = (input: {
  username: string;
  name: string;
  role: StaffUserDTO['role'];
  password: string;
  qq?: string;
  skills?: string;
}) => request<StaffUserDTO>(API.admin.users, { method: 'POST', body: JSON.stringify(input) });

export const updateUser = (
  id: string,
  patch: Partial<{
    name: string;
    role: StaffUserDTO['role'];
    qq: string;
    skills: string;
    status: 'active' | 'disabled';
  }>,
) => request<StaffUserDTO>(API.admin.user(id), { method: 'PUT', body: JSON.stringify(patch) });

export const resetPassword = (id: string, password: string) =>
  request<{ ok: boolean }>(API.admin.resetPassword(id), {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

// ---------------------------------------------------------------------------
// 公告管理
// ---------------------------------------------------------------------------

export interface AnnouncementInput {
  title: string;
  content: string;
  pinned: boolean;
  expires_at: string | null;
}

export const fetchAllAnnouncements = () =>
  request<AnnouncementDTO[]>(API.admin.announcements);

export const createAnnouncement = (input: AnnouncementInput) =>
  request<AnnouncementDTO>(API.admin.announcements, { method: 'POST', body: JSON.stringify(input) });

export const updateAnnouncement = (id: string, patch: Partial<AnnouncementInput>) =>
  request<AnnouncementDTO>(API.admin.announcement(id), { method: 'PUT', body: JSON.stringify(patch) });

export const deleteAnnouncement = (id: string) =>
  request<{ ok: boolean }>(API.admin.announcement(id), { method: 'DELETE' });

// ---------------------------------------------------------------------------
// 审计日志
// ---------------------------------------------------------------------------

export const fetchAuditLogs = (query: {
  action?: string;
  resource?: string;
  page: number;
  page_size: number;
}) => request<Page<AuditLogDTO>>(API.admin.auditLogs, { query });

// ---------------------------------------------------------------------------
// 系统配置与统计
// ---------------------------------------------------------------------------

export const fetchSystemConfig = () => request<SystemConfigDTO>(API.admin.config);

export const putFeedbackContacts = (contacts: SystemConfigDTO['feedback_contacts']) =>
  request<{ ok: boolean }>(API.admin.configKey('feedback_contacts'), {
    method: 'PUT',
    body: JSON.stringify(contacts),
  });

export const putSubmissionCooldown = (hours: number) =>
  request<{ ok: boolean }>(API.admin.configKey('submission_cooldown_hours'), {
    method: 'PUT',
    body: JSON.stringify(hours),
  });

export const putReviewerMaxConcurrent = (max: number) =>
  request<{ ok: boolean }>(API.admin.configKey('reviewer_max_concurrent'), {
    method: 'PUT',
    body: JSON.stringify(max),
  });

export const putUploadLimits = (limits: UploadLimitsDTO) =>
  request<{ ok: boolean }>(API.admin.configKey('upload_limits'), {
    method: 'PUT',
    body: JSON.stringify(limits),
  });

export const fetchStats = () => request<StatsDTO>(API.admin.stats);

// ---------------------------------------------------------------------------
// 申诉处理
// ---------------------------------------------------------------------------

export const fetchAppeals = (query: {
  status?: string;
  page: number;
  page_size: number;
  [key: string]: string | number | undefined;
}) => request<Page<AppealDTO>>(API.admin.appeals, { query });

export const handleAppeal = (id: string, action: 'resolve' | 'dismiss', note: string) =>
  request<AppealDTO>(API.admin.appeal(id), {
    method: 'PUT',
    body: JSON.stringify({ action, note }),
  });
