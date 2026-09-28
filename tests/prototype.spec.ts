import { test, expect } from '@playwright/test'
test('session flow and responsive layout', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.goto('http://127.0.0.1:5173');
 await expect(page.getByRole('heading', { name: '今天，我们一起做点什么？' })).toBeVisible();
 await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true, animations: 'disabled' });
 await page.getByRole('textbox', { name: '消息', exact: true }).fill('/');
 await page.getByRole('listbox').getByRole('option').filter({ hasText: '/agent' }).click();
 await page.getByRole('listbox').getByRole('option').filter({ hasText: 'Dev Team' }).click();
 await page.getByRole('textbox', { name: '消息', exact: true }).press('Escape');
 await page.getByRole('textbox', { name: '消息', exact: true }).fill('请帮我规划这个项目');
 await page.getByRole('button', { name: '发送消息' }).click();
 await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
 await page.getByRole('button', { name: '停止生成' }).click();
 await expect(page.getByText('已停止生成')).toBeVisible();
 await page.getByRole('textbox', { name: '消息', exact: true }).fill('/');
 await page.getByRole('listbox').getByRole('option').filter({ hasText: '/agent' }).click();
 await expect(page.getByRole('listbox').getByRole('option').filter({ hasText: 'Coder' })).toHaveAttribute('aria-disabled', 'true');
 await page.getByRole('textbox', { name: '消息', exact: true }).press('Escape');
 await page.getByRole('textbox', { name: '消息', exact: true }).fill('继续');
 await page.getByRole('button', { name: '发送消息' }).click();
 await expect(page.getByRole('button', { name: '停止生成' })).toBeHidden({ timeout: 10000 });
 await page.screenshot({ path: 'artifacts/conversation.png', fullPage: true, animations: 'disabled' });
 await page.reload(); await expect(page.getByText('请帮我规划这个项目', { exact: true }).last()).toBeVisible();
 await page.getByRole('button', { name: '新会话', exact: false }).first().click();
 await expect(page.getByRole('heading', { name: '今天，我们一起做点什么？' })).toBeVisible();
 await page.setViewportSize({ width: 390, height: 844 });
 await page.getByRole('button', { name: '收起侧栏' }).click();
 await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true, animations: 'disabled' });
 expect(errors).toEqual([]);
});



 test('slash list filters and supports keyboard without a modal', async ({ page }) => {
  await page.setViewportSize({ width: 1460, height: 1244 });
  await page.goto('http://127.0.0.1:5173');
  const input = page.getByRole('textbox', { name: '消息', exact: true });
  await input.fill(''); await input.fill('/');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.screenshot({ path: 'artifacts/slash-menu.png', animations: 'disabled' });
  await input.fill('/ag');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
  await input.press('Enter');
  await expect(input).toHaveValue('/agent ');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.getByRole('combobox', { name: '伙伴与团队' })).toHaveText('Coder');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await input.fill('/unknown');
  await expect(page.getByText('没有匹配的命令')).toBeVisible();
  await input.press('Enter');
  await expect(page.locator('.user-message')).toHaveCount(0);
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveValue('/unknown');
  await input.fill(''); await input.fill('/');
  await page.locator('.topbar').click({ position: { x: 100, y: 20 } });
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '收起侧栏' }).click();
  await input.fill(''); await input.fill('/');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.screenshot({ path: 'artifacts/slash-mobile.png', animations: 'disabled' });
  const bounds = await page.locator('.slash-menu').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
 });


