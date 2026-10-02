import {test,expect} from '@playwright/test'
test('settings validate regex and preserve separate IM accounts',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await expect(page.getByLabel('并发任务上限')).toHaveCount(0);
 await page.getByRole('button',{name:'权限与安全',exact:true}).click();
 await page.getByLabel('风险授权白名单').fill('[');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('第 1 行');
 await page.getByLabel('风险授权白名单').fill('^read_file$\n^git status$');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('已保存');
 await page.getByRole('button',{name:'远程 IM',exact:true}).click();
 await page.getByLabel('允许的用户 ID').fill('first-user');
 await page.getByRole('button',{name:'添加 IM'}).click();
 await page.getByLabel('允许的用户 ID').nth(1).fill('second-user');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'远程 IM',exact:true}).click();
 await expect(page.getByLabel('允许的用户 ID').first()).toHaveValue('first-user');
 await expect(page.getByLabel('允许的用户 ID').nth(1)).toHaveValue('second-user');
});
test('same named models bind to different providers',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('combobox',{name:'模型',exact:true}).click();
 await expect(page.getByRole('option',{name:'DeepSeek / deepseek-flash',exact:true})).toBeVisible();
 await page.getByRole('option',{name:'兼容厂商示例 / deepseek-flash',exact:true}).click();
 const model=await page.evaluate(()=>JSON.parse(localStorage.getItem('ailya-prototype-v1')!).state.sessions[0].context.model);
 expect(JSON.parse(model)).toEqual(['compatible-example','deepseek-flash']);
});
