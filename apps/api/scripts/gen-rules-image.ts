/**
 * 生成 QQ 机器人「规则」总览图（rules-v2.png）。
 *
 * - 数据源：src/db/catalog.ts（审核部门与模式的单一真源），以后改部门 / 模式后重新
 *   执行本脚本，图片与接口数据即同批更新；
 * - 视觉：宽 750px 手机竖屏友好，浅色底 + 深色字（SR 黑白 + 金色单色强调）；
 * - 产物：src/public/rules/rules-v2.png（构建时复制到 dist/public/rules，经 /api/public/rules 提供）；
 * - 生成后请把打印出的实际高度同步到 src/services/robot.ts 的 RULES_IMAGE_HEIGHT。
 *
 * 用法：pnpm --filter @sr/api run rules:image
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CATALOG_DEPARTMENTS, CATALOG_MODES } from '../src/db/catalog.js';

const WIDTH = 750;
const PAD = 58;
const CONTENT_W = WIDTH - PAD * 2;
const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/public/rules/rules-v2.png',
);

/** 配色：浅色纸底 + 炭黑文字 + 金色单色强调（与落地页黑金体系同源的反相版本） */
const COLOR = {
  bg: '#f6f3ec',
  card: '#fbf9f3',
  ink: '#141310',
  mid: '#56524a',
  low: '#8b8578',
  gold: '#a87b22',
  goldInk: '#8a6414',
  goldPill: 'rgba(168, 123, 34, 0.10)',
  goldPillLine: 'rgba(168, 123, 34, 0.36)',
  hairline: 'rgba(20, 19, 16, 0.14)',
  hairlineSoft: 'rgba(20, 19, 16, 0.07)',
};
const FONT =
  "'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', 'Source Han Sans SC', sans-serif";

/** 文本宽度估算（芯片宽度用）：CJK 按字号 1:1，西文按 0.56 倍 */
function textWidth(text: string, size: number): number {
  let width = 0;
  for (const ch of text) {
    width += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? size : size * 0.56;
  }
  return width;
}

