import {test,expect} from '@playwright/test'
test('agent panel switches conversations, shows status and closes',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'团队 · 工作状态',exact:true}).click();
 await page.getByRole('button',{name:'Coder 已完成',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'子 Agent 会话'});
 await expect(panel).toBeVisible();
 await expect(panel.getByText('已完成组件修改，交给 Reviewer 检查。')).toBeVisible();
 await panel.getByRole('button',{name:'Reviewer 进行中'}).click();
 await expect(panel.getByText('已检查上下文锁定，正在核对中文输入法处理。')).toBeVisible();
 await panel.getByRole('button',{name:'Tester 有问题'}).click();
 await expect(panel.getByText('窄屏下发现工具列表遮挡发送按钮，需要调整后重新验证。')).toBeVisible();
 await page.screenshot({path:'artifacts/agent-panel.png'});
 await page.getByRole('button',{name:'关闭子 Agent 会话'}).click();
 await expect(panel).toHaveCount(0);
 await page.getByRole('button',{name:'Coder 已完成',exact:true}).click();
 await page.getByRole('button',{name:'一起梳理 Ailya 的交互',exact:true}).click();
 await expect(panel).toHaveCount(0);
 await page.getByRole('button',{name:'团队 · 工作状态',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(panel).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'关闭子 Agent 会话'}).click();
});




