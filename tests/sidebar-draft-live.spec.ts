import {test,expect} from '@playwright/test'
test('empty draft stays out of history; repeated new-chat and reload do not add rows; first send adds one real chat',async({page,request})=>{
 test.setTimeout(60000)
 const base='http://127.0.0.1:5173',snapshot=await (await request.get(base+'/api/snapshot')).json()
 const count=snapshot.sessions.filter((s:{messages:unknown[]})=>s.messages.length>0).length
 let id:string|undefined
 try{
  await page.goto(base)
  const history=page.getByRole('navigation',{name:'会话列表',exact:true}),rows=history.locator('section > div')
  await expect(rows).toHaveCount(count)
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'新会话',exact:true}).click()
  await expect(rows).toHaveCount(count)
  await page.reload();await expect(rows).toHaveCount(count)
  await page.getByRole('button',{name:'新会话',exact:true}).click()
  const prompt='Reply only SIDEBAR_DRAFT_OK. Do not use tools.'
  await page.getByRole('textbox',{name:'消息',exact:true}).fill(prompt)
  await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeEnabled()
  const sending=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/send'))
  await page.getByRole('button',{name:'发送消息',exact:true}).click();id=(await sending).url().split('/').at(-2)
  await expect(rows).toHaveCount(count+1)
  await expect(page.locator('.assistant-message').last()).toContainText('SIDEBAR_DRAFT_OK',{timeout:45000})
  await expect(page.getByRole('button',{name:'停止生成'})).toHaveCount(0)
  await page.reload();await expect(rows).toHaveCount(count+1)
  await page.getByRole('button',{name:'新会话',exact:true}).click();await expect(rows).toHaveCount(count+1)
  await page.getByRole('button',{name:'搜索会话',exact:true}).click();await page.getByRole('textbox',{name:'搜索会话',exact:true}).fill('SIDEBAR_DRAFT_OK')
  await expect(rows).toHaveCount(1)
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{if(id){await request.post(base+'/api/sessions/'+id+'/stop',{data:{}});await expect.poll(async()=>((await (await request.get(base+'/api/snapshot')).json()).sessions.find((s:{id:string})=>s.id===id)?.messages??[]).some((m:{executing?:boolean})=>m.executing)).toBe(false);expect((await request.delete(base+'/api/sessions/'+id,{data:{}})).ok()).toBe(true)}}
})
