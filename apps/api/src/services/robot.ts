import {
  ROBOT_ROLE_LABELS,
  RobotMessageKind,
  RobotRole,
  type RobotIdentityDTO,
  type RobotMessageDTO,
  type RobotMessageStatus,
  type Page,
} from '@sr/shared';
import { getDb } from '../db/index.js';
import { newId, nowIso } from '../lib/ids.js';
import { ApiError } from '../lib/errors.js';
import { isRobotConfigured } from '../env.js';
import { writeAudit, type AuditActor } from './audit.js';
import { getStaffUserById } from './user.js';
import { applyLink, resultLink, sendRobotMessage, ticketLink } from './qq.js';
import { ROBOT_ISSUER_NAME, findApplicantBinding, issueContactKeyForOpenid } from './key.js';

/**
 * QQ 机器人服务：身份绑定、接洽码签发、消息日志与通知投递。
 * 设计原则：机器人只做触发与通知，表单填写与审核操作始终在网站端完成。
 */

// ---------------------------------------------------------------------------
// 身份绑定
// ---------------------------------------------------------------------------

interface IdentityRow {
  openid: string;
  qq_number: string;
  role: RobotRole;
  dept_id: string | null;
  dept_name: string | null;
  user_id: string | null;
  guild_id: string;
  source: 'bot' | 'manual';
  created_at: string;
}

const IDENTITY_SELECT = `SELECT r.*, d.name AS dept_name
  FROM robot_identities r LEFT JOIN department d ON d.id = r.dept_id`;

function toIdentityDTO(row: IdentityRow): RobotIdentityDTO {
  return {
    openid: row.openid,
    qq_number: row.qq_number,
    role: row.role,
    dept_id: row.dept_id,
    dept_name: row.dept_name,
    source: row.source,
    user_id: row.user_id,
    guild_id: row.guild_id,
    created_at: row.created_at,
  };
}

export function listIdentities(filters: {
  keyword?: string;
  role?: string;
  dept_id?: string;
  page: number;
  pageSize: number;
}): Page<RobotIdentityDTO> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.keyword) {
    where.push('(r.qq_number LIKE ? OR r.openid LIKE ?)');
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }
  if (filters.role) {
    where.push('r.role = ?');
    params.push(filters.role);
  }
  if (filters.dept_id) {
    where.push('r.dept_id = ?');
    params.push(filters.dept_id);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM robot_identities r ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `${IDENTITY_SELECT} ${whereSql}
       ORDER BY r.created_at DESC, r.openid ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as IdentityRow[];
  return { items: rows.map(toIdentityDTO), page: filters.page, page_size: filters.pageSize, total };
}

function writeIdentity(
  input: {
    openid: string;
    qq_number: string;
    role: RobotRole;
    dept_id: string | null;
    user_id: string | null;
    guild_id: string;
    source: 'bot' | 'manual';
  },
  actor: AuditActor | null,
): RobotIdentityDTO {
  const db = getDb();
  const before = db
    .prepare(`${IDENTITY_SELECT} WHERE r.openid = ?`)
    .get(input.openid) as IdentityRow | undefined;
  if (before) {
    // qq_number 以调用方传入为准（后台可清空）；guild_id 为空时沿用旧值（私聊重绑不丢所在群）
    db.prepare(
      `UPDATE robot_identities SET qq_number = ?, role = ?, dept_id = ?, user_id = ?, guild_id = ?, source = ?
       WHERE openid = ?`,
    ).run(
      input.qq_number,
      input.role,
      input.dept_id,
      input.user_id,
      input.guild_id || before.guild_id,
      input.source,
      input.openid,
    );
  } else {
    db.prepare(
      `INSERT INTO robot_identities (openid, qq_number, role, dept_id, user_id, guild_id, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.openid,
      input.qq_number,
      input.role,
      input.dept_id,
      input.user_id,
      input.guild_id,
      input.source,
      nowIso(),
    );
  }
  writeAudit({
    operator: actor,
    action: before ? 'robot_identity.update' : 'robot_identity.create',
    resource: 'robot_identity',
    targetId: input.openid,
    before: before ? JSON.stringify({ role: before.role, dept_id: before.dept_id }) : '',
    after: JSON.stringify({ role: input.role, dept_id: input.dept_id, qq_number: input.qq_number }),
    detail: before ? '更新机器人身份绑定' : '新增机器人身份绑定',
  });
  const row = db.prepare(`${IDENTITY_SELECT} WHERE r.openid = ?`).get(input.openid) as IdentityRow;
  return toIdentityDTO(row);
}

