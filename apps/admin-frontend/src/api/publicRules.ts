import { API, type RulesBundleDTO } from '@sr/shared';
import { request } from './client';

/** 规则快照（公开接口）：部门 / 意向筛选项复用，避免越权访问 admin 接口 */
export const fetchRules = () => request<RulesBundleDTO>(API.publicApi.rules);
