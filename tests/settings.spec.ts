import {test,expect} from '@playwright/test'
test('settings navigation, preferences persistence and responsive layout',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'设置',exact:true});
 expect((await dialog.boundingBox())!.width).toBeGreaterThan(900);
 await page.getByRole('button',{name:'Token 消耗',exact:true}).click();
 await expect(dialog.getByText('暂无用量记录')).toBeVisible();
 await expect(dialog.getByText('0',{exact:true})).toHaveCount(6);
 await page.screenshot({path:'artifacts/settings-usage.png'});
 await page.getByRole('button',{name:'远程 IM',exact:true}).click();
 await page.getByRole('textbox',{name:'允许的用户 ID'}).fill('demo-user');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('已保存');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'远程 IM',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'允许的用户 ID'})).toHaveValue('demo-user');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'artifacts/settings-mobile.png'});
});