/** 总管在后台手动录入绑定，不必等审核员在群里 @机器人 */
export function createIdentity(
  input: {
    openid: string;
    qq_number: string;
    role: RobotRole;
    dept_id?: string | null;
    guild_id?: string;
  },
  actor: AuditActor,
): RobotIdentityDTO {
  return writeIdentity(
    {
      openid: input.openid,
      qq_number: input.qq_number,
      role: input.role,
      dept_id: input.dept_id ?? null,
      user_id: null,
      guild_id: input.guild_id ?? '',
      source: 'manual',
    },
    actor,
  );
}

export function updateIdentity(
  openid: string,
  patch: {
    qq_number?: string;
    role?: RobotRole;
    dept_id?: string | null;
    guild_id?: string;
  },
  actor: AuditActor,
): RobotIdentityDTO {
  const row = getDb()
    .prepare('SELECT * FROM robot_identities WHERE openid = ?')
    .get(openid) as IdentityRow | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '绑定记录不存在');
  return writeIdentity(
    {
      openid,
      qq_number: patch.qq_number ?? row.qq_number,
      role: patch.role ?? row.role,
      dept_id: patch.dept_id === undefined ? row.dept_id : patch.dept_id,
      user_id: row.user_id,
      guild_id: patch.guild_id ?? row.guild_id,
      // 人工修正过的记录标记为手工维护，避免后续被自动绑定覆盖语义
      source: 'manual',
    },
    actor,
  );
}

export function deleteIdentity(openid: string, actor: AuditActor): void {
  const db = getDb();
  const before = db
    .prepare('SELECT * FROM robot_identities WHERE openid = ?')
    .get(openid) as IdentityRow | undefined;
  if (!before) throw ApiError.notFound('RESOURCE_NOT_FOUND', '绑定记录不存在');
  db.prepare('DELETE FROM robot_identities WHERE openid = ?').run(openid);
  writeAudit({
    operator: actor,
    action: 'robot_identity.delete',
    resource: 'robot_identity',
    targetId: openid,
    before: JSON.stringify({ role: before.role, qq_number: before.qq_number }),
    detail: '删除机器人身份绑定',
  });
}

// ---------------------------------------------------------------------------
// 消息日志
// ---------------------------------------------------------------------------

function toMessageDTO(row: MessageRow): RobotMessageDTO {
  return { ...row, kind: row.kind as RobotMessageDTO['kind'] };
}

interface MessageRow {
  id: string;
  direction: 'in' | 'out';
  kind: string;
  status: RobotMessageStatus;
  openid: string;
  guild_id: string;
  content: string;
  ticket_id: string | null;
  contact_key_id: string | null;
  error: string;
  created_at: string;
  sent_at: string | null;
}

