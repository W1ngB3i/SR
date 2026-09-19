/**
 * E2E 独立实例编排脚本（由 playwright webServer 拉起）。
 *
 * 职责：
 *  1. 准备一次性数据目录（全新 SQLite + 种子数据，不触碰 apps/api/data 真实数据）
 *  2. 启动 API（独立端口）→ 用户端前端 → 管理后台前端（独立端口，/api 代理指向独立 API）
 *  3. 等待三个服务就绪后通知 Playwright；进程退出时级联清理所有子进程
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // e2e/
const repoRoot = path.resolve(e2eRoot, '..'); // 仓库根

const API_PORT = Number(process.env.SR_E2E_API_PORT ?? 8788);
const USER_PORT = Number(process.env.SR_E2E_USER_PORT ?? 5273);
const ADMIN_PORT = Number(process.env.SR_E2E_ADMIN_PORT ?? 5274);

const DATA_DIR = path.join(e2eRoot, '.tmp-data');
const STORAGE_DIR = path.join(e2eRoot, '.tmp-storage');

/** 允许覆盖 Node 可执行文件（如本地使用便携版 Node 22：SR_NODE_BIN=D:/sr/.node-test/node-v22.23.2-win-x64/node.exe） */
const nodeBin = process.env.SR_NODE_BIN || process.execPath;

const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');

const log = (tag, msg) => console.log(`[serve:${tag}] ${msg}`);

// ---------------------------------------------------------------------------
// 一次性数据目录：每次运行都从全新种子开始，保证用例可重复
// ---------------------------------------------------------------------------
for (const dir of [DATA_DIR, STORAGE_DIR]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

const baseEnv = {
  ...process.env,
  SR_DATA_DIR: DATA_DIR,
  SR_STORAGE_DIR: STORAGE_DIR,
  PORT: String(API_PORT),
  // 固定测试密钥：仅用于 E2E 一次性实例
  JWT_SECRET: 'e2e-fixed-secret-do-not-use-in-production',
};

const children = [];

function spawnChild(tag, command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...baseEnv, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(String(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));
  child.on('exit', (code, signal) => {
    if (!shuttingDown) log(tag, `进程退出 code=${code} signal=${signal}`);
  });
  children.push({ tag, child });
  return child;
}

function waitForExit(child, tag) {
  return new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[serve:${tag}] 初始化进程失败，退出码 ${code}`));
    });
    child.once('error', reject);
  });
}

function pollHttp(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, { timeout: 3_000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`[serve] 等待 ${url} 就绪超时（${timeoutMs}ms）`));
      } else {
        setTimeout(attempt, 500);
      }
    };
    attempt();
  });
}

function killChildren() {
  for (const { tag, child } of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (process.platform === 'win32') {
      // Windows 下按进程树终止（vite 会派生 esbuild 子进程）
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
    log(tag, '已终止');
  }
}

let shuttingDown = false;
function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChildren();
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', killChildren);

// ---------------------------------------------------------------------------
// 启动顺序：种子灌入（一次性进程）→ API → 两个前端 → 等待就绪
// ---------------------------------------------------------------------------
const apiDir = path.join(repoRoot, 'apps', 'api');

log('seed', '灌入全新种子数据…');
await waitForExit(
  spawnChild('seed', nodeBin, [tsxCli, 'src/db/cli.ts', 'seed', '--force'], apiDir),
  'seed',
);

spawnChild('api', nodeBin, [tsxCli, 'src/server.ts'], apiDir);
// vite 默认监听 localhost（IPv6 ::1），显式绑定 127.0.0.1 与测试目标一致
spawnChild('user', nodeBin, [viteCli, '--host', '127.0.0.1'], path.join(repoRoot, 'apps', 'user-frontend'), {
  SR_PORT: String(USER_PORT),
  SR_API_TARGET: `http://127.0.0.1:${API_PORT}`,
});
spawnChild('admin', nodeBin, [viteCli, '--host', '127.0.0.1'], path.join(repoRoot, 'apps', 'admin-frontend'), {
  SR_PORT: String(ADMIN_PORT),
  SR_API_TARGET: `http://127.0.0.1:${API_PORT}`,
});

await Promise.all([
  pollHttp(`http://127.0.0.1:${API_PORT}/healthz`, 120_000),
  pollHttp(`http://127.0.0.1:${USER_PORT}/`, 120_000),
  pollHttp(`http://127.0.0.1:${ADMIN_PORT}/`, 120_000),
]);

log('ready', `E2E 实例就绪：api=${API_PORT} user=${USER_PORT} admin=${ADMIN_PORT}`);
log('ready', '保持运行中（由 Playwright 管理生命周期）…');
