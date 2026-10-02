import {test,expect} from '@playwright/test'
test('Group creation delegates to a real member and its read-only progress survives refresh',async({page,request})=>{
 test.setTimeout(60000)
 const base='http://127.0.0.1:5173',suffix=Date.now(),leader={id:crypto.randomUUID(),name:'Lead '+suffix,model:'默认模型',skills:[],tools:[],prompt:'Delegate exactly once to your configured member with task: Reply only WORKER_RESULT. Then reply only TEAM_RESULT.'},worker={...leader,id:crypto.randomUUID(),name:'Worker '+suffix,prompt:'Reply only WORKER_RESULT.'},name='Team '+suffix
 let groupId:string|undefined,sessionId:string|undefined
 try{
  for(const a of [leader,worker])expect((await request.post(base+'/api/catalog/agents',{data:a})).ok()).toBe(true)
  await page.goto(base);await page.getByRole('button',{name:'Group',exact:true}).click();await page.getByRole('button',{name:'新增 Group',exact:true}).click()
  await page.getByLabel('名称',{exact:true}).fill(name);await page.getByRole('combobox',{name:'协调者',exact:true}).click();await page.getByRole('option',{name:leader.name,exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:worker.name,exact:true}).click();await page.getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('button',{name:'查看 '+name,exact:true})).toBeVisible()
  groupId=(await (await request.get(base+'/api/catalog')).json()).groups.find((g:{name:string})=>g.name===name).id
  await page.getByRole('button',{name:'查看 '+name,exact:true}).click();await page.getByRole('button',{name:'新建会话',exact:true}).click()
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('Run your configured delegated verification.')
  const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/send'));await page.getByRole('button',{name:'发送消息',exact:true}).click();sessionId=(await sent).url().split('/').at(-2)
  await expect(page.locator('.assistant-message').last()).toContainText('TEAM_RESULT',{timeout:45000})
  const inspect=async()=>{await page.locator('.assistant-message').last().getByRole('button',{name:/耗时/}).click();await page.getByRole('button',{name:worker.name+' 已完成',exact:true}).click();await expect(page.getByRole('complementary',{name:'子 Agent 会话'})).toContainText('WORKER_RESULT')}
  await inspect();await page.screenshot({path:'artifacts/browser/group-live-desktop.png'})
  await page.reload();await inspect()
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/browser/group-live-narrow.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{
  if(sessionId){await request.post(base+'/api/sessions/'+sessionId+'/stop',{data:{}});await expect.poll(async()=>((await (await request.get(base+'/api/snapshot')).json()).sessions.find((s:{id:string})=>s.id===sessionId)?.messages??[]).some((m:{executing?:boolean})=>m.executing)).toBe(false);await request.delete(base+'/api/sessions/'+sessionId,{data:{}})}
  if(groupId)await request.delete(base+'/api/catalog/groups/'+groupId,{data:{}})
  for(const a of [leader,worker])await request.delete(base+'/api/catalog/agents/'+a.id,{data:{}})
 }
})
