import {test,expect} from '@playwright/test'
test('multi-question input replaces composer and preserves answers across sessions',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'提问 · 多问题确认',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'消息',exact:true})).toBeHidden();
 await expect(page.getByRole('button',{name:'提交回答'})).toHaveCount(0);
 await page.getByRole('button',{name:'聊天交互',exact:true}).click();
 await page.getByRole('button',{name:'下一个'}).click();
 await page.getByRole('button',{name:'构建',exact:true}).click();
 await page.getByRole('button',{name:'下一个'}).click();
 await page.getByRole('textbox',{name:'有哪些必须保留的交互？'}).fill('保留快捷键');
 await page.getByRole('button',{name:'下一个'}).click();
 await page.getByRole('button',{name:'手机',exact:true}).click();
 await page.getByRole('textbox',{name:'优先验证哪些设备？'}).fill('包含窄屏');
 await page.getByRole('button',{name:'一起梳理 Ailya 的交互',exact:true}).click();
 await expect(page.getByRole('form',{name:'回答 Agent 问题'})).toHaveCount(0);
 await page.getByRole('button',{name:'提问 · 多问题确认',exact:true}).click();
 await page.getByRole('button',{name:'上一个'}).click();
 await expect(page.getByRole('textbox',{name:'有哪些必须保留的交互？'})).toHaveValue('保留快捷键');
 await page.screenshot({path:'artifacts/questions.png'});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'收起侧栏'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'下一个'}).click();
 await page.getByRole('button',{name:'上一个'}).click();
 await expect(page.getByRole('textbox',{name:'有哪些必须保留的交互？'})).toHaveValue('保留快捷键');
 await page.getByRole('button',{name:'下一个'}).click();
 await page.getByRole('button',{name:'提交回答'}).click();
 await expect(page.getByRole('textbox',{name:'消息',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'问题与回答',exact:false}).click();
 await expect(page.getByText('手机；包含窄屏',{exact:false})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('form',{name:'回答 Agent 问题'})).toHaveCount(0);
});







