import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * E2E 主链路测试配置。
 *
 * 测试完全运行在独立实例上（API 使用临时数据目录 + 种子数据，前端走独立端口），
 * 与本地开发服务（5173 / 5174 / 8787）互不影响，也不会污染真实数据库。
 * 端口编排由 scripts/serve.mjs 统一负责。
 *
 * 浏览器策略：显式设置 SR_E2E_CHANNEL 时以其为准；否则检测到系统安装
 * Microsoft Edge 时直接复用（本地零下载），未检测到则回退 Playwright 自带 Chromium
 * （CI 中由 workflow 预先 `playwright install chromium`）。
 */

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-edge-stable',
];

function resolveChannel(): string | undefined {
  if (process.env.SR_E2E_CHANNEL) return process.env.SR_E2E_CHANNEL;
  if (EDGE_CANDIDATES.some((p) => fs.existsSync(p))) return 'msedge';
  return undefined;
}

export const E2E_USER_URL = process.env.SR_E2E_USER_URL ?? 'http://127.0.0.1:5273';
export const E2E_ADMIN_URL = process.env.SR_E2E_ADMIN_URL ?? 'http://127.0.0.1:5274';

export default defineConfig({
  testDir: './tests',
  // 主链路为单条串行用例，禁止并行导致端口/数据竞争
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_USER_URL,
    channel: resolveChannel(),
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `${E2E_USER_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
