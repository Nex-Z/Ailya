import {test,expect} from '@playwright/test'
test('provider CRUD, remote model discovery and selection',async({page})=>{
 await page.route('https://example.com/v1/models',route=>route.fulfill({json:{data:[{id:'remote-model'},{id:'second-model'}]}}));
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'模型与连接',exact:true}).click();
 await page.getByRole('button',{name:'添加厂商',exact:true}).click();
 await page.getByLabel('厂商名称').fill('My Provider');
 await page.getByLabel('Base URL').fill('https://example.com/v1');
 await page.getByLabel('API Key').fill('test-secret');
 await page.getByRole('button',{name:'拉取模型',exact:true}).click();
 await expect(page.getByRole('status')).toHaveText('已获取 2 个模型');
 await page.getByRole('button',{name:'模型',exact:true}).click();
 await page.getByRole('option',{name:'remote-model',exact:true}).click();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'保存厂商'}).click();
 await page.getByRole('button',{name:'编辑 My Provider'}).click();
 await expect(page.getByRole('button',{name:'模型',exact:true})).toContainText('remote-model');
 await page.route('https://example.com/v1/models',route=>route.fulfill({status:401,json:{error:'unauthorized'}}));
 await page.getByRole('button',{name:'拉取模型',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('401');
 await expect(page.getByRole('button',{name:'模型',exact:true})).toContainText('remote-model');
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('combobox',{name:'模型',exact:true}).click();
 await page.getByRole('option',{name:'My Provider / remote-model',exact:true}).click();
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-secret');
 await page.getByRole('button',{name:'设置',exact:true}).click();
 await page.getByRole('button',{name:'删除 My Provider'}).click();
 await page.getByRole('button',{name:'删除',exact:true}).click();
 await expect(page.getByRole('button',{name:'编辑 My Provider'})).toHaveCount(0);
});


