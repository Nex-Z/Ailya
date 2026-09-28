import { test, expect } from '@playwright/test'
test('agent capabilities support searchable multi-selection and cancel', async ({page}) => {
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await page.getByRole('button',{name:'编辑 Ailya',exact:true}).click();
 await page.getByRole('button',{name:'Skills',exact:true}).click();
 await page.getByRole('option',{name:'代码实现',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'搜索 Skills'})).toBeVisible();
 await page.getByRole('combobox',{name:'搜索 Skills'}).fill('审查');
 await page.getByRole('option',{name:'代码审查',exact:true}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('button',{name:'Skills',exact:true})).toContainText('代码实现');
 await page.getByRole('button',{name:'Tools',exact:true}).click();
 await page.getByRole('option',{name:'Shell',exact:true}).click();
 await page.getByRole('option',{name:'Git',exact:true}).click();
 await page.screenshot({path:'artifacts/agent-multiselect.png'});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'保存',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:'Agent',exact:true}).click();
 await page.getByRole('button',{name:'编辑 Ailya',exact:true}).click();
 await expect(page.getByRole('button',{name:'Skills',exact:true})).toContainText('代码审查');
 await expect(page.getByRole('button',{name:'Tools',exact:true})).not.toContainText('Shell');
 await expect(page.getByRole('button',{name:'Tools',exact:true})).toContainText('Git');
 await page.getByRole('button',{name:'Tools',exact:true}).click();
 await page.getByRole('option',{name:'Git',exact:true}).click();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'编辑 Ailya',exact:true}).click();
 await expect(page.getByRole('button',{name:'Tools',exact:true})).toContainText('Git');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Skills',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'搜索 Skills'})).toBeVisible();
 await page.screenshot({path:'artifacts/agent-multiselect-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});



