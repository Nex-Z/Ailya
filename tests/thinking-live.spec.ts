import {test,expect} from '@playwright/test'
test('thinking depth saves per model, survives reload, disables during generation and fits narrow composer',async({page,request})=>{
 test.setTimeout(60000)
 const base='http://127.0.0.1:5173',snapshot=await (await request.get(base+'/api/snapshot')).json(),model=snapshot.preferredModel
 const previous=await (await request.get(base+'/api/reasoning?model='+encodeURIComponent(model))).json()
 expect(previous.options).toContain('high');let id:string|undefined
 try{
  await page.goto(base);await page.getByRole('button',{name:'新会话',exact:true}).click()
  const thinking=page.getByRole('combobox',{name:'思考深度',exact:true})
  await thinking.click();await expect(page.getByRole('option',{name:'极深',exact:true})).toBeVisible();await page.getByRole('option',{name:'深度',exact:true}).click()
  await expect(thinking).toHaveText('思考：深度');await expect(thinking).toBeEnabled()
  await page.reload();await page.getByRole('button',{name:'新会话',exact:true}).click();await expect(thinking).toHaveText('思考：深度')
  await page.screenshot({path:'artifacts/browser/thinking-desktop.png'})
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('Reply only THINKING_SETTING_OK. Do not use tools.')
  const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/send'))
  await page.getByRole('button',{name:'发送消息',exact:true}).click();id=(await sent).url().split('/').at(-2)
  await expect(thinking).toBeDisabled()
  await expect(page.locator('.assistant-message').last()).toContainText('THINKING_SETTING_OK',{timeout:45000});await expect(thinking).toBeEnabled()
  const panel=page.locator('.assistant-message').last().locator('.reasoning-panel')
  await expect(panel).toBeVisible();await panel.locator('summary').click()
  const reasoning=await panel.locator('div').innerText();expect(reasoning.length).toBeGreaterThan(0)
  await page.reload();await page.getByRole('button',{name:'Reply only THINKING_SE',exact:true}).first().click()
  await expect(panel).toBeVisible();await panel.locator('summary').click();await expect(panel.locator('div')).toHaveText(reasoning)
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
  await page.screenshot({path:'artifacts/browser/thinking-narrow.png'})
  expect(await page.locator('.composer-actions').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{
  await request.post(base+'/api/reasoning',{data:{model,level:previous.value}})
  if(id){await request.post(base+'/api/sessions/'+id+'/stop',{data:{}});await expect.poll(async()=>((await (await request.get(base+'/api/snapshot')).json()).sessions.find((s:{id:string})=>s.id===id)?.messages??[]).some((m:{executing?:boolean})=>m.executing)).toBe(false);expect((await request.delete(base+'/api/sessions/'+id,{data:{}})).ok()).toBe(true)}
 }
})
