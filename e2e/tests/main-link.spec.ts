import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_URL } from '../playwright.config';

/**
 * E2E 主链路：提交工单 → 接单 → 填回执 → 复核公示 → 用户查到脱敏结果。
 *
 * 运行于独立实例（临时数据库 + 种子数据），用总管账号 wangbei 一次性完成
 * 接单与复核（总管具备全权操作能力），避免跨账号切换带来的不稳定。
 */

const CIRCLE = '端到端验证圈';
const CHIEF = { username: 'wangbei', password: 'sr123456', name: '望北' };

/**
 * antd v6 Select：点开与表单 label 关联的 combobox，用键盘导航选中目标选项。
 * （antd v6 浮层 option 的渲染宽度为 0，无法直接点击；aria-activedescendant 跟踪
 *  当前高亮项，ArrowDown 逐项移动，目标项上按 Enter 确认。）
 */
async function pickOption(page: Page, formItemLabel: string, optionText: string | RegExp) {
  const combo = page.getByRole('combobox', { name: formItemLabel });
  await combo.click();
  const matches = (text: string) =>
    typeof optionText === 'string' ? text.includes(optionText) : optionText.test(text);
  for (let i = 0; i < 20; i++) {
    const active = await combo.evaluate((el) => {
      const id = el.getAttribute('aria-activedescendant');
      const opt = id ? document.getElementById(id) : null;
      // antd v6 option 的中文 label 在 aria-label，textContent 可能是 value
      return opt?.getAttribute('aria-label') ?? opt?.textContent?.trim() ?? null;
    });
    if (active !== null && matches(active)) {
      await combo.press('Enter');
      return;
    }
    await combo.press('ArrowDown');
  }
  throw new Error(`pickOption: 未找到选项 ${String(optionText)}`);
}

