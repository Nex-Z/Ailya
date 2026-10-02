import {test,expect} from '@playwright/test'
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const base='http://127.0.0.1:5173'
test('attachment upload, approval refresh, real write and persistent download; refusal stops',async({page,request})=>{
 test.setTimeout(90000)
 const workspace=mkdtempSync(join(tmpdir(),'ailya-ui-permission-')),id=crypto.randomUUID(),content='Attachment proof: tulip-73\n'
 try{
  const sent=await request.post(`${base}/api/sessions/${id}/send`,{data:{requestId:crypto.randomUUID(),text:'Reply only READY.',context:{workspace,agent:'Ailya',model:'默认模型',permission:'default'}}});expect(sent.status()).toBe(202)
  await expect.poll(async()=>{const body=await(await request.get(base+'/api/snapshot')).json();return body.sessions.find((s:{id:string})=>s.id===id)?.messages.at(-1)?.executing}).toBe(false)
  await page.goto(base);await page.evaluate(id=>sessionStorage.setItem('ailya-active-session',id),id);await page.reload()
  await expect(page.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled()
  await page.locator('input[type=file]').setInputFiles({name:'source.txt',mimeType:'text/plain',buffer:Buffer.from(content)})
  await expect(page.getByRole('button',{name:'移除 source.txt',exact:true})).toBeVisible()
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('First read the attached source.txt using read_attachment. Then write proof.txt with exactly its full content. Then reply only DONE.')
  const outgoing=page.waitForRequest(r=>r.url().endsWith(`/api/sessions/${id}/send`)&&r.method()==='POST')
  await page.getByRole('button',{name:'发送消息',exact:true}).click()
  expect((await outgoing).postDataJSON().attachments).toHaveLength(1)
  await expect(page.getByRole('region',{name:'工具执行授权'})).toBeVisible({timeout:60000})
  expect(existsSync(join(workspace,'proof.txt'))).toBe(false)
  const before=await(await request.get(base+'/api/snapshot')).json(),approval=before.sessions.find((s:{id:string})=>s.id===id).permissionRequest.id
  await page.reload();await expect(page.getByRole('region',{name:'工具执行授权'})).toBeVisible()
  const after=await(await request.get(base+'/api/snapshot')).json();expect(after.sessions.find((s:{id:string})=>s.id===id).permissionRequest.id).toBe(approval)
  await page.screenshot({path:'artifacts/browser/phase2-permission.png',fullPage:true})
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
  await expect(page.getByRole('button',{name:'允许这一次',exact:true})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'artifacts/browser/phase2-permission-narrow.png',fullPage:true})
  await page.setViewportSize({width:1280,height:720});await page.getByRole('button',{name:'展开侧栏',exact:true}).click()
  await page.getByRole('button',{name:'允许这一次',exact:true}).click()
  await expect(page.getByRole('button',{name:'停止生成'})).toHaveCount(0,{timeout:60000})
  expect(readFileSync(join(workspace,'proof.txt'),'utf8')).toBe(content)
  await page.reload()
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'下载附件 source.txt'}).click();const download=await downloadPromise
  expect(readFileSync((await download.path())!,'utf8')).toBe(content)
  await page.getByRole('textbox',{name:'消息',exact:true}).fill('Use write to create denied.txt containing never. Do not use other tools.')
  await page.getByRole('button',{name:'发送消息',exact:true}).click()
  await expect(page.getByRole('region',{name:'工具执行授权'})).toBeVisible({timeout:60000})
  await page.getByRole('button',{name:'拒绝并停止',exact:true}).click()
  await expect(page.locator('.assistant-message').last()).toContainText('已停止生成')
  expect(existsSync(join(workspace,'denied.txt'))).toBe(false)
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'artifacts/browser/phase2-narrow.png',fullPage:true})
 }finally{
  await request.post(`${base}/api/sessions/${id}/stop`,{data:{}})
  await expect.poll(async()=>{const body=await(await request.get(base+'/api/snapshot')).json();return body.sessions.find((s:{id:string})=>s.id===id)?.messages.some((m:{executing?:boolean})=>m.executing)??false}).toBe(false)
  await request.delete(`${base}/api/sessions/${id}`,{data:{}});rmSync(workspace,{recursive:true,force:true})
 }
})
test('rejected upload preserves text and file draft on narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto(base)
 await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await page.getByRole('button',{name:'新会话',exact:true}).first().click()
 await page.locator('input[type=file]').setInputFiles({name:'too-large.txt',mimeType:'text/plain',buffer:Buffer.alloc(8*1024*1024+1,65)})
 await page.getByRole('textbox',{name:'消息',exact:true}).fill('Preserve this draft')
 await page.getByRole('button',{name:'发送消息',exact:true}).click()
 await expect(page.getByRole('alert')).toContainText('8 MiB')
 await expect(page.getByRole('textbox',{name:'消息',exact:true})).toHaveValue('Preserve this draft')
 await expect(page.getByRole('button',{name:'移除 too-large.txt'})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})

test('settings allowlist reaches Core and authorizes only the selected test path',async({page,request})=>{
 test.setTimeout(90000)
 const workspace=mkdtempSync(join(tmpdir(),'ailya-ui-policy-')),id=crypto.randomUUID()
 const previous=(await(await request.get(base+'/api/policy')).json()).allowlist as string
 const target=join(workspace,'allowed.txt').replaceAll('\\','/'),rule='^write '+target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'
 const policy=[previous,rule].filter(Boolean).join('\n')
 try{
  await page.goto(base);await page.getByRole('button',{name:'设置',exact:true}).click()
  await expect(page.getByRole('button',{name:'保存',exact:true})).toBeEnabled()
  await page.getByRole('textbox',{name:'风险授权白名单'}).fill(policy)
  await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存')
  expect((await(await request.get(base+'/api/policy')).json()).allowlist).toBe(policy)
  await page.getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.getByRole('textbox',{name:'风险授权白名单'})).toHaveValue(policy)
  await page.getByRole('button',{name:'关闭',exact:true}).click()
  const result=await request.post(`${base}/api/sessions/${id}/send`,{data:{requestId:crypto.randomUUID(),text:'Use write exactly once to create allowed.txt containing approved. Reply DONE.',context:{workspace,agent:'Ailya',model:'默认模型',permission:'default'}}});expect(result.status()).toBe(202)
  await expect.poll(async()=>{const body=await(await request.get(base+'/api/snapshot')).json();return body.sessions.find((s:{id:string})=>s.id===id)?.messages.at(-1)?.executing},{timeout:60000}).toBe(false)
  expect(readFileSync(join(workspace,'allowed.txt'),'utf8')).toBe('approved')
 }finally{
  const current=(await(await request.get(base+'/api/policy')).json()).allowlist
  if(current===policy)await request.post(base+'/api/policy',{data:{allowlist:previous}})
  await request.post(`${base}/api/sessions/${id}/stop`,{data:{}})
  await expect.poll(async()=>{const body=await(await request.get(base+'/api/snapshot')).json();return body.sessions.find((s:{id:string})=>s.id===id)?.messages.some((m:{executing?:boolean})=>m.executing)??false}).toBe(false)
  await request.delete(`${base}/api/sessions/${id}`,{data:{}});rmSync(workspace,{recursive:true,force:true})
 }
})

