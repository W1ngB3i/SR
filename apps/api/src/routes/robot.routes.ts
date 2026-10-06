import { Router, type Request } from 'express';
import { QQ_BOT_SECRET } from '../env.js';
import { signPlainToken, verifyWebhookSignature } from '../services/qq.js';
import {
  handleInboundMessage,
  type InboundAttachment,
  type InboundContext,
} from '../services/robot.js';

/**
 * QQ 官方开放平台回调（挂载 /api/robot）。
 * 平台要求：5 秒内返回 200，被动回复消息在 msg_id 有效期内送达。
 * 因此这里先应答，再异步处理业务。
 */
export const robotRouter = Router();

interface WebhookPayload {
  op?: number;
  t?: string;
  d?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 解析平台事件里的 attachments[]，只保留带 url 的图片/视频（证据接收用） */
function parseAttachments(value: unknown): InboundAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: InboundAttachment[] = [];
  for (const raw of value) {
    const item = asRecord(raw);
    const url = asString(item['url']);
    if (!url) continue;
    const filename = asString(item['filename']);
    items.push({
      url,
      content_type: asString(item['content_type']).toLowerCase(),
      ...(filename ? { filename } : {}),
    });
  }
  return items.length ? items : undefined;
}

/** 判定交互事件是否来自群聊：scene=group 或 chat_type=1（群） */
function isGroupScene(d: Record<string, unknown>): boolean {
  const scene = asString(d['scene']).toLowerCase();
  if (scene) return scene === 'group';
  return Number(d['chat_type']) === 1;
}

/**
 * 解析交互事件（type=11 按钮回调 / type=12 快捷菜单回调）。
 * 菜单项配置了「发送指令」时，指令文本随 button_data 下发，直接交给分发器处理。
 */
function parseInteraction(d: Record<string, unknown>): InboundContext | null {
  const interactionId = asString(d['id']);
  if (!interactionId) return null;
  const group = isGroupScene(d);
  const openid = group
    ? asString(d['group_member_openid']) || asString(d['user_openid'])
    : asString(d['user_openid']);
  if (!openid) return null;

  const data = asRecord(d['data']);
  const resolved = asRecord(data['resolved']);
  const content =
    asString(resolved['button_data']) || asString(resolved['button_id']) || asString(d['content']);

  return {
    target: group ? 'group' : 'c2c',
    openid,
    guildId: group ? asString(d['group_openid']) : '',
    // 交互回调没有可回填的 msg_id，回复走主动消息
    msgId: '',
    content: content.trim(),
    interactionId,
  };
}

/** 从平台事件中解析出统一上下文；不支持的场景返回 null */
function parseInbound(payload: WebhookPayload): InboundContext | null {
  const d = asRecord(payload.d);
  const author = asRecord(d['author']);
  const content = asString(d['content']).trim();
  const msgId = asString(d['id']);
  const attachments = parseAttachments(d['attachments']);

  switch (payload.t) {
    case 'GROUP_AT_MESSAGE_CREATE': {
      const openid = asString(author['member_openid']) || asString(author['id']);
      if (!openid) return null;
      return {
        target: 'group',
        openid,
        guildId: asString(d['group_openid']),
        msgId,
        content,
        ...(attachments ? { attachments } : {}),
      };
    }
    case 'C2C_MESSAGE_CREATE': {
      const openid = asString(author['user_openid']) || asString(d['user_openid']);
      if (!openid) return null;
      return {
        target: 'c2c',
        openid,
        guildId: '',
        msgId,
        content,
        ...(attachments ? { attachments } : {}),
      };
    }
    case 'INTERACTION_CREATE':
      return parseInteraction(d);
    default:
      // 群机器人只响应群 @、私聊消息与菜单/按钮回调，其余事件不在本期范围
      return null;
  }
}

robotRouter.post('/webhook', (req, res) => {
  // 验签依赖 Secret：未配置时无法确认请求来自 QQ 平台，一律拒绝而不是放行
  if (!QQ_BOT_SECRET) {
    res.status(503).json({ message: '机器人未配置 QQ_BOT_SECRET，回调接口不可用' });
    return;
  }

  const request = req as Request & { rawBody?: Buffer };
  const payload = (req.body ?? {}) as WebhookPayload;

  // 回调地址验证（op:13）：用 Secret 派生的 Ed25519 密钥签名 plain_token。
  // 平台首次验证地址时不带签名头，只有 plain_token，因此必须放在验签之前处理。
  if (payload.op === 13) {
    const d = asRecord(payload.d);
    res.json({
      plain_token: asString(d['plain_token']),
      signature: signPlainToken(asString(d['plain_token']), asString(d['event_ts'])),
    });
    return;
  }

  const signature = req.header('X-Signature-Ed25519');
  const timestamp = req.header('X-Signature-Timestamp');

  if (!verifyWebhookSignature(signature, timestamp, request.rawBody)) {
    res.status(401).json({ message: '签名校验失败' });
    return;
  }

  if (payload.op !== 0) {
    res.status(200).json({ ok: true });
    return;
  }

  const inbound = parseInbound(payload);
  // 先应答避免平台超时重推，业务处理在后台完成
  res.status(200).json({ ok: true });
  if (!inbound) return;

  void handleInboundMessage(inbound).catch((err: unknown) => {
    console.error('[robot] 处理入站消息失败:', err);
  });
});