function esc(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

interface TextSpec {
  x: number;
  y: number;
  text: string;
  size: number;
  fill: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
  letterSpacing?: number;
}

const parts: string[] = [];
let cursorY = 0;

function text(spec: TextSpec): void {
  parts.push(
    `<text x="${spec.x}" y="${spec.y}" font-family="${FONT}" font-size="${spec.size}"` +
      ` fill="${spec.fill}"${spec.weight ? ` font-weight="${spec.weight}"` : ''}` +
      `${spec.anchor ? ` text-anchor="${spec.anchor}"` : ''}` +
      `${spec.letterSpacing ? ` letter-spacing="${spec.letterSpacing}"` : ''}>${esc(spec.text)}</text>`,
  );
}

function line(y: number, stroke = COLOR.hairline): void {
  parts.push(
    `<line x1="${PAD}" y1="${y}" x2="${PAD + CONTENT_W}" y2="${y}" stroke="${stroke}" stroke-width="1"/>`,
  );
}

function pill(right: number, centerY: number, label: string): void {
  const width = textWidth(label, 13) + 26;
  const height = 27;
  const x = right - width;
  parts.push(
    `<rect x="${x}" y="${centerY - height / 2}" width="${width}" height="${height}" rx="${height / 2}"` +
      ` fill="${COLOR.goldPill}" stroke="${COLOR.goldPillLine}" stroke-width="1"/>`,
  );
  text({
    x: x + width / 2,
    y: centerY + 4.6,
    text: label,
    size: 13,
    fill: COLOR.goldInk,
    weight: 600,
    anchor: 'middle',
  });
}

/** 章节标题：金色序号 + 炭黑标题，右侧可挂一行浅灰说明 */
function sectionHeader(y: number, no: string, title: string, rightText?: string): void {
  text({ x: PAD, y, text: no, size: 13.5, fill: COLOR.gold, weight: 700 });
  text({ x: PAD + 26, y, text: title, size: 17, fill: COLOR.ink, weight: 700 });
  if (rightText) {
    text({ x: PAD + CONTENT_W, y, text: rightText, size: 12.5, fill: COLOR.low, anchor: 'end' });
  }
}

function card(top: number, height: number): void {
  parts.push(
    `<rect x="${PAD}" y="${top}" width="${CONTENT_W}" height="${height}" rx="12"` +
      ` fill="${COLOR.card}" stroke="${COLOR.hairlineSoft}" stroke-width="1"/>`,
  );
}

// ---------------------------------------------------------------------------
// 头部
// ---------------------------------------------------------------------------

parts.push(`<rect x="0" y="0" width="${WIDTH}" height="5" fill="${COLOR.gold}"/>`);
text({ x: PAD, y: 80, text: 'SR GUILD · REVIEW STANDARD', size: 11.5, fill: COLOR.gold, weight: 600, letterSpacing: 3.2 });
text({ x: PAD, y: 128, text: 'SR 公会审核部门与模式标准', size: 31, fill: COLOR.ink, weight: 700 });
text({ x: PAD, y: 160, text: `共 4 个审核部门 · ${CATALOG_MODES.length} 项总部审核模式`, size: 13, fill: COLOR.mid });
parts.push(`<rect x="${PAD}" y="178" width="52" height="3" fill="${COLOR.gold}"/>`);

// ---------------------------------------------------------------------------
// 上区：审核部门难度
// ---------------------------------------------------------------------------

cursorY = 232;
sectionHeader(cursorY, '01', '审核部门难度');

const rowH = 56;
const cardPad = 24;
const cardTop = cursorY + 16;
card(cardTop, rowH * CATALOG_DEPARTMENTS.length + 16);
for (const [index, dept] of CATALOG_DEPARTMENTS.entries()) {
  const centerY = cardTop + 8 + index * rowH + rowH / 2;
  text({
    x: PAD + cardPad,
    y: centerY + 4.5,
    text: String(index + 1).padStart(2, '0'),
    size: 13,
    fill: COLOR.gold,
    weight: 600,
  });
  text({
    x: PAD + cardPad + 34,
    y: centerY + 5.5,
    text: dept.name,
    size: 17.5,
    fill: COLOR.ink,
    weight: 600,
  });
  if (dept.tier) pill(PAD + CONTENT_W - cardPad, centerY, dept.tier);
  if (index < CATALOG_DEPARTMENTS.length - 1) {
    const dividerY = cardTop + 8 + (index + 1) * rowH;
    parts.push(
      `<line x1="${PAD + cardPad}" y1="${dividerY}" x2="${PAD + CONTENT_W - cardPad}" y2="${dividerY}"` +
        ` stroke="${COLOR.hairlineSoft}" stroke-width="1"/>`,
    );
  }
}

cursorY = cardTop + rowH * CATALOG_DEPARTMENTS.length + 16 + 34;
text({
  x: PAD,
  y: cursorY,
  text: '附注：Party / Team / Group 的审核模式暂未开放，详情请咨询审核总管。',
  size: 12.5,
  fill: COLOR.low,
});

// ---------------------------------------------------------------------------
// 下区：总部审核模式清单（两列）
// ---------------------------------------------------------------------------

cursorY += 60;
sectionHeader(cursorY, '02', '总部审核模式清单', '难度要求统一 B+ Tier 及政审');

const colGap = 24;
const cellW = (CONTENT_W - colGap) / 2;
const gridRowH = 64;
const gridTop = cursorY + 21;
const gridRows = Math.ceil(CATALOG_MODES.length / 2);
for (const [index, mode] of CATALOG_MODES.entries()) {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const x = PAD + col * (cellW + colGap);
  const yTop = gridTop + row * gridRowH;
  text({ x, y: yTop + 24, text: String(index + 1).padStart(2, '0'), size: 12.5, fill: COLOR.gold, weight: 600 });
  text({ x: x + 34, y: yTop + 24, text: mode.name, size: 16, fill: COLOR.ink, weight: 600 });
  text({ x: x + 34, y: yTop + 46, text: mode.min_requirement, size: 11.5, fill: COLOR.mid });
  if (col === 1) line(yTop + gridRowH - 2, COLOR.hairlineSoft);
}

cursorY = gridTop + gridRows * gridRowH + 26;
text({
  x: PAD,
  y: cursorY,
  text: '附注：Java高版本Crystals 审核最低要求 ht4。',
  size: 12.5,
  fill: COLOR.low,
});

// ---------------------------------------------------------------------------
// 落款
// ---------------------------------------------------------------------------

cursorY += 56;
line(cursorY, COLOR.hairline);
cursorY += 40;
text({
  x: PAD,
  y: cursorY,
  text: '如有疑问请联系审核总管望北 / 副总管雨夜',
  size: 14,
  fill: COLOR.ink,
  weight: 600,
});
cursorY += 26;
text({
  x: PAD,
  y: cursorY,
  text: 'SR 公会审核工单系统 · 规则以系统实时数据为准',
  size: 11.5,
  fill: COLOR.low,
});

const height = cursorY + 48;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">` +
  `<rect width="${WIDTH}" height="${height}" fill="${COLOR.bg}"/>` +
  parts.join('') +
  '</svg>';

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUTPUT);
console.log(`[rules-image] 已生成 ${path.relative(process.cwd(), OUTPUT)}（${WIDTH}×${height}）`);
console.log(`[rules-image] 同步更新 apps/api/src/services/robot.ts：RULES_IMAGE_HEIGHT = ${height}`);