test('主链路：生成接洽码 → 提交 → 接单 → 回执 → 公示 → 查询', async ({ page, browser }) => {
  // ---------------------------------------------------------------------------
  // 1. 管理后台：总管登录并生成一次性接洽码
  // ---------------------------------------------------------------------------
  const admin = await browser.newPage();
  await admin.goto(`${E2E_ADMIN_URL}/#/login`);
  await admin.getByPlaceholder('如 xingchen').fill(CHIEF.username);
  await admin.getByPlaceholder('请输入密码').fill(CHIEF.password);
  await admin.getByRole('button', { name: '登 录' }).click();
  await expect(admin).toHaveURL(/\/pool$/);

  await admin.goto(`${E2E_ADMIN_URL}/#/keys`);
  await admin.getByRole('button', { name: /生成接洽码/ }).click();
  const contactKey = (await admin.locator('.contact-key-modal__code').textContent()) ?? '';
  expect(contactKey).toMatch(/^[A-Z2-9]{6}$/);
  await admin.getByRole('button', { name: '我已交付' }).click();
  // 我的列表中出现刚生成的未使用接洽码
  await expect(admin.locator('.contact-key-code', { hasText: contactKey })).toBeVisible();

  // ---------------------------------------------------------------------------
  // 2. 用户端：落地页 → 申请表单 → 提交工单（落地页在 /，表单在 /apply）
  // ---------------------------------------------------------------------------
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /在方块间打了六年/ })).toBeVisible();
  await page.getByRole('link', { name: '申请加入 SR' }).click();
  await expect(page).toHaveURL(/\/apply$/);

  await expect(page.getByRole('heading', { name: '提交审核申请' })).toBeVisible();
  // 规则 bundle 加载完成后表单才渲染（loading 态只有骨架屏）
  await expect(page.getByPlaceholder('游戏内使用的圈名')).toBeVisible();

  await page.getByPlaceholder('游戏内使用的圈名').fill(CIRCLE);
  await page.getByPlaceholder('如 AB2CDE').fill(contactKey);
  await pickOption(page, '审核部门', '其他模块');
  await pickOption(page, '审核模式', '建筑');
  await page.getByText('PC PVP（键鼠）', { exact: true }).click();
  await page.getByText('非自证（常规录像）', { exact: true }).click();

  await page.getByRole('button', { name: '提交工单' }).click();
  await expect(page.getByText('工单已提交，等待审核员接单')).toBeVisible();

  // 查询码仅展示一次：8 位大写字母数字（不含 0/1）
  const codeChars = await page.locator('.query-code__char').allTextContents();
  const queryCode = codeChars.join('');
  expect(queryCode).toMatch(/^[A-Z2-9]{8}$/);

  // ---------------------------------------------------------------------------
  // 3. 管理后台：接单
  // ---------------------------------------------------------------------------
  await admin.goto(`${E2E_ADMIN_URL}/#/pool`);
  const pool = admin.getByRole('row').filter({ hasText: CIRCLE });
  await expect(pool).toBeVisible();
  // antd 对两字按钮自动插入空格（「接 单」），用正则兼容两种形态
  await pool.getByRole('button', { name: /^接\s*单$/ }).click();
  await expect(admin.getByText(`已接单：${CIRCLE}`)).toBeVisible();

  // 接单后工单离开「待接单」页签，改从「全部工单」搜索后进入详情
  await admin.getByRole('tab', { name: '全部工单' }).click();
  const search = admin.getByPlaceholder('搜索圈名，回车确认');
  await search.fill(CIRCLE);
  await search.press('Enter');
  const row = admin.getByRole('row').filter({ hasText: CIRCLE });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^详\s*情$/ }).click();
  await expect(admin).toHaveURL(/\/tickets\//);
  await expect(admin.getByRole('heading', { name: CIRCLE })).toBeVisible();
  // 状态文本在标签与 Descriptions 中重复出现，用 sr-tag 精确定位
  await expect(admin.locator('.sr-tag[data-status="reviewing"]')).toBeVisible();

  // ---------------------------------------------------------------------------
  // 4. 填写回执并提交（PC 单端 → 仅 PC 成绩）
  // ---------------------------------------------------------------------------
  await pickOption(admin, 'PC 端成绩', /^C$/);
  await admin.getByText('通过', { exact: true }).click();
  await admin.getByPlaceholder('如：作战部 / 直属总部').fill('作战部');
  await admin
    .getByPlaceholder('面向总管复核与结果公示的意见（可选）')
    .fill('E2E 主链路自动验证：操作流畅，判定通过。');
  await admin.getByRole('button', { name: '提交回执' }).click();

  // 出结果后进入复核面板
  await expect(admin.getByRole('button', { name: '复核通过并公示' })).toBeVisible();

  // ---------------------------------------------------------------------------
  // 5. 总管复核并公示
  // ---------------------------------------------------------------------------
  await admin.getByRole('button', { name: '复核通过并公示' }).click();
  await admin.getByRole('button', { name: '确认公示' }).click();
  await expect(admin.locator('.sr-tag[data-status="published"]')).toBeVisible();

  // ---------------------------------------------------------------------------
  // 6. 用户端：查询进度查看回执结果（HashRouter：路由在 # 之后）
  // ---------------------------------------------------------------------------
  await page.goto('/#/query');
  await page.getByPlaceholder('提交工单时填写的圈名').fill(CIRCLE);
  await page.getByPlaceholder('如 6425C6N7').fill(queryCode);
  await page.getByRole('button', { name: /^查\s*询$/ }).click();

  // 「审核回执」在页面描述/面板标题/时间线多处出现，用 exact 匹配面板标题
  await expect(page.getByText('审核回执', { exact: true })).toBeVisible();
  await expect(page.getByText('审核通过', { exact: true })).toBeVisible();
  await expect(page.getByText(`审核员 ${CHIEF.name}`)).toBeVisible();
  await expect(page.getByText('推荐部门:作战部')).toBeVisible();

  // ---------------------------------------------------------------------------
  // 7. 公示墙：脱敏卡片可见，且不出现完整圈名
  // ---------------------------------------------------------------------------
  await page.goto('/#/published');
  await expect(page.getByRole('heading', { name: '结果公示' })).toBeVisible();
  await expect(page.locator('.pub-card').first()).toBeVisible();
  await expect(page.getByText(CIRCLE)).toHaveCount(0);
});