export function listMessages(filters: {
  status?: string;
  kind?: string;
  page: number;
  pageSize: number;
}): Page<RobotMessageDTO> {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.kind) {
    where.push('kind = ?');
    params.push(filters.kind);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM robot_message ${whereSql}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = db
    .prepare(
      `SELECT * FROM robot_message ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize) as MessageRow[];
  return { items: rows.map(toMessageDTO), page: filters.page, page_size: filters.pageSize, total };
}

function insertMessage(input: {
  direction: 'in' | 'out';
  kind: RobotMessageKind;
  status: RobotMessageStatus;
  openid: string;
  guildId: string;
  content: string;
  ticketId?: string | null;
  contactKeyId?: string | null;
  error?: string;
  sentAt?: string | null;
}): RobotMessageDTO {
  const row: MessageRow = {
    id: newId('rmsg'),
    direction: input.direction,
    kind: input.kind,
    status: input.status,
    openid: input.openid,
    guild_id: input.guildId,
    content: input.content,
    ticket_id: input.ticketId ?? null,
    contact_key_id: input.contactKeyId ?? null,
    error: input.error ?? '',
    created_at: nowIso(),
    sent_at: input.sentAt ?? null,
  };
  getDb()
    .prepare(
      `INSERT INTO robot_message
        (id, direction, kind, status, openid, guild_id, content, ticket_id, contact_key_id, error, created_at, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.direction,
      row.kind,
      row.status,
      row.openid,
      row.guild_id,
      row.content,
      row.ticket_id,
      row.contact_key_id,
      row.error,
      row.created_at,
      row.sent_at,
    );
  return toMessageDTO(row);
}

/**
 * 被动回复：必须在平台下发 msg_id 的时效内回复，重复回复以 msg_seq 区分。
 * 群聊的 ctx.openid 为「要 @ 的群成员」，ctx.guildId 为群 openid —— 平台发送路径要求群 openid，
 * 成员只能通过 content 里的 @ 标签提及（<@openid> 旧协议已弃用）。
 */
interface ReplyContext {
  target: 'group' | 'c2c';
  openid: string;
  guildId: string;
  msgId: string;
  /** 机器人收到的原始消息，用于回溯谁 @了机器人、发了什么 */
  inboundContent: string;
}

/** 发送一条出站消息并落库；失败不抛出，转为 failed 记录供总管重发 */
async function deliver(
  ctx: { target: 'group' | 'c2c'; openid: string; guildId: string; msgId?: string },
  message: {
    kind: RobotMessageKind;
    content: string;
    button?: { label: string; url: string };
    ticketId?: string | null;
    contactKeyId?: string | null;
  },
): Promise<RobotMessageDTO> {
  const isGroup = ctx.target === 'group';
  const content =
    isGroup && ctx.openid ? `<qqbot-at-user id="${ctx.openid}" /> ${message.content}` : message.content;
  if (!isRobotConfigured()) {
    return insertMessage({
      direction: 'out',
      kind: message.kind,
      status: 'failed',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
      ticketId: message.ticketId,
      contactKeyId: message.contactKeyId,
      error: '机器人凭据未配置（QQ_BOT_APPID / QQ_BOT_SECRET）',
    });
  }
  try {
    await sendRobotMessage({
      target: { kind: ctx.target, openid: isGroup ? ctx.guildId : ctx.openid },
      content,
      msgId: ctx.msgId,
      button: message.button,
    });
    return insertMessage({
      direction: 'out',
      kind: message.kind,
      status: 'sent',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
      ticketId: message.ticketId,
      contactKeyId: message.contactKeyId,
      sentAt: nowIso(),
    });
  } catch (err) {
    return insertMessage({
      direction: 'out',
      kind: message.kind,
      status: 'failed',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
      ticketId: message.ticketId,
      contactKeyId: message.contactKeyId,
      error: err instanceof Error ? err.message : '发送失败',
    });
  }
}

/**
 * 记一条「没发出去」的日志：无接收人时不能走 deliver —— 那会真的去请求平台并留下
 * 一条永远重发不成功的失败记录。此处只留痕，供总管排查为什么没人收到通知。
 */
function logSkipped(input: {
  kind: RobotMessageKind;
  reason: string;
  ticketId?: string | null;
}): RobotMessageDTO {
  return insertMessage({
    direction: 'out',
    kind: input.kind,
    status: 'skipped',
    openid: '',
    guildId: '',
    content: input.reason,
    ticketId: input.ticketId ?? null,
  });
}

/** 手动重发失败的出站消息 */
export async function resendMessage(id: string, actor: AuditActor): Promise<RobotMessageDTO> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM robot_message WHERE id = ?').get(id) as
    | MessageRow
    | undefined;
  if (!row) throw ApiError.notFound('RESOURCE_NOT_FOUND', '消息记录不存在');
  if (row.direction !== 'out') {
    throw ApiError.badRequest('INVALID_INPUT', '只有发出的消息可以重发');
  }
  if (row.status !== 'failed') {
    throw ApiError.badRequest('INVALID_INPUT', '只有发送失败的消息可以重发');
  }
  const result = await deliver(
    { target: row.guild_id ? 'group' : 'c2c', openid: row.openid, guildId: row.guild_id },
    {
      kind: row.kind as RobotMessageKind,
      content: row.content,
      ticketId: row.ticket_id,
      contactKeyId: row.contact_key_id,
    },
  );
  writeAudit({
    operator: actor,
    action: 'robot_message.resend',
    resource: 'robot_message',
    targetId: id,
    after: JSON.stringify({ new_id: result.id, status: result.status }),
    detail: `重发机器人消息（${result.status === 'sent' ? '成功' : '仍失败'}）`,
  });
  return result;
}

// ---------------------------------------------------------------------------
// 入站消息处理
// ---------------------------------------------------------------------------

/** 后台个人中心的认证 ID：新建账号为 usr_<随机串>，内置演示账号为 usr-xingchen 形式 */
const AUTH_ID_RE = /usr[-_][A-Za-z0-9_-]{4,}/;
/** 请求接洽码的关键词 */
const CODE_INTENT_RE = /(接洽码|拿码|要码|申请码|来个码)/;

