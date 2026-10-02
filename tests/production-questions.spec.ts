import {test,expect} from '@playwright/test'
const base='http://127.0.0.1:5173'
test('real Core question UI persists answers, times out with browser closed, resumes and preserves narrow layout',async({page,request,browser})=>{
 test.setTimeout(60000)
 const id=crypto.randomUUID()
 const snapshot=async()=>{const body=await(await request.get(base+'/api/snapshot')).json();return body.sessions.find((s:{id:string})=>s.id===id)}
 try{
  expect((await request.post(base+`/api/sessions/${id}/send`,{data:{requestId:crypto.randomUUID(),text:'Ask the fixture questions',context:{workspace:'Ailya',agent:'Ailya',model:'["test","test"]',permission:'full'}}})).status()).toBe(202)
  await page.goto(base);await page.evaluate(id=>sessionStorage.setItem('ailya-active-session',id),id);await page.reload()
  const form=page.getByRole('form',{name:'回答 Agent 问题'});await expect(form).toBeVisible()
  const q=(await snapshot()).questionRequest
  await expect(page.getByRole('textbox',{name:'消息',exact:true})).toBeHidden()
  await expect(page.getByRole('button',{name:'蓝色',exact:true})).toHaveAttribute('aria-pressed','false')
  await page.getByRole('button',{name:'红色',exact:true}).click()
  await page.getByRole('button',{name:'下一个',exact:true}).click()
  await page.getByRole('button',{name:'构建',exact:true}).click();await page.getByRole('button',{name:'测试',exact:true}).click()
  await page.getByRole('button',{name:'下一个',exact:true}).click();await page.getByRole('textbox',{name:'补充内容',exact:true}).fill('持久化草稿')
  await expect.poll(async()=>(await snapshot()).questionRequest.drafts.note?.text).toBe('持久化草稿')
  await page.reload();await expect(page.getByRole('button',{name:'红色',exact:true})).toHaveAttribute('aria-pressed','true')
  expect((await snapshot()).questionRequest.deadlineAt).toBe(q.deadlineAt)
  await page.screenshot({path:'artifacts/browser/questions-desktop.png',fullPage:true})
  await page.close()
  await expect.poll(async()=>(await snapshot()).questionRequest.status,{timeout:35000,intervals:[300]}).toBe('timed_out')
  expect((await snapshot()).messages.at(-1).executing).toBe(false)
  const resumed=await browser.newPage({viewport:{width:390,height:844}})
  try{
   await resumed.goto(base);await resumed.evaluate(id=>sessionStorage.setItem('ailya-active-session',id),id);await resumed.reload()
   await expect(resumed.getByText('Ailya · 已超时停止',{exact:true})).toBeVisible()
   await resumed.getByRole('button',{name:'下一个',exact:true}).click()
   await expect(resumed.getByRole('button',{name:'构建',exact:true})).toHaveAttribute('aria-pressed','true')
   await expect(resumed.getByRole('button',{name:'测试',exact:true})).toHaveAttribute('aria-pressed','true')
   await resumed.getByRole('button',{name:'下一个',exact:true}).click()
   await expect(resumed.getByRole('textbox',{name:'补充内容',exact:true})).toHaveValue('持久化草稿')
   await resumed.getByRole('button',{name:'下一个',exact:true}).click();await expect(resumed.getByRole('button',{name:'提交回答',exact:true})).toBeDisabled()
   await resumed.getByRole('button',{name:'手机',exact:true}).click();await resumed.getByRole('textbox',{name:'设备',exact:true}).fill('390px')
   expect(await resumed.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
   await resumed.screenshot({path:'artifacts/browser/questions-narrow.png',fullPage:true})
   await resumed.getByRole('button',{name:'提交回答',exact:true}).click()
   await expect(resumed.getByRole('form',{name:'回答 Agent 问题'})).toHaveCount(0)
   await expect(resumed.getByText('BROWSER_DONE',{exact:true})).toBeVisible()
   const final=await snapshot();expect(final.messages).toHaveLength(2);expect(final.messages.at(-1).durationMs).toBeGreaterThanOrEqual(30000)
   await resumed.reload();await expect(resumed.getByText('BROWSER_DONE',{exact:true})).toBeVisible()
  }finally{await resumed.close()}
 }finally{await request.post(base+`/api/sessions/${id}/stop`,{data:{}});await request.delete(base+`/api/sessions/${id}`,{data:{}})}
})
test('refusal restores the normal composer; API errors keep question and draft visible',async({page,request})=>{
 const id=crypto.randomUUID()
 try{
  await request.post(base+`/api/sessions/${id}/send`,{data:{requestId:crypto.randomUUID(),text:'Ask again',context:{workspace:'Ailya',agent:'Ailya',model:'["test","test"]',permission:'default'}}})
  await page.goto(base);await page.evaluate(id=>sessionStorage.setItem('ailya-active-session',id),id);await page.reload()
  await expect(page.getByRole('form',{name:'回答 Agent 问题'})).toBeVisible()
  await page.route('**/questions/*/refuse',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"暂时无法提交"}'}))
  await page.getByRole('button',{name:'拒答',exact:true}).click();await expect(page.getByRole('alert')).toContainText('暂时无法提交')
  await expect(page.getByRole('form',{name:'回答 Agent 问题'})).toBeVisible();await page.unroute('**/questions/*/refuse')
  await page.getByRole('button',{name:'拒答',exact:true}).click();await expect(page.getByRole('textbox',{name:'消息',exact:true})).toBeVisible()
  await page.reload();await expect(page.getByRole('form',{name:'回答 Agent 问题'})).toHaveCount(0)
 }finally{await request.post(base+`/api/sessions/${id}/stop`,{data:{}});await request.delete(base+`/api/sessions/${id}`,{data:{}})}
})
