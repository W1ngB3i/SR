/**
 * SR 公会审核部门与模式目录（2026-10 口径，seed 与迁移共用单一真源）。
 * 部门即原「审核意向」的合并形态：申请人在表单中只选部门 + 模式。
 * 本版按 SR 实际架构收敛为 4 部门；审核模式全部挂靠总部，Party / Team / Group 留空。
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
  {
    id: 'dept-hq',
    name: '总部',
    tier: 'B+ Tier',
    contact: '',
    description: '承接 EC / 布吉岛 / Java 低版本 / Java 高版本 / BE 国际服 / Misaki / 联大逐梦起源 / 其他模块的全部审核模式',
    sort: 1,
  },
  {
    id: 'dept-party',
    name: 'Party',
    tier: 'C+ Tier',
    contact: '',
    description: '国际服部门；审核模式暂未开放，请联系总管',
    sort: 2,
  },
  {
    id: 'dept-team',
    name: 'Team',
    tier: '政审 / B- Tier',
    contact: '1104546892',
    description: '布吉岛 & Java 部门（含精刀小组 B-）；审核模式暂未开放，请联系总管',
    sort: 3,
  },
  {
    id: 'dept-group',
    name: 'Group',
    tier: 'C+ Tier',
    contact: '',
    description: '联机大厅部门；审核模式暂未开放，请联系总管',
    sort: 4,
  },
];

/** 总部审核模式的统一难度要求 */
const HQ_REQUIREMENT = 'B+ Tier 及政审';

/** 总部审核模式（28 条，全部挂靠 dept-hq，sort 与规则图序号一一对应） */
export const CATALOG_MODES: CatalogMode[] = [
  { id: 'mode-hq-01', department_id: 'dept-hq', name: 'EC单刀', min_requirement: HQ_REQUIREMENT, sort: 1 },
  { id: 'mode-hq-02', department_id: 'dept-hq', name: 'EC决战黎明', min_requirement: HQ_REQUIREMENT, sort: 2 },
  { id: 'mode-hq-03', department_id: 'dept-hq', name: 'EC超级战墙决斗', min_requirement: HQ_REQUIREMENT, sort: 3 },
  { id: 'mode-hq-04', department_id: 'dept-hq', name: 'EC无限连击', min_requirement: HQ_REQUIREMENT, sort: 4 },
  { id: 'mode-hq-05', department_id: 'dept-hq', name: 'BE国际服BUHC', min_requirement: HQ_REQUIREMENT, sort: 5 },
  { id: 'mode-hq-06', department_id: 'dept-hq', name: 'BE国际服POT', min_requirement: HQ_REQUIREMENT, sort: 6 },
  { id: 'mode-hq-07', department_id: 'dept-hq', name: 'BE国际服Fist', min_requirement: HQ_REQUIREMENT, sort: 7 },
  { id: 'mode-hq-08', department_id: 'dept-hq', name: 'BE国际服Sumo', min_requirement: HQ_REQUIREMENT, sort: 8 },
  { id: 'mode-hq-09', department_id: 'dept-hq', name: 'BE国际服Classic', min_requirement: HQ_REQUIREMENT, sort: 9 },
  { id: 'mode-hq-10', department_id: 'dept-hq', name: '布吉岛Sword', min_requirement: HQ_REQUIREMENT, sort: 10 },
  { id: 'mode-hq-11', department_id: 'dept-hq', name: '布吉岛Bedfight', min_requirement: HQ_REQUIREMENT, sort: 11 },
  { id: 'mode-hq-12', department_id: 'dept-hq', name: '布吉岛Single', min_requirement: HQ_REQUIREMENT, sort: 12 },
  { id: 'mode-hq-13', department_id: 'dept-hq', name: '布吉岛BUHC', min_requirement: HQ_REQUIREMENT, sort: 13 },
  { id: 'mode-hq-14', department_id: 'dept-hq', name: '布吉岛FUHC', min_requirement: HQ_REQUIREMENT, sort: 14 },
  { id: 'mode-hq-15', department_id: 'dept-hq', name: 'Java低版本Nodebuff', min_requirement: HQ_REQUIREMENT, sort: 15 },
  { id: 'mode-hq-16', department_id: 'dept-hq', name: 'Java低版本Sumo', min_requirement: HQ_REQUIREMENT, sort: 16 },
  { id: 'mode-hq-17', department_id: 'dept-hq', name: 'Java低版本Boxing', min_requirement: HQ_REQUIREMENT, sort: 17 },
  { id: 'mode-hq-18', department_id: 'dept-hq', name: 'Java低版本BUHC', min_requirement: HQ_REQUIREMENT, sort: 18 },
  { id: 'mode-hq-19', department_id: 'dept-hq', name: 'Java高版本Sword', min_requirement: HQ_REQUIREMENT, sort: 19 },
  { id: 'mode-hq-20', department_id: 'dept-hq', name: 'Java高版本Crystals', min_requirement: HQ_REQUIREMENT, sort: 20 },
  { id: 'mode-hq-21', department_id: 'dept-hq', name: 'Misaki Nodebuff', min_requirement: HQ_REQUIREMENT, sort: 21 },
  { id: 'mode-hq-22', department_id: 'dept-hq', name: 'Misaki Boxing', min_requirement: HQ_REQUIREMENT, sort: 22 },
  { id: 'mode-hq-23', department_id: 'dept-hq', name: 'Misaki Gapple', min_requirement: HQ_REQUIREMENT, sort: 23 },
  { id: 'mode-hq-24', department_id: 'dept-hq', name: 'Misaki Fist', min_requirement: HQ_REQUIREMENT, sort: 24 },
  { id: 'mode-hq-25', department_id: 'dept-hq', name: 'Misaki Classic', min_requirement: HQ_REQUIREMENT, sort: 25 },
  { id: 'mode-hq-26', department_id: 'dept-hq', name: '联机大厅', min_requirement: HQ_REQUIREMENT, sort: 26 },
  { id: 'mode-hq-27', department_id: 'dept-hq', name: '逐梦起源FFA', min_requirement: HQ_REQUIREMENT, sort: 27 },
  { id: 'mode-hq-28', department_id: 'dept-hq', name: '建筑/红石/指令', min_requirement: HQ_REQUIREMENT, sort: 28 },
];

