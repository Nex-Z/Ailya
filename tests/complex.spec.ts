import {test,expect} from '@playwright/test'
test('completed work folds by duration, question stays separate and replay expands progress',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'复杂任务 · 项目修复与交付',exact:true}).click();
 await expect(page.locator('.tool-activity')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'耗时 32 秒'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'交付结果'})).toBeVisible();
 await page.getByRole('button',{name:'问题与回答',exact:false}).click();
 await expect(page.getByText('保留，每个会话独立保存。刷新后的文件恢复暂时不做。',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'耗时 32 秒'}).click();
 await expect(page.getByText('我先检查附件状态和发送路径，再让 Reviewer 与 Tester 分别检查边界和复现条件。',{exact:true})).toBeVisible();
 await expect(page.locator('.tool-activity')).toHaveCount(0);
 await page.getByRole('button',{name:'2 次工具调用'}).first().click();
 await expect(page.locator('.tool-activity')).toHaveCount(2);
 await page.getByRole('button',{name:'回放过程',exact:true}).click();
 await expect(page.getByText('我先检查附件状态和发送路径，再让 Reviewer 与 Tester 分别检查边界和复现条件。',{exact:true})).toBeVisible({timeout:5000});
 await expect(page.getByRole('button',{name:'read_file 执行中'})).toBeVisible({timeout:5000});
 await page.getByRole('button',{name:'暂停回放',exact:true}).click();
 await page.getByRole('button',{name:'查看完整记录'}).click();
});


