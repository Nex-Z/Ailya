import {test,expect} from '@playwright/test'
test('Agent editor persists to Core and selected persona produces a real model reply',async({page,request})=>{
 test.setTimeout(60000)
 const base='http://127.0.0.1:5173',name='Agent UI '+Date.now();let agentId:string|undefined,sessionId:string|undefined
 try{
  await page.goto(base);await page.getByRole('button',{name:'Agent',exact:true}).click()
  await page.getByRole('button',{name:'新增 Agent',exact:true}).click()
  await page.getByLabel('名称',{exact:true}).fill(name)
  await page.getByLabel('Prompt',{exact:true}).fill('Always answer with only AGENT_UI_OK. Do not use tools.')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('button',{name:'查看 '+name,exact:true})).toBeVisible()
  const catalog=await (await request.get(base+'/api/catalog')).json();agentId=catalog.agents.find((a:{name:string})=>a.name===name).id
  await page.reload();await page.getByRole('button',{name:'Agent',exact:true}).click()
  await page.getByRole('button',{name:'查看 '+name,exact:true}).click();await page.getByRole('button',{name:'新建会话',exact:true}).click()
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('Please follow your configured prompt.')
  const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/send'))
  await page.getByRole('button',{name:'发送消息',exact:true}).click();sessionId=(await sent).url().split('/').at(-2)
  await expect(page.locator('.assistant-message').last()).toContainText('AGENT_UI_OK',{timeout:45000})
  await page.screenshot({path:'artifacts/browser/agent-live-desktop.png'})
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{
  if(sessionId){await request.post(base+'/api/sessions/'+sessionId+'/stop',{data:{}});await expect.poll(async()=>((await (await request.get(base+'/api/snapshot')).json()).sessions.find((s:{id:string})=>s.id===sessionId)?.messages??[]).some((m:{executing?:boolean})=>m.executing)).toBe(false);await request.delete(base+'/api/sessions/'+sessionId,{data:{}})}
  if(agentId)await request.delete(base+'/api/catalog/agents/'+encodeURIComponent(agentId),{data:{}})
 }
})
