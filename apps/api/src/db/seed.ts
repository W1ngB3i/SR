import { DEFAULT_FEEDBACK_CONTACTS, DEVICE_NOTES } from '@sr/shared';
import { getDb } from './index.js';
import { CATALOG_DEPARTMENTS, CATALOG_MODES } from './catalog.js';
import { newId, nowIso } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

const USERS = [
  { id: 'usr-wangbei', username: 'wangbei', name: '望北', role: 'chief' },
  { id: 'usr-yuye', username: 'yuye', name: '雨夜', role: 'deputy' },
  { id: 'usr-xingchen', username: 'xingchen', name: '星辰', role: 'reviewer' },
  { id: 'usr-liuyun', username: 'liuyun', name: '流云', role: 'reviewer' },
  { id: 'usr-beian', username: 'beian', name: '北岸', role: 'reviewer' },
  { id: 'usr-admin', username: 'admin', name: '系统管理员', role: 'admin' },
] as const;

interface DemoTicket {
  id: string;
  circle_name: string;
  department_id: string;
  module: 'PE' | 'PC' | 'BOTH';
  mode_id: string;
  self_proof: 0 | 1;
  contact: string;
  status: 'pending_claim' | 'reviewing' | 'supplementing' | 'resulted' | 'published';
  assignee_id: string | null;
  is_priority: 0 | 1;
  supplement_reason?: string;
  createdAtHoursAgo: number;
  claimedHoursAgo?: number;
  resultedHoursAgo?: number;
  publishedHoursAgo?: number;
  receipt?: {
    pe_grade?: string;
    pc_grade?: string;
    pass: 0 | 1;
    target_department?: string;
    comment: string;
    is_draft?: 0 | 1;
  };
}

const DEMO_TICKETS: DemoTicket[] = [
  {
    id: 'tkt-shanyu', circle_name: '山栀', department_id: 'dept-ec-intl',
    module: 'PE', mode_id: 'mode-ec-dandao', self_proof: 1, contact: 'AB2CDE',
    status: 'published', assignee_id: 'usr-liuyun', is_priority: 0,
    createdAtHoursAgo: 96, claimedHoursAgo: 90, resultedHoursAgo: 80, publishedHoursAgo: 72,
    receipt: { pe_grade: 'S', pass: 1, target_department: 'EC', comment: '操作流畅，反应迅速，单刀连段稳定。' },
  },
  {
    id: 'tkt-ache', circle_name: '阿澈', department_id: 'dept-javalow',
    module: 'BOTH', mode_id: 'mode-javalow-nodebuff', self_proof: 1, contact: 'CD3FGH',
    status: 'published', assignee_id: 'usr-xingchen', is_priority: 0,
    createdAtHoursAgo: 120, claimedHoursAgo: 116, resultedHoursAgo: 100, publishedHoursAgo: 90,
    receipt: { pe_grade: 'A', pc_grade: 'B', pass: 1, target_department: 'Java低版本', comment: '双端发挥均衡，Java 低版本 NoDebuff 意识到位。' },
  },
  {
    id: 'tkt-nanyu', circle_name: '南屿', department_id: 'dept-javahigh',
    module: 'PC', mode_id: 'mode-javahi-crystals', self_proof: 0, contact: 'EF4JKM',
    status: 'published', assignee_id: 'usr-beian', is_priority: 0,
    createdAtHoursAgo: 144, claimedHoursAgo: 140, resultedHoursAgo: 130, publishedHoursAgo: 120,
    receipt: { pc_grade: 'C', pass: 0, comment: '晶体操作未达 ht4 最低要求，评价不通过，可择日重考。' },
  },
  {
    id: 'tkt-wudao', circle_name: '雾岛晚风', department_id: 'dept-lobby',
    module: 'PC', mode_id: 'mode-lianda-ffa', self_proof: 0, contact: 'GH5NPQ',
    status: 'resulted', assignee_id: 'usr-liuyun', is_priority: 0,
    createdAtHoursAgo: 30, claimedHoursAgo: 26, resultedHoursAgo: 2,
    receipt: { pc_grade: 'B', pass: 1, target_department: '联大逐梦起源', comment: '混战意识良好，走位积极，符合大厅难度口径。', is_draft: 0 },
  },
  {
    id: 'tkt-yuejian', circle_name: '月见白', department_id: 'dept-javahigh',
    module: 'PC', mode_id: 'mode-javahi-sword', self_proof: 1, contact: 'JK6RSV',
    status: 'reviewing', assignee_id: 'usr-xingchen', is_priority: 0,
    createdAtHoursAgo: 20, claimedHoursAgo: 8,
  },
  {
    id: 'tkt-baiya', circle_name: '白鸦', department_id: 'dept-beintl',
    module: 'BOTH', mode_id: 'mode-beintl-pot', self_proof: 1, contact: 'KM7TVY',
    status: 'reviewing', assignee_id: 'usr-liuyun', is_priority: 0,
    createdAtHoursAgo: 48, claimedHoursAgo: 40,
  },
  {
    id: 'tkt-changfeng', circle_name: '长风', department_id: 'dept-jingdao',
    module: 'PE', mode_id: 'mode-misaki-boxing', self_proof: 0, contact: 'NP8WXA',
    status: 'supplementing', assignee_id: 'usr-xingchen', is_priority: 0,
    supplement_reason: '自证材料无法播放，请补充清晰的操作视频（建议 30 秒以上）。',
    createdAtHoursAgo: 60, claimedHoursAgo: 55,
  },
  {
    id: 'tkt-xingye', circle_name: '星野凛', department_id: 'dept-ec-intl',
    module: 'PE', mode_id: 'mode-ec-combo', self_proof: 1, contact: 'PQ9YB2',
    status: 'pending_claim', assignee_id: null, is_priority: 0, createdAtHoursAgo: 3,
  },
  {
    id: 'tkt-luochen', circle_name: '落尘', department_id: 'dept-lobby',
    module: 'PC', mode_id: 'mode-lianda-ffa', self_proof: 0, contact: 'RS3CDE',
    status: 'pending_claim', assignee_id: null, is_priority: 1, createdAtHoursAgo: 8,
  },
  {
    id: 'tkt-banxia', circle_name: '半夏', department_id: 'dept-ec-intl',
    module: 'PC', mode_id: 'mode-ec-wall', self_proof: 0, contact: 'TV4FGH',
    status: 'pending_claim', assignee_id: null, is_priority: 0, createdAtHoursAgo: 13,
  },
];

