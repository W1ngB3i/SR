import {
  API,
  type ContactKeyDTO,
  type Page,
  type RobotIdentityDTO,
  type RobotMessageDTO,
  type RobotRole,
  type RobotStatusDTO,
} from '@sr/shared';
import { request } from './client';

// ---------------------------------------------------------------------------
// 机器人管理：身份绑定 / 接洽码绑定状态 / 消息日志（总管、副总管）
// ---------------------------------------------------------------------------

export const fetchRobotStatus = () => request<RobotStatusDTO>(API.admin.robotStatus);

export const fetchRobotIdentities = (query: {
  keyword?: string;
  role?: string;
  dept_id?: string;
  page: number;
  page_size: number;
}) => request<Page<RobotIdentityDTO>>(API.admin.robotIdentities, { query });

export const createRobotIdentity = (input: {
  openid: string;
  qq_number: string;
  role: RobotRole;
  dept_id?: string | null;
  guild_id?: string;
}) =>
  request<RobotIdentityDTO>(API.admin.robotIdentities, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateRobotIdentity = (
  openid: string,
  patch: Partial<{
    qq_number: string;
    role: RobotRole;
    dept_id: string | null;
    guild_id: string;
  }>,
) =>
  request<RobotIdentityDTO>(API.admin.robotIdentity(openid), {
    method: 'PUT',
    body: JSON.stringify(patch),
  });

export const deleteRobotIdentity = (openid: string) =>
  request<{ ok: boolean }>(API.admin.robotIdentity(openid), { method: 'DELETE' });

export const fetchRobotMessages = (query: {
  status?: string;
  kind?: string;
  page: number;
  page_size: number;
}) => request<Page<RobotMessageDTO>>(API.admin.robotMessages, { query });

export const resendRobotMessage = (id: string) =>
  request<RobotMessageDTO>(API.admin.robotMessageResend(id), { method: 'POST' });

export const fetchAllContactKeys = (query: {
  bound?: 'bound' | 'unbound';
  page: number;
  page_size: number;
}) => request<Page<ContactKeyDTO>>(API.admin.contactKeys, { query });