test('independent context selectors, model placement, grouped commands and settings', async ({ page }) => {
 await page.goto('http://127.0.0.1:5173');
 await page.setViewportSize({ width: 1460, height: 1244 });
 await page.getByRole('combobox', { name: '工作空间', exact: true }).click(); await page.getByRole('option', { name: 'openEagle', exact: true }).click();
 await page.getByRole('combobox', { name: '伙伴与团队', exact: true }).click(); await page.getByRole('option', { name: 'Dev Team', exact: true }).click();
 await page.getByRole('combobox', { name: '模型', exact: true }).click(); await page.getByRole('option', { name: 'DeepSeek / deepseek-v4-pro', exact: true }).click();
 await expect(page.getByRole('combobox', { name: '运行机器' })).toHaveText('Local');
 const model = await page.getByRole('combobox', { name: '模型', exact: true }).boundingBox();
 const send = await page.getByRole('button', { name: '发送消息' }).boundingBox();
 expect(model!.x + model!.width).toBeLessThan(send!.x);
 expect(Math.abs(model!.y - send!.y)).toBeLessThan(20);
 await expect(page.getByText('工具与上下文', { exact: true })).toHaveCount(0);
 await page.screenshot({ path: 'artifacts/neutral-desktop.png', animations: 'disabled' });
 const input = page.getByRole('textbox', { name: '消息', exact: true });
 await input.fill(''); await input.fill('/');
 await expect(page.getByRole('group', { name: '上下文', exact: true })).toBeVisible();
 await expect(page.getByRole('group', { name: '工具', exact: true })).toBeVisible();
 await page.screenshot({ path: 'artifacts/grouped-commands.png', animations: 'disabled' });
 await page.getByRole('listbox').getByRole('option').filter({ hasText: '/terminal' }).click();
 await expect(input).toHaveValue('请帮我规划需要执行的 Shell 命令：');
 await page.getByRole('button', { name: '发送消息' }).click();
 await expect(page.getByRole('combobox', { name: '工作空间' })).toHaveCount(0);
 await expect(page.getByRole('combobox', { name: '模型', exact: true })).toBeDisabled();
 await page.getByRole('button', { name: '停止生成' }).click();
 await page.getByRole('button', { name: '设置', exact: true }).click();
 await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeVisible();
 await page.getByRole('button', { name: '关闭', exact: true }).click();
 await page.setViewportSize({ width: 390, height: 844 });
 await page.getByRole('button', { name: '收起侧栏' }).click();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await expect(page.getByRole('combobox', { name: '模型', exact: true })).toBeVisible();
 await page.screenshot({ path: 'artifacts/neutral-mobile.png', animations: 'disabled' });
});






test('unified select keyboard behavior and restrained page copy', async ({ page }) => {
 await page.goto('http://127.0.0.1:5173');
 await page.setViewportSize({ width: 1460, height: 1000 });
 await expect(page.locator('select:visible')).toHaveCount(0);
 for (const text of ['你的伙伴，随时在这里', '从一个想法开始，或接着上次的事情。', '留一点空间，给新的可能。', 'Prototype 02', '本地优先', '界面预览', '让想法，在这里继续。', '唤起更多能力', 'assistant-ui · 模拟回复']) await expect(page.getByText(text, { exact: true })).toHaveCount(0);
 const workspace = page.getByRole('combobox', { name: '工作空间' });
 await workspace.click();
 await page.screenshot({ path: 'artifacts/shadcn-workspace.png', animations: 'disabled' });
 await page.getByRole('option', { name: 'openEagle', exact: true }).click();
 await expect(workspace).toHaveText('openEagle');
 await expect(workspace).toBeFocused();
 const model = page.getByRole('combobox', { name: '模型', exact: true });
 await model.focus(); await model.press('ArrowDown');
 await expect(page.getByRole('listbox')).toBeVisible();
 await page.screenshot({ path: 'artifacts/shadcn-model.png', animations: 'disabled' });
 await page.keyboard.press('Escape');
 await expect(model).toBeFocused();
 await page.getByRole('button', { name: '删除 新会话', exact: true }).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.getByRole('button', { name: '取消', exact: true }).click();
 await page.screenshot({ path: 'artifacts/shadcn-desktop.png', animations: 'disabled' });
 await page.setViewportSize({ width: 390, height: 844 });
 await page.getByRole('button', { name: '收起侧栏' }).click();
 await model.click();
 await page.screenshot({ path: 'artifacts/shadcn-mobile.png', animations: 'disabled' });
 const bounds = await page.getByRole('listbox').boundingBox();
 expect(bounds!.x).toBeGreaterThanOrEqual(0);
 expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});





