import crypto from 'node:crypto';
import type { RobotPanelItemDTO, RobotPanelScope } from '@sr/shared';
import {
  ADMIN_SITE_URL,
  PUBLIC_SITE_URL,
  QQ_BOT_APPID,
  QQ_BOT_SANDBOX,
  QQ_BOT_SECRET,
  isRobotConfigured,
} from '../env.js';

/**
 * QQ 官方开放平台机器人客户端（q.qq.com）。
 * 只做两件事：校验回调签名、调用开放接口发消息。
 * 未配置凭据时不发起网络请求，由上层把消息记为「失败」等待总管手动重发。
 */

const OPEN_API_BASE = QQ_BOT_SANDBOX
  ? 'https://sandbox.api.sgroup.qq.com'
  : 'https://api.sgroup.qq.com';
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';

// ---------------------------------------------------------------------------
// Ed25519 签名（回调地址验证与入站消息验签共用同一密钥对）
// ---------------------------------------------------------------------------

/**
 * 用 Bot Secret 作为种子派生 Ed25519 密钥对。
 * 平台约定：Secret 字节不足 32 时循环填充至 32 字节作为私钥种子。
 */
function botPrivateKey(): crypto.KeyObject {
  const seed = Buffer.alloc(32);
  const secret = Buffer.from(QQ_BOT_SECRET, 'utf8');
  if (secret.length === 0) throw new Error('未配置 QQ_BOT_SECRET');
  for (let i = 0; i < 32; i += 1) seed[i] = secret[i % secret.length] ?? 0;
  // Ed25519 私钥的 PKCS#8 前缀固定，拼接 32 字节种子即为完整 DER
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

/** 平台回调地址验证要求：对 event_ts + plain_token 签名并回传 */
export function signPlainToken(plainToken: string, eventTs: string): string {
  return crypto
    .sign(null, Buffer.from(`${eventTs}${plainToken}`), botPrivateKey())
    .toString('hex');
}

/**
 * 校验入站回调签名（X-Signature-Ed25519 / X-Signature-Timestamp）。
 * 未配置 Secret、缺少签名头或原文时一律返回 false（webhook 路由据此拒绝请求）。
 */
export function verifyWebhookSignature(
  signature: string | undefined,
  timestamp: string | undefined,
  rawBody: Buffer | undefined,
): boolean {
  if (!QQ_BOT_SECRET || !signature || !timestamp || !rawBody) return false;
  try {
    const publicKey = crypto.createPublicKey(botPrivateKey());
    return crypto.verify(
      null,
      Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]),
      publicKey,
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 开放接口
// ---------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

/** 应用级 AccessToken，带过期缓存（提前 60 秒刷新） */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: QQ_BOT_APPID, clientSecret: QQ_BOT_SECRET }),
  });
  if (!res.ok) {
    throw new Error(`获取 AccessToken 失败：HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: string | number };
  if (!data.access_token) throw new Error('获取 AccessToken 失败：响应缺少 access_token');
  const ttl = Number(data.expires_in ?? 7200) * 1000;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + ttl - 60_000 };
  return data.access_token;
}

/** 测试与配置切换时清理 token 缓存 */
export function resetAccessTokenCache(): void {
  cachedToken = null;
}

/**
 * 回复面板里的一枚按钮。
 * type=0 跳转（打开网页）；type=1 回调（点击后平台下发 INTERACTION_CREATE，data 原样回传，
 * 机器人据此走与文字指令相同的分发逻辑）；type=2 指令（把 data 填进聊天输入框，
 * 旧客户端需手动按发送）。本系统主用回调型，规避客户端版本差异。
 */
export interface RobotKeyboardButton {
  /** 同一条 keyboard 内唯一，平台回传时用它区分按钮 */
  id: string;
  /** 按钮展示文案（可以比指令更友好，不影响分发） */
  label: string;
  type: 0 | 1 | 2;
  /** type=0 时为跳转链接；type=1/2 时为指令文本 */
  data: string;
  /** 仅 type=2 有意义：点击后是否自动发送 */
  enter?: boolean;
  /** 0 灰色线框（默认）、1 蓝色线框 */
  style?: 0 | 1;
}

/** 回复面板的按钮行：平台限制最多 5 行、每行最多 5 个按钮 */
export type RobotKeyboardRow = RobotKeyboardButton[];

export interface RobotMessageBody {
  /** 群聊传 group_openid；私聊传用户 openid */
  target: { kind: 'group' | 'c2c'; openid: string };
  content: string;
  /** 被动回复必须回填平台下发的 msg_id */
  msgId?: string;
  /** 回复面板按钮组；留空则只发文本 */
  keyboard?: RobotKeyboardRow[];
}

/** 平台要求「同一条消息」的多个被动回复以 msg_seq 区分，此处按序号自增 */
const msgSeqCounter = new Map<string, number>();
function nextMsgSeq(msgId: string): number {
  const next = (msgSeqCounter.get(msgId) ?? 0) + 1;
  msgSeqCounter.set(msgId, next);
  return next;
}

/**
 * 构造消息按钮组（回复面板）。
 * 平台约定：permission.type=2 表示所有人可点；render_data 的 label / visited_label / style 必填；
 * 跳转按钮把链接放在 action.data，并在 permission.url 上同步一份。
 */
export function buildKeyboard(rows: RobotKeyboardRow[]) {
  return {
    content: {
      rows: rows.map((row) => ({
        buttons: row.map((button) => {
          const render_data = {
            label: button.label,
            visited_label: button.label,
            style: button.style ?? 1,
          };
          if (button.type === 0) {
            return {
              id: button.id,
              render_data,
              action: { type: 0, data: button.data, permission: { type: 2, url: button.data } },
            };
          }
          const action: Record<string, unknown> = {
            type: button.type,
            data: button.data,
            permission: { type: 2 },
          };
          if (button.type === 2) action['enter'] = button.enter ?? false;
          return { id: button.id, render_data, action };
        }),
      })),
    },
  };
}

/**
 * 发送消息到 QQ 群或私聊。
 * 抛出异常表示投递失败；调用方负责落库为 failed 以便重发。
 */
export async function sendRobotMessage(body: RobotMessageBody): Promise<void> {
  if (!isRobotConfigured()) {
    throw new Error('机器人凭据未配置（QQ_BOT_APPID / QQ_BOT_SECRET）');
  }
  const token = await getAccessToken();
  const path =
    body.target.kind === 'group'
      ? `/v2/groups/${body.target.openid}/messages`
      : `/v2/users/${body.target.openid}/messages`;
  const payload: Record<string, unknown> = {
    content: body.content,
    msg_type: 0,
  };
  if (body.msgId) {
    payload.msg_id = body.msgId;
    payload.msg_seq = nextMsgSeq(body.msgId);
  }
  if (body.keyboard?.length) payload.keyboard = buildKeyboard(body.keyboard);

  const res = await fetch(`${OPEN_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `QQBot ${token}`,
      'X-Union-Appid': QQ_BOT_APPID,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`发送失败：HTTP ${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`);
  }
}

