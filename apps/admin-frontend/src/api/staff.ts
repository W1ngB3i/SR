import {
  API,
  type AttachmentDTO,
  type LoginResultDTO,
  type Page,
  type ReceiptDTO,
  type StaffUserDTO,
  type TicketDetailDTO,
  type TicketSummaryDTO,
} from '@sr/shared';
import { request } from './client';

/** 登录：换取 12h JWT 与人员信息 */
export const login = (username: string, password: string) =>
  request<LoginResultDTO>(API.auth.login, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

// ---------------------------------------------------------------------------
// 工单池 / 审核工作台
// ---------------------------------------------------------------------------

export interface TicketListQuery {
  /** 逗号分隔的多状态 */
  status?: string;
  department_id?: string;
  module?: string;
  intention?: string;
  keyword?: string;
  mine?: '1';
  page: number;
  page_size: number;
}

export const fetchTickets = (query: TicketListQuery) =>
  request<Page<TicketSummaryDTO>>(API.tickets.list, {
    query: query as unknown as Record<string, string | number | undefined>,
  });

export const fetchTicketDetail = (id: string) =>
  request<TicketDetailDTO>(API.tickets.detail(id));

/** 可指派的在职审核人员（指派弹窗） */
export const fetchAssignables = () =>
  request<StaffUserDTO[]>(API.tickets.assignables);

export const claimTicket = (id: string) =>
  request<TicketSummaryDTO>(API.tickets.claim(id), { method: 'POST' });

export const assignTicket = (id: string, assigneeId: string) =>
  request<TicketSummaryDTO>(API.tickets.assign(id), {
    method: 'POST',
    body: JSON.stringify({ assignee_id: assigneeId }),
  });

export const releaseTicket = (id: string, reason: string) =>
  request<TicketSummaryDTO>(API.tickets.release(id), {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const togglePin = (id: string) =>
  request<TicketSummaryDTO>(API.tickets.pin(id), { method: 'POST' });

export const requestSupplement = (id: string, reason: string) =>
  request<TicketSummaryDTO>(API.tickets.supplementRequest(id), {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export interface ReceiptInput {
  pe_grade?: string | null;
  pc_grade?: string | null;
  pass?: boolean | null;
  target_department: string;
  comment: string;
  submit: boolean;
}

export const saveReceipt = (id: string, input: ReceiptInput) =>
  request<TicketDetailDTO>(API.tickets.receipt(id), {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const reviewTicket = (id: string, action: 'confirm' | 'reject', note: string) =>
  request<TicketSummaryDTO>(API.tickets.review(id), {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  });

export const publishTicket = (id: string) =>
  request<TicketSummaryDTO>(API.tickets.publish(id), { method: 'POST' });

/** 修订工单基础信息（总管/副总管全权） */
export const updateTicketInfo = (
  id: string,
  patch: Partial<{
    circle_name: string;
    contact: string;
    intention: string;
    department_id: string;
    mode_id: string;
    module: 'PE' | 'PC' | 'BOTH';
    self_proof: boolean;
  }>,
) => request<TicketDetailDTO>(API.tickets.info(id), { method: 'PUT', body: JSON.stringify(patch) });

/** 撤销公示（总管/副总管全权） */
export const unpublishTicket = (id: string) =>
  request<TicketSummaryDTO>(API.tickets.unpublish(id), { method: 'POST' });

/** 删除工单（总管/副总管全权，不可恢复） */
export const deleteTicket = (id: string) =>
  request<{ ok: boolean }>(API.tickets.remove(id), { method: 'DELETE' });

/** 证据直链（带签名 token，直接用于 img / video src） */
export const attachmentStreamUrl = (a: AttachmentDTO): string => a.url;

export type { ReceiptDTO };
