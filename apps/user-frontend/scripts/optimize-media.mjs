/**
 * 静态图优化：把 public/media 下的宣传片封面转成 WebP，并为 Hero 主视觉产出
 * 按断点的小图，避免手机端下载 1920 宽级大图。
 *
 * 封面走统一的两档阶梯（-480 / -960），与 LandingPage 里 srcset 的 w 描述符
 * 一一对应；Hero 保留原尺寸作为最大档，另有 -960 / -1440。
 * 源图（JPG）保留为兜底，产物与源图同目录（public/media），随 vite build 一起拷贝。
 * 换图后重新执行：pnpm --filter @sr/user-frontend media:optimize
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const MEDIA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/media');

/** 宣传片封面：统一两档，描述符固定 480w / 960w */
const COVERS = [
  'cover-anniv.jpg',
  'cover-dragon.jpg',
  'cover-be1.jpg',
  'cover-be2.jpg',
  'cover-2k26.jpg',
];

/** Hero 主视觉：原尺寸 1920 作为最大档，另出 -1440 / -960（-960 由封面阶梯产出） */
const HERO = { file: 'cover-2k26.jpg', widths: [1920, 1440] };

const COVER_LADDER = [480, 960];
const QUALITY = 76;

function report(outName, outPath) {
  const { size } = fs.statSync(outPath);
  console.log(`  ${outName.padEnd(28)} ${String(Math.round(size / 1024)).padStart(4)} KB`);
}

/**
 * 裁到 16:9 指定宽度：封面在页面上就是 16:9 + object-fit: cover，
 * 预裁掉渲染时本就会被裁掉的部分（部分源图是 16:10），顺便只发真正用得上的像素。
 * 源图窄于目标宽度时会放大（≤11%），换来两档描述符始终等于真实宽度。
 */
async function emitCover(sourceFile, width) {
  const outName = `${sourceFile.replace(/\.jpg$/, '')}-${width}.webp`;
  const outPath = path.join(MEDIA_DIR, outName);
  await sharp(path.join(MEDIA_DIR, sourceFile))
    .resize({ width, height: Math.round((width * 9) / 16), fit: 'cover' })
    .webp({ quality: QUALITY, effort: 5 })
    .toFile(outPath);
  report(outName, outPath);
}

/** Hero 主视觉：1920 与 -1440 均为降采样，不放大 */
async function emitHero(sourceFile, width) {
  const base = sourceFile.replace(/\.jpg$/, '');
  const outName = width === 1920 ? `${base}.webp` : `${base}-${width}.webp`;
  const outPath = path.join(MEDIA_DIR, outName);
  await sharp(path.join(MEDIA_DIR, sourceFile))
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 5 })
    .toFile(outPath);
  report(outName, outPath);
}

console.log('生成宣传片封面 WebP（480 / 960 两档）：');
for (const file of COVERS) {
  for (const width of COVER_LADDER) await emitCover(file, width);
}

console.log(`生成 Hero 主视觉（源 ${HERO.file}）：`);
for (const width of HERO.widths) await emitHero(HERO.file, width);