/**
 * SR 公会审核部门与模式目录（2026-09 口径，seed 与迁移共用单一真源）。
 * 部门即原「审核意向」的合并形态：申请人在表单中只选部门 + 模式。
 */
export interface CatalogDept {
  id: string;
  name: string;
  tier: string;
  contact: string;
  description: string;
  sort: number;
}

export interface CatalogMode {
  id: string;
  department_id: string;
  name: string;
  min_requirement: string;
  sort: number;
}

export const CATALOG_DEPARTMENTS: CatalogDept[] = [
  { id: 'dept-ec-intl', name: 'EC', tier: 'C+ Tier', contact: '', description: '', sort: 1 },
  { id: 'dept-bj-java', name: '布吉岛', tier: '政审', contact: '1104546892', description: '政审模式，请联系指定负责人', sort: 2 },
  { id: 'dept-javalow', name: 'Java低版本', tier: '', contact: '', description: '', sort: 3 },
  { id: 'dept-jingdao', name: 'Misaki', tier: 'B- Tier', contact: '', description: '', sort: 4 },
  { id: 'dept-lobby', name: '联大逐梦起源', tier: 'C+ Tier', contact: '', description: '', sort: 5 },
  { id: 'dept-beintl', name: 'BE国际服', tier: '', contact: '', description: '', sort: 6 },
  { id: 'dept-javahigh', name: 'JAVA高版本（1.9+）', tier: '', contact: '', description: '', sort: 7 },
  { id: 'dept-other', name: '其他模块（找群主）', tier: '', contact: '', description: '', sort: 8 },
];

export const CATALOG_MODES: CatalogMode[] = [
  // EC：单刀 / 无限连击 / 决战黎明 / 超级战墙决斗
  { id: 'mode-ec-dandao', department_id: 'dept-ec-intl', name: '单刀', min_requirement: '', sort: 1 },
  { id: 'mode-ec-combo', department_id: 'dept-ec-intl', name: '无限连击', min_requirement: '', sort: 2 },
  { id: 'mode-ec-dawn', department_id: 'dept-ec-intl', name: '决战黎明', min_requirement: '', sort: 3 },
  { id: 'mode-ec-wall', department_id: 'dept-ec-intl', name: '超级战墙决斗', min_requirement: '', sort: 4 },
  // 布吉岛：Bedfight / Single / Sword / BUHC / FUHC
  { id: 'mode-bj-bedfight', department_id: 'dept-bj-java', name: 'Bedfight', min_requirement: '', sort: 1 },
  { id: 'mode-bj-sword', department_id: 'dept-bj-java', name: 'Single', min_requirement: '', sort: 2 },
  { id: 'mode-bj-sword09', department_id: 'dept-bj-java', name: 'Sword', min_requirement: '', sort: 3 },
  { id: 'mode-bj-buhc', department_id: 'dept-bj-java', name: 'BUHC', min_requirement: '', sort: 4 },
  { id: 'mode-bj-fuhc', department_id: 'dept-bj-java', name: 'FUHC', min_requirement: '', sort: 5 },
  // Java低版本：NoDebuff / Sumo / Buhc / Boxing / Classic / BedFight
  { id: 'mode-javalow-nodebuff', department_id: 'dept-javalow', name: 'NoDebuff', min_requirement: '', sort: 1 },
  { id: 'mode-javalow-sumo', department_id: 'dept-javalow', name: 'Sumo', min_requirement: '', sort: 2 },
  { id: 'mode-javalow-buhc', department_id: 'dept-javalow', name: 'Buhc', min_requirement: '', sort: 3 },
  { id: 'mode-javalow-boxing', department_id: 'dept-javalow', name: 'Boxing', min_requirement: '', sort: 4 },
  { id: 'mode-javalow-classic', department_id: 'dept-javalow', name: 'Classic', min_requirement: '', sort: 5 },
  { id: 'mode-javalow-bedfight', department_id: 'dept-javalow', name: 'BedFight', min_requirement: '', sort: 6 },
  // Misaki：NoDebuff / Boxing / Fist / Classic / Gapple
  { id: 'mode-misaki-nodebuff', department_id: 'dept-jingdao', name: 'NoDebuff', min_requirement: '', sort: 1 },
  { id: 'mode-misaki-boxing', department_id: 'dept-jingdao', name: 'Boxing', min_requirement: '', sort: 2 },
  { id: 'mode-misaki-fist', department_id: 'dept-jingdao', name: 'Fist', min_requirement: '', sort: 3 },
  { id: 'mode-misaki-classic', department_id: 'dept-jingdao', name: 'Classic', min_requirement: '', sort: 4 },
  { id: 'mode-misaki-gapple', department_id: 'dept-jingdao', name: 'Gapple', min_requirement: '', sort: 5 },
  // 联大逐梦起源：FFA
  { id: 'mode-lianda-ffa', department_id: 'dept-lobby', name: 'FFA', min_requirement: '', sort: 1 },
  // BE国际服：Pot / BUHC / Fist / Sumo / Classic
  { id: 'mode-beintl-pot', department_id: 'dept-beintl', name: 'Pot', min_requirement: '', sort: 1 },
  { id: 'mode-beintl-buhc', department_id: 'dept-beintl', name: 'BUHC', min_requirement: '', sort: 2 },
  { id: 'mode-beintl-fist', department_id: 'dept-beintl', name: 'Fist', min_requirement: '', sort: 3 },
  { id: 'mode-beintl-sumo', department_id: 'dept-beintl', name: 'Sumo', min_requirement: '', sort: 4 },
  { id: 'mode-beintl-classic', department_id: 'dept-beintl', name: 'Classic', min_requirement: '', sort: 5 },
  // JAVA高版本（1.9+）：Sword / Crystals（审核最低要求 ht4）
  { id: 'mode-javahi-sword', department_id: 'dept-javahigh', name: 'Sword', min_requirement: '', sort: 1 },
  { id: 'mode-javahi-crystals', department_id: 'dept-javahigh', name: 'Crystals', min_requirement: '审核最低要求 ht4', sort: 2 },
  // 其他模块（找群主）：建筑 / 红石 / 指令
  { id: 'mode-etc-build', department_id: 'dept-other', name: '建筑', min_requirement: '联系群主', sort: 1 },
  { id: 'mode-etc-redstone', department_id: 'dept-other', name: '红石', min_requirement: '联系群主', sort: 2 },
  { id: 'mode-etc-command', department_id: 'dept-other', name: '指令', min_requirement: '联系群主', sort: 3 },
];

/** 新目录停用的旧部门（历史工单仍可正常展示，仅不可再选） */
export const DEPRECATED_DEPT_IDS = ['dept-hq', 'dept-survival', 'dept-explore'];
