import {test,expect} from '@playwright/test'

test('workspace picker selects a directory, cancellation preserves it and errors are visible',async({page})=>{
 await page.route('**/api/snapshot',route=>route.fulfill({json:{sessions:[],providers:[],cursor:0}}))
 await page.route('**/api/workspaces',route=>route.fulfill({json:[]}))
 let result:{path:string|null}={path:'C:\\Users\\Public\\Documents'}
 await page.route('**/api/workspaces/pick',route=>route.fulfill({json:result}))
 await page.goto('http://127.0.0.1:5173')
 const picker=page.getByRole('button',{name:'工作空间',exact:true})
 await picker.click();await page.getByRole('button',{name:'选择其他文件夹',exact:true}).click()
 await expect(picker).toHaveText('Documents')
 await expect(picker).toHaveAttribute('title','C:\\Users\\Public\\Documents')
 result={path:null}
 await picker.click();await page.getByRole('button',{name:'选择其他文件夹',exact:true}).click()
 await expect(picker).toHaveText('Documents')
 await page.keyboard.press('Escape')
 await page.unroute('**/api/workspaces/pick')
 await page.route('**/api/workspaces/pick',route=>route.fulfill({status:400,json:{error:'文件夹选择器已经打开'}}))
 await picker.click();await page.getByRole('button',{name:'选择其他文件夹',exact:true}).click()
 await expect(page.getByRole('alert')).toHaveText('文件夹选择器已经打开')
 await expect(picker).toHaveText('Documents')
 await page.setViewportSize({width:390,height:844})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
