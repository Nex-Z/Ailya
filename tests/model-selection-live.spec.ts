import {test,expect} from '@playwright/test'
test('model choice persists before sending and new chats inherit it without changing existing chats',async({page,request})=>{
 test.setTimeout(60000)
 const base='http://127.0.0.1:5173',snapshot=await (await request.get(base+'/api/snapshot')).json(),previous=snapshot.preferredModel
 const choices=snapshot.providers.flatMap((p:{id:string;models:string[]})=>p.models.map(m=>({key:JSON.stringify([p.id,m]),name:m})))
 expect(choices.length).toBeGreaterThan(1)
 const [first,chosen]=choices,id=crypto.randomUUID()
 try{
  expect((await request.post(base+'/api/sessions/'+id+'/send',{data:{requestId:crypto.randomUUID(),text:'Reply only MODEL_SELECTION_OK. Do not use tools.',context:{workspace:'Ailya',agent:'Ailya',model:first.key,permission:'default'}}})).status()).toBe(202)
  await page.goto(base);await page.evaluate(id=>sessionStorage.setItem('ailya-active-session',id),id);await page.reload()
  const model=page.getByRole('combobox',{name:'模型',exact:true})
  await expect(model).toBeEnabled({timeout:45000});await expect(model).toHaveText(first.name)
  await page.getByRole('button',{name:'新会话',exact:true}).first().click()
  await model.click();await page.getByRole('option',{name:chosen.name,exact:true}).click();await expect(model).toHaveText(chosen.name)
  expect((await (await request.get(base+'/api/snapshot')).json()).preferredModel).toBe(chosen.key)
  await page.getByRole('button',{name:'新会话',exact:true}).first().click();await expect(model).toHaveText(chosen.name)
  await page.evaluate(id=>sessionStorage.setItem('ailya-active-session',id),id);await page.reload();await expect(model).toHaveText(first.name)
  await model.click();await page.getByRole('option',{name:chosen.name,exact:true}).click();await expect(model).toHaveText(chosen.name)
  await page.reload();await expect(model).toHaveText(chosen.name)
  await page.getByRole('button',{name:'新会话',exact:true}).first().click();await expect(model).toHaveText(chosen.name)
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
  await expect(model).toHaveText(chosen.name);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{
  await request.post(base+'/api/model-selection',{data:{model:previous}})
  await request.post(base+'/api/sessions/'+id+'/stop',{data:{}})
  await expect.poll(async()=>((await (await request.get(base+'/api/snapshot')).json()).sessions.find((s:{id:string})=>s.id===id)?.messages??[]).some((m:{executing?:boolean})=>m.executing)).toBe(false)
  expect((await request.delete(base+'/api/sessions/'+id,{data:{}})).ok()).toBe(true)
 }
})