/** 上一版目录的部门：同步时停用，历史工单 / 账号 / 机器人绑定统一迁往总部 */
export const DEPRECATED_DEPT_IDS = [
  'dept-ec-intl',
  'dept-bj-java',
  'dept-javalow',
  'dept-jingdao',
  'dept-lobby',
  'dept-beintl',
  'dept-javahigh',
  'dept-other',
  'dept-survival',
  'dept-explore',
];

/**
 * 旧模式 → 总部新模式迁移映射（同步时改写历史工单 mode_id）。
 * 未列出的旧模式（Java低版本 Classic / BedFight，新版目录已无对应条目）
 * 保留原记录：历史工单继续可读，不强行改写成语义不符的模式。
 */
export const DEPRECATED_MODE_MAP: Record<string, string> = {
  'mode-ec-dandao': 'mode-hq-01',
  'mode-ec-dawn': 'mode-hq-02',
  'mode-ec-wall': 'mode-hq-03',
  'mode-ec-combo': 'mode-hq-04',
  'mode-beintl-buhc': 'mode-hq-05',
  'mode-beintl-pot': 'mode-hq-06',
  'mode-beintl-fist': 'mode-hq-07',
  'mode-beintl-sumo': 'mode-hq-08',
  'mode-beintl-classic': 'mode-hq-09',
  'mode-bj-sword09': 'mode-hq-10',
  'mode-bj-bedfight': 'mode-hq-11',
  'mode-bj-sword': 'mode-hq-12',
  'mode-bj-buhc': 'mode-hq-13',
  'mode-bj-fuhc': 'mode-hq-14',
  'mode-javalow-nodebuff': 'mode-hq-15',
  'mode-javalow-sumo': 'mode-hq-16',
  'mode-javalow-boxing': 'mode-hq-17',
  'mode-javalow-buhc': 'mode-hq-18',
  'mode-javahi-sword': 'mode-hq-19',
  'mode-javahi-crystals': 'mode-hq-20',
  'mode-misaki-nodebuff': 'mode-hq-21',
  'mode-misaki-boxing': 'mode-hq-22',
  'mode-misaki-gapple': 'mode-hq-23',
  'mode-misaki-fist': 'mode-hq-24',
  'mode-misaki-classic': 'mode-hq-25',
  'mode-lianda-ffa': 'mode-hq-27',
  'mode-etc-build': 'mode-hq-28',
  'mode-etc-redstone': 'mode-hq-28',
  'mode-etc-command': 'mode-hq-28',
};