const HELP_TEXT =
  '我可以帮你做两件事：\n1. 玩家发送「拿接洽码」，我会给你一个一次性接洽码和申请入口；\n2. 审核员发送后台个人中心的认证 ID，我会把你绑定为对应部门的审核员。';

export interface InboundContext {
  target: 'group' | 'c2c';
  /** 群聊为群成员 openid，私聊为用户 openid */
  openid: string;
  /** 群 openid；私聊为空 */
  guildId: string;
  /** 平台下发的消息 ID，用于被动回复 */
  msgId: string;
  content: string;
}

/**
 * 处理一条 @机器人 的入站消息。
 * 只响应 @它 的消息：拿接洽码、审核员注册。
 */
export async function handleInboundMessage(ctx: InboundContext): Promise<RobotMessageDTO> {
  const content = ctx.content.trim();
  const authIdMatch = content.match(AUTH_ID_RE);

  // 审核员注册：直接发后台个人中心的认证 ID
  if (authIdMatch) {
    const userId = authIdMatch[0];
    insertMessage({
      direction: 'in',
      kind: RobotMessageKind.ReviewerBind,
      status: 'received',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
    });
    const user = getStaffUserById(userId);
    if (!user) {
      return deliver(ctx, {
        kind: RobotMessageKind.ReviewerBind,
        content: `认证 ID「${userId}」不存在，请到网站后台个人中心核对后重发。`,
      });
    }
    if (user.status !== 'active') {
      return deliver(ctx, {
        kind: RobotMessageKind.ReviewerBind,
        content: `账号「${user.name}」已停用，无法绑定，请联系审核总管。`,
      });
    }
    const robotRole = toRobotRole(user.role);
    if (!robotRole) {
      return deliver(ctx, {
        kind: RobotMessageKind.ReviewerBind,
        content: `认证 ID「${userId}」对应的账号不是审核员角色，无法绑定。`,
      });
    }
    // 重绑时保留后台已补录的信息：机器人侧拿不到 QQ 号，系统侧账号也可能还没配部门
    const previous = getDb()
      .prepare('SELECT qq_number, dept_id FROM robot_identities WHERE openid = ?')
      .get(ctx.openid) as { qq_number: string; dept_id: string | null } | undefined;
    writeIdentity(
      {
        openid: ctx.openid,
        qq_number: previous?.qq_number ?? '',
        role: robotRole,
        dept_id: user.department_id ?? previous?.dept_id ?? null,
        user_id: user.id,
        guild_id: ctx.guildId,
        source: 'bot',
      },
      null,
    );
    const deptText = user.department_name ? `${user.department_name} ` : '';
    return deliver(ctx, {
      kind: RobotMessageKind.ReviewerBind,
      content: `已绑定为${deptText}${ROBOT_ROLE_LABELS[robotRole]} ${user.name}，新工单将自动 @你。`,
    });
  }

  // 玩家拿接洽码
  if (CODE_INTENT_RE.test(content)) {
    insertMessage({
      direction: 'in',
      kind: RobotMessageKind.IssueCode,
      status: 'received',
      openid: ctx.openid,
      guildId: ctx.guildId,
      content,
    });
    const key = issueContactKeyForOpenid(ctx.openid, ctx.guildId);
    return deliver(ctx, {
      kind: RobotMessageKind.IssueCode,
      content: `这是你的接洽码 ${key.code}，点这里去申请。`,
      button: { label: '去申请', url: applyLink(key.code) },
      contactKeyId: key.id,
    });
  }

  insertMessage({
    direction: 'in',
    kind: RobotMessageKind.Unhandled,
    status: 'received',
    openid: ctx.openid,
    guildId: ctx.guildId,
    content,
  });
  return deliver(ctx, { kind: RobotMessageKind.Unhandled, content: HELP_TEXT });
}

/** 系统角色 → 机器人角色；系统管理员不参与审核，不绑定 */
function toRobotRole(role: string): RobotRole | null {
  if (role === 'reviewer') return RobotRole.Reviewer;
  if (role === 'deputy') return RobotRole.Deputy;
  if (role === 'chief') return RobotRole.Chief;
  return null;
}

// ---------------------------------------------------------------------------
// 工单通知（工单创建 → @审核员；工单公示 → @申请人）
// ---------------------------------------------------------------------------

interface TicketNoticeRow {
  id: string;
  circle_name: string;
  department_id: string;
  department_name: string;
  mode_name: string;
  mode_group: string;
}