/**
 * 回应交互事件（按钮回调 type=11 / 快捷菜单回调 type=12）。
 * 平台要求 3 秒内 PUT 应答，否则客户端一直 loading；应答后业务照常另发消息。
 */
export async function ackInteraction(interactionId: string): Promise<void> {
  if (!isRobotConfigured()) throw new Error('机器人凭据未配置（QQ_BOT_APPID / QQ_BOT_SECRET）');
  const token = await getAccessToken();
  const res = await fetch(`${OPEN_API_BASE}/interactions/${encodeURIComponent(interactionId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `QQBot ${token}`,
      'X-Union-Appid': QQ_BOT_APPID,
    },
    body: JSON.stringify({ code: 0 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`交互应答失败：HTTP ${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`);
  }
}

/**
 * 调用开放接口的通用封装：统一鉴权头，并把平台的 err_code 带进错误信息。
 * 平台约定 HTTP 200 也可能是业务失败（响应体里有 err_code），因此两层都要判。
 * 失败信息保留 err_code，便于上层按码识别（例如 40030006 指令面板不存在）。
 */
async function openApiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!isRobotConfigured()) {
    throw new Error('机器人凭据未配置（QQ_BOT_APPID / QQ_BOT_SECRET）');
  }
  const token = await getAccessToken();
  const res = await fetch(`${OPEN_API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `QQBot ${token}`,
      'X-Union-Appid': QQ_BOT_APPID,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  let payload: Record<string, unknown> | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }
  const errCode = typeof payload?.['err_code'] === 'number' ? payload['err_code'] : 0;
  if (!res.ok || errCode !== 0) {
    const message = typeof payload?.['message'] === 'string' ? payload['message'] : '';
    const detail = message || (text ? text.slice(0, 200) : '');
    throw new Error(
      `开放接口调用失败：HTTP ${res.status}${errCode ? ` err_code ${errCode}` : ''}${detail ? ` ${detail}` : ''}`,
    );
  }
  return (payload ?? {}) as T;
}

// ---------------------------------------------------------------------------
// 指令面板（/v2/panels）：管理端快捷菜单只覆盖单聊，群聊面板只能走 API 创建
// ---------------------------------------------------------------------------

/** 平台返回的面板记录 */
export interface QQPanelRecord {
  panel_id: string;
  scope: string;
  target_type: string;
  panel?: { items?: RobotPanelItemDTO[]; remark?: string; version?: number };
  created_at?: string;
  updated_at?: string;
  version?: number;
}

/** 创建 / 更新面板时提交的内容 */
export interface QQPanelInput {
  items: RobotPanelItemDTO[];
  remark?: string;
}

/** 分页拉取某场景下的面板（最多 5 页，足够覆盖 20 个面板上限） */
export async function listRobotPanels(scope: RobotPanelScope): Promise<QQPanelRecord[]> {
  const out: QQPanelRecord[] = [];
  let cursor = '';
  for (let page = 0; page < 5; page += 1) {
    const query = `?scope=${scope}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await openApiRequest<{
      records?: QQPanelRecord[];
      next_cursor?: string;
      is_end?: boolean;
    }>('GET', `/v2/panels${query}`);
    out.push(...(data.records ?? []));
    cursor = data.next_cursor ?? '';
    if (data.is_end || !cursor) break;
  }
  return out;
}

/** 创建面板，返回平台侧 panel_id。群聊面板单次最多关联 20 个群，超出部分需再调 target 接口 */
export async function createRobotPanel(input: {
  scope: RobotPanelScope;
  targetType: 'all' | 'specific';
  groupOpenids?: string[];
  panel: QQPanelInput;
}): Promise<string> {
  const body: Record<string, unknown> = {
    scope: input.scope,
    target_type: input.targetType,
    panel: { items: input.panel.items, ...(input.panel.remark ? { remark: input.panel.remark } : {}) },
  };
  if (input.groupOpenids?.length) body['group_openids'] = input.groupOpenids.slice(0, 20);
  const data = await openApiRequest<{ panel_id?: string }>('POST', '/v2/panels', body);
  if (!data.panel_id) throw new Error('创建指令面板失败：响应缺少 panel_id');
  return data.panel_id;
}

/** 覆盖面板元素与备注，不影响已关联的群 */
export async function updateRobotPanel(panelId: string, panel: QQPanelInput): Promise<void> {
  await openApiRequest('PUT', `/v2/panels/${encodeURIComponent(panelId)}`, {
    panel: { items: panel.items, ...(panel.remark ? { remark: panel.remark } : {}) },
  });
}

export async function deleteRobotPanel(panelId: string): Promise<void> {
  await openApiRequest('DELETE', `/v2/panels/${encodeURIComponent(panelId)}`);
}

/** 增删面板关联的群（仅 group 场景）；平台单次最多 20 个 openid，超出自动分批 */
export async function updateRobotPanelTargets(
  panelId: string,
  op: 'add' | 'del',
  groupOpenids: string[],
): Promise<void> {
  for (let i = 0; i < groupOpenids.length; i += 20) {
    await openApiRequest('PUT', `/v2/panels/${encodeURIComponent(panelId)}/target`, {
      op,
      group_openids: groupOpenids.slice(i, i + 20),
    });
  }
}

/** 附件下载上限，与 upload_limits 的默认口径一致，防止恶意大文件打爆磁盘 */
const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;

/**
 * 下载 QQ 平台下发的图片/视频附件（事件里的 attachments[].url）。
 * 只接受 https 且非内网主机的公开地址，避免被伪造回调引向内网（SSRF）。
 */
export async function downloadRobotAttachment(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('附件地址无效');
  }
  if (parsed.protocol !== 'https:') throw new Error('附件地址不是 https，已拒绝下载');
  if (isPrivateHost(parsed.hostname)) throw new Error('附件地址指向内网，已拒绝下载');

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`下载附件失败：HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES) throw new Error('附件超过大小限制');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('附件超过大小限制');
  return { buffer, contentType: (res.headers.get('content-type') ?? '').toLowerCase() };
}

/** 判定主机是否为回环 / 内网 / 链路本地地址（含字面量 IP 与常见内网域名后缀） */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.startsWith('[')) return true; // IPv6 字面量一律拒绝，平台附件不会用
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// ---------------------------------------------------------------------------
// 按钮链接（与用户端 / 管理端路由一一对应）
//
// 两端均为 HashRouter（路由在 # 之后），且主要使用路径是手机 QQ 内嵌浏览器点击按钮。
// 若输出裸路径（如 /apply），内嵌浏览器会请求服务端真实路径而掉回首页/落地页，
// 因此必须带 `/#/` 前缀，由前端路由接管。
// ---------------------------------------------------------------------------

export function applyLink(code: string): string {
  return `${PUBLIC_SITE_URL}/#/apply?code=${encodeURIComponent(code)}`;
}

/** 申请入口（不带接洽码）：指令面板 link 元素的兜底跳转 */
export function applyEntryLink(): string {
  return `${PUBLIC_SITE_URL}/#/apply`;
}

export function resultLink(code: string): string {
  return `${PUBLIC_SITE_URL}/#/query?code=${encodeURIComponent(code)}`;
}

/** 结果公示页（QQ 内查看公示列表的兜底入口） */
export function publishedLink(): string {
  return `${PUBLIC_SITE_URL}/#/published`;
}

export function ticketLink(ticketId: string): string {
  return `${ADMIN_SITE_URL}/#/tickets/${encodeURIComponent(ticketId)}`;
}

/** 供管理后台展示机器人接入状态 */
export function robotPlatformInfo(): { configured: boolean; sandbox: boolean; appid: string } {
  return { configured: isRobotConfigured(), sandbox: QQ_BOT_SANDBOX, appid: QQ_BOT_APPID };
}