function insertEvent(db: ReturnType<typeof getDb>, ticketId: string, type: string, actorName: string, detail: string, at: string): void {
  db.prepare(
    `INSERT INTO ticket_event (id, ticket_id, type, actor_id, actor_name, detail, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`,
  ).run(newId('evt'), ticketId, type, actorName, detail, at);
}

/** 灌入种子数据：force 时先清空业务表 */
export function seedDatabase(force: boolean): void {
  const db = getDb();
  const userCount = (db.prepare('SELECT COUNT(*) AS c FROM "user"').get() as { c: number }).c;
  if (userCount > 0 && !force) {
    console.log('[seed] 数据库已有数据，跳过种子（使用 --force 覆盖）');
    return;
  }

  const seed = db.transaction(() => {
    if (force) {
      db.prepare('DELETE FROM attachment').run();
      db.prepare('DELETE FROM receipt').run();
      db.prepare('DELETE FROM ticket_event').run();
      db.prepare('DELETE FROM ticket').run();
      db.prepare('DELETE FROM mode').run();
      db.prepare('DELETE FROM department').run();
      db.prepare('DELETE FROM announcement').run();
      db.prepare('DELETE FROM audit_log').run();
      db.prepare('DELETE FROM config').run();
      db.prepare('DELETE FROM "user"').run();
    }

    const pwHash = hashPassword('sr123456');
    const userInsert = db.prepare(
      `INSERT INTO "user" (id, username, name, role, password_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    );
    for (const u of USERS) {
      userInsert.run(u.id, u.username, u.name, u.role, pwHash, hoursAgo(24 * 30));
    }

    const deptInsert = db.prepare(
      `INSERT INTO department (id, name, tier, contact, description, sort, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    );
    for (const d of CATALOG_DEPARTMENTS) {
      deptInsert.run(d.id, d.name, d.tier, d.contact, d.description, d.sort);
    }

    const modeInsert = db.prepare(
      `INSERT INTO mode (id, department_id, group_name, name, min_requirement, sort)
       VALUES (?, ?, '', ?, ?, ?)`,
    );
    for (const m of CATALOG_MODES) {
      modeInsert.run(m.id, m.department_id, m.name, m.min_requirement, m.sort);
    }

    const configInsert = db.prepare(
      `INSERT INTO config (key, value, version, updated_by, updated_at) VALUES (?, ?, 1, '系统初始化', ?)`,
    );
    configInsert.run(
      'feedback_contacts',
      JSON.stringify({
        chief: { ...DEFAULT_FEEDBACK_CONTACTS.chief },
        deputy: { ...DEFAULT_FEEDBACK_CONTACTS.deputy },
      }),
      nowIso(),
    );
    configInsert.run('submission_cooldown_hours', '24', nowIso());
    configInsert.run('reviewer_max_concurrent', '5', nowIso());
    configInsert.run(
      'upload_limits',
      JSON.stringify({
        max_file_mb: 200,
        max_files: 6,
        image_ext: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
        video_ext: ['.mp4', '.mov', '.webm', '.mkv'],
      }),
      nowIso(),
    );

    const annInsert = db.prepare(
      `INSERT INTO announcement (id, title, content, pinned, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    );
    annInsert.run(
      newId('ann'),
      'SR 公会审核工单系统上线公告',
      `SR 公会审核工单系统正式启用：请通过「提交申请」页面填写回执单字段并上传自证材料；提交后将获得查询码，凭圈名与查询码在「进度查询」页面随时查看审核进度；审核结果统一在「结果公示」页面公开。如有疑问请联系审核总管望北（QQ ${DEFAULT_FEEDBACK_CONTACTS.chief.qq}）或审核副总管雨夜（QQ ${DEFAULT_FEEDBACK_CONTACTS.deputy.qq}）。`,
      1,
      '望北',
      hoursAgo(24 * 7),
    );
    annInsert.run(
      newId('ann'),
      '关于审核难度标准（2023.12 起生效）',
      `设备界定：${DEVICE_NOTES[0]}${DEVICE_NOTES[1]}部门难度：总部 B+ Tier（单公会）；SR_Team 布吉岛&JAVA 部门政审（联系 1104546892）；SR_Team 精刀小组 B- Tier；SR_Party EC&国际部门 C+ Tier；SR_Group 联机大厅部门 C+ Tier；SR_Arrow 生存部门 B-；SR_Explore 开拓部门政审（联系 323992228）。JAVA 高版本 Crystals 审核最低要求 ht4。`,
      1,
      '望北',
      hoursAgo(24 * 14),
    );
    annInsert.run(
      newId('ann'),
      '成绩体系说明',
      'SR 公会成绩评价分 PE、PC 两套，均为 E~S+ 的字母级别。提交工单时请如实选择设备类别，双端申请需两套成绩齐全。具体评分标准以群管家口径为准。',
      0,
      '雨夜',
      hoursAgo(24 * 5),
    );

    const ticketInsert = db.prepare(
      `INSERT INTO ticket (id, query_code, circle_name, department_id, module, mode_id, self_proof, contact, status, assignee_id, is_priority, supplement_reason, created_at, updated_at, claimed_at, resulted_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const receiptInsert = db.prepare(
      `INSERT INTO receipt (ticket_id, is_draft, pe_grade, pc_grade, pass, target_department, auditor_id, comment, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const auditInsert = db.prepare(
      `INSERT INTO audit_log (id, operator_id, operator_name, action, resource, target_id, before, after, request_id, created_at)
       VALUES (?, NULL, '系统', 'seed.demo', 'ticket', ?, '', '{}', '', ?)`,
    );

    let queryCodeSeq = 0;
    const codeOf = () => {
      queryCodeSeq += 1;
      const base = (1_000_000 + queryCodeSeq * 7919).toString(36).toUpperCase().padStart(6, 'A');
      return `${base.slice(0, 4)}${(queryCodeSeq % 90 + 10).toString(36).toUpperCase()}${base.slice(4, 5)}`;
    };

    const userName = (id: string | null) => USERS.find((u) => u.id === id)?.name ?? '系统';

    for (const t of DEMO_TICKETS) {
      const created = hoursAgo(t.createdAtHoursAgo);
      const claimed = t.claimedHoursAgo !== undefined ? hoursAgo(t.claimedHoursAgo) : null;
      const resulted = t.resultedHoursAgo !== undefined ? hoursAgo(t.resultedHoursAgo) : null;
      const published = t.publishedHoursAgo !== undefined ? hoursAgo(t.publishedHoursAgo) : null;
      const updated = published ?? resulted ?? (t.status === 'supplementing' ? hoursAgo(10) : claimed) ?? created;
      ticketInsert.run(
        t.id, codeOf(), t.circle_name, t.department_id, t.module, t.mode_id,
        t.self_proof, t.contact, t.status, t.assignee_id, t.is_priority,
        t.supplement_reason ?? '', created, updated, claimed, resulted, published,
      );

      insertEvent(db, t.id, 'submitted', t.circle_name, t.self_proof === 1 ? '附带自证材料' : '未上传自证材料', created);
      if (claimed) {
        insertEvent(db, t.id, 'claimed', userName(t.assignee_id), `由 ${userName(t.assignee_id)} 接单`, claimed);
      }
      if (t.status === 'supplementing' && t.supplement_reason) {
        insertEvent(db, t.id, 'supplement_requested', userName(t.assignee_id), t.supplement_reason, hoursAgo(12));
      }
      if (resulted && t.receipt) {
        insertEvent(db, t.id, 'receipt_submitted', userName(t.assignee_id), t.receipt.pass === 1 ? `评价：通过${t.receipt.target_department ? `，可进入 ${t.receipt.target_department}` : ''}` : '评价：不通过', resulted);
      }
      if (published) {
        insertEvent(db, t.id, 'review_confirmed', '望北', '复核通过', published);
        insertEvent(db, t.id, 'published', '望北', '结果公示', published);
      }
      if (t.receipt) {
        receiptInsert.run(
          t.id, t.receipt.is_draft ?? 0, t.receipt.pe_grade ?? null, t.receipt.pc_grade ?? null,
          t.receipt.pass, t.receipt.target_department ?? '', t.assignee_id, t.receipt.comment,
          resulted,
        );
      }
      auditInsert.run(newId('log'), t.id, created);
    }
  });

  seed();
  console.log(`[seed] 完成：${USERS.length} 个账号、${CATALOG_DEPARTMENTS.length} 个部门、${CATALOG_MODES.length} 个模式、${DEMO_TICKETS.length} 条演示工单`);
  console.log('[seed] 演示账号口令统一为 sr123456（wangbei / yuye / xingchen / liuyun / beian / admin）');
}
