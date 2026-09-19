import { API, type AppealDTO, type SubmitResultDTO, type SubmitTicketInput } from '@sr/shared';
import { request } from './client';

/** 提交工单：multipart（ticket 字段为 JSON 文本，files 为证据附件） */
export function submitTicket(input: SubmitTicketInput, files: File[]): Promise<SubmitResultDTO> {
  const form = new FormData();
  form.append('ticket', JSON.stringify(input));
  for (const file of files) {
    form.append('files', file, file.name);
  }
  return request<SubmitResultDTO>(API.tickets.submit, { method: 'POST', body: form });
}

/** 申请人补充材料：identity 字段为 JSON 文本，files 为补充附件 */
export function provideSupplement(
  ticketId: string,
  identity: { circle_name: string; query_code: string; note?: string },
  files: File[],
): Promise<unknown> {
  const form = new FormData();
  form.append('identity', JSON.stringify(identity));
  for (const file of files) {
    form.append('files', file, file.name);
  }
  return request<unknown>(API.tickets.supplement(ticketId), { method: 'POST', body: form });
}

/** 提交申诉：凭圈名 + 查询码校验身份，落库为工单子记录 */
export function submitAppeal(
  ticketId: string,
  input: { circle_name: string; query_code: string; reason: string; contact?: string },
): Promise<AppealDTO> {
  return request<AppealDTO>(API.tickets.appeal(ticketId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
