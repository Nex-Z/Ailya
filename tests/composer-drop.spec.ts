import {test,expect} from '@playwright/test'
test('drop attachments above composer, hide context after send and remove assistant heading',async({page})=>{
 await page.setViewportSize({width:1281,height:1244});
 await page.goto('http://127.0.0.1:5173');
 await expect(page.getByText('我的空间',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'设置',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'语音输入',exact:true})).toBeDisabled();
 await expect(page.locator('.context-bar')).toBeVisible();
 const data=await page.evaluateHandle(()=>{const dt=new DataTransfer();dt.items.add(new File(['hello'],'notes.txt',{type:'text/plain'}));dt.items.add(new File(['world'],'plan.md',{type:'text/markdown'}));return dt});
 await page.locator('.composer').dispatchEvent('dragenter',{dataTransfer:data});
 await page.locator('.composer').dispatchEvent('drop',{dataTransfer:data});
 await expect(page.locator('.composer-attachments')).toContainText('notes.txt');
 const files=await page.locator('.composer-attachments').boundingBox();const box=await page.locator('.composer').boundingBox();
 expect(files!.y+files!.height).toBeLessThanOrEqual(box!.y);
 await page.getByRole('button',{name:'移除 plan.md',exact:true}).click();
 await expect(page.locator('.composer-attachments')).not.toContainText('plan.md');
 await page.screenshot({path:'artifacts/drop-attachments.png',animations:'disabled'});
 await page.getByRole('button',{name:'发送消息',exact:true}).click();
 await expect(page.locator('.context-bar')).toHaveCount(0);
 await expect(page.locator('.user-message')).toContainText('notes.txt');
 await expect(page.locator('.composer-attachments')).toHaveCount(0);
 await page.getByRole('button',{name:'停止生成',exact:true}).click();
 await page.getByRole('button',{name:'排版 · 项目计划与对比',exact:true}).click();
 await expect(page.locator('.assistant-heading')).toHaveCount(0);

 await page.screenshot({path:'artifacts/message-alignment.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'收起侧栏'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});



