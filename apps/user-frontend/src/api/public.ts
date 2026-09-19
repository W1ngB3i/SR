import { API, type AnnouncementDTO, type LookupResultDTO, type Page, type PublicityItemDTO, type RulesBundleDTO } from '@sr/shared';
import { request } from './client';

/** 规则快照：驱动申请表单与规则页 */
export const fetchRules = () => request<RulesBundleDTO>(API.publicApi.rules);

/** 公示页公告（置顶在前） */
export const fetchAnnouncements = () =>
  request<AnnouncementDTO[]>(API.publicApi.announcements);

export interface PublishedQuery {
  page: number;
  page_size: number;
  department_id?: string;
  keyword?: string;
  [key: string]: string | number | undefined;
}

/** 公示列表（脱敏字段） */
export const fetchPublished = (query: PublishedQuery) =>
  request<Page<PublicityItemDTO>>(API.publicApi.published, { query });

/** 进度查询：圈名 + 查询码 */
export const lookupTicket = (params: { circle_name: string; query_code: string }) =>
  request<LookupResultDTO>(API.publicApi.lookup, { query: params });
