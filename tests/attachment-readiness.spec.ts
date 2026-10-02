import {test,expect} from '@playwright/test'
test('attachment input stays disabled until the restored session is ready',async({page})=>{
 let release!:()=>void
 const ready=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/api/snapshot',async route=>{
  await ready
  await route.fulfill({json:{sessions:[{id:'restored',title:'Restored',group:'今天',context:{workspace:'C:\\Work',agent:'Ailya',model:'["test","model"]'},messages:[{id:'u',role:'user',text:'before'},{id:'a',role:'assistant',text:'ok'}]}],providers:[{id:'test',name:'Test',models:['model']}],cursor:999999999}})
 })
 await page.route('**/api/sessions/restored/send',route=>route.fulfill({status:202,json:{taskId:'test'}}))
 await page.goto('http://127.0.0.1:5173')
 const add=page.getByRole('button',{name:'添加附件',exact:true})
 await expect(add).toBeDisabled();await expect(page.locator('input[type=file]')).toBeDisabled()
 release();await expect(add).toBeEnabled()
 await page.locator('input[type=file]').setInputFiles({name:'ready.txt',mimeType:'text/plain',buffer:Buffer.from('ready')})
 await page.getByRole('textbox',{name:'消息',exact:true}).fill('Read this')
 const request=page.waitForRequest(r=>r.url().endsWith('/api/sessions/restored/send'))
 await page.getByRole('button',{name:'发送消息',exact:true}).click()
 const body=(await request).postDataJSON()
 expect(body.attachments).toHaveLength(1);expect(body.attachments[0].base64).toBe(Buffer.from('ready').toString('base64'))
})