function loadTicketNotice(ticketId: string): TicketNoticeRow | null {
  const row = getDb()
    .prepare(
      `SELECT t.id, t.circle_name, t.department_id, d.name AS department_name,
              m.name AS mode_name, m.group_name AS mode_group
       FROM ticket t
       JOIN department d ON d.id = t.department_id
       JOIN mode m ON m.id = t.mode_id
       WHERE t.id = ?`,
    )
    .get(ticketId) as TicketNoticeRow | undefined;
  return row ?? null;
}

/**
 * 工单创建后 @该部门审核员。
 * 未配置机器人凭据时整体跳过，避免本地环境产生大量无效失败记录。
 */
export async function notifyReviewersForTicket(ticketId: string): Promise<void> {
  if (!isRobotConfigured()) return;
  const ticket = loadTicketNotice(ticketId);
  if (!ticket) return;
  const reviewers = getDb()
    .prepare(
      `SELECT openid, guild_id FROM robot_identities
       WHERE dept_id = ? AND role IN ('reviewer','deputy','chief') AND guild_id <> ''
       ORDER BY created_at ASC`,
    )
    .all(ticket.department_id) as { openid: string; guild_id: string }[];

  const modeText = ticket.mode_group ? `${ticket.mode_group} ${ticket.mode_name}` : ticket.mode_name;
  const content = `新工单 ${ticket.id}，圈名 ${ticket.circle_name}，部门 ${ticket.department_name}，模式 ${modeText}，点这里接单。`;
  const button = { label: '去接单', url: ticketLink(ticket.id) };

  if (reviewers.length === 0) {
    logSkipped({
      kind: RobotMessageKind.TicketCreated,
      reason: `工单 ${ticket.id}（${ticket.department_name}）没有已绑定该部门的审核员，未 @任何人；可在「身份绑定」补录。`,
      ticketId: ticket.id,
    });
    return;
  }
  for (const reviewer of reviewers) {
    await deliver(
      { target: 'group', openid: reviewer.openid, guildId: reviewer.guild_id },
      { kind: RobotMessageKind.TicketCreated, content, button, ticketId: ticket.id },
    );
  }
}

/** 工单公示后 @申请人推送结果（openid 取自接洽码绑定） */
export async function notifyApplicantForTicket(ticketId: string): Promise<void> {
  if (!isRobotConfigured()) return;
  const binding = findApplicantBinding(ticketId);
  const ticket = loadTicketNotice(ticketId);
  if (!ticket) return;
  if (!binding) {
    logSkipped({
      kind: RobotMessageKind.TicketResult,
      reason: `工单 ${ticket.id} 已公示，但该工单的接洽码未绑定 QQ，无法 @申请人推送结果。`,
      ticketId: ticket.id,
    });
    return;
  }
  const receipt = getDb()
    .prepare('SELECT pass FROM receipt WHERE ticket_id = ?')
    .get(ticketId) as { pass: number | null } | undefined;
  const verdict = receipt?.pass === 1 ? '通过' : '不通过';
  // 签发接洽码时记下的群优先；历史数据没有群标识时回退查身份绑定，再不行走私聊
  const groupId =
    binding.guild_id ||
    (
      getDb()
        .prepare('SELECT guild_id FROM robot_identities WHERE openid = ?')
        .get(binding.openid) as { guild_id: string } | undefined
    )?.guild_id ||
    '';
  await deliver(
    { target: groupId ? 'group' : 'c2c', openid: binding.openid, guildId: groupId },
    {
      kind: RobotMessageKind.TicketResult,
      content: `工单 ${ticket.id} 审核结果：${verdict}。圈名 ${ticket.circle_name}，部门 ${ticket.department_name}。`,
      button: { label: '查看结果', url: resultLink(binding.code) },
      ticketId: ticket.id,
    },
  );
}

/** 管理后台展示的机器人接入状态 */
export function robotSummary(platform: { configured: boolean; sandbox: boolean; appid: string }): {
  configured: boolean;
  sandbox: boolean;
  appid: string;
  identity_count: number;
  bound_key_count: number;
  failed_message_count: number;
  issuer_name: string;
} {
  const db = getDb();
  const count = (sql: string): number => (db.prepare(sql).get() as { c: number }).c;
  return {
    ...platform,
    identity_count: count('SELECT COUNT(*) AS c FROM robot_identities'),
    bound_key_count: count('SELECT COUNT(*) AS c FROM contact_key WHERE bind_openid IS NOT NULL'),
    failed_message_count: count(`SELECT COUNT(*) AS c FROM robot_message WHERE status = 'failed'`),
    issuer_name: ROBOT_ISSUER_NAME,
  };
}