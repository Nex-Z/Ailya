// Built UI + real isolated Core/Pi/SQLite; only the model HTTP boundary is scripted.
import {chromium,expect} from '@playwright/test'
import {withCore,input,post,call,sse,waitSession,settle} from '../../tests/core/helpers'
import {readFileSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
const command="Add-Content -LiteralPath browser.txt -Value 'approved'";let calls=0
await withCore(async(app,base,workspace)=>{
 const browser=await chromium.launch({headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1279,height:1244}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  // Route-served assets require Chromium's loopback permission to reach the real isolated WebSocket.
  await page.context().grantPermissions(['local-network-access'])
  const origin='http://127.0.0.1:5173'
  await page.addInitScript(base=>{window.WebSocket=class extends WebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(url);super(target.pathname==='/api/events'?base.replace('http:','ws:')+target.pathname+target.search:url,protocols)}}},base)
  await page.route(origin+'/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname
   if(path.startsWith('/api/'))return route.fulfill({response:await route.fetch({url:base+path+url.search})})
   const file=path.startsWith('/assets/')?resolve('dist','.'+path):resolve('dist/index.html')
   if(!file.startsWith(resolve('dist')+require('node:path').sep))throw Error('Invalid asset path')
   await route.fulfill({path:file})
  })
  await post(base+'/api/sessions/ui/send',input('first'))
  await waitSession(app,'ui',s=>!!s?.permissionRequest)
  await page.goto(origin);const panel=page.getByRole('region',{name:'工具执行授权'})
  await expect(panel.getByRole('button',{name:'会话内允许',exact:true})).toBeVisible()
  await page.reload();await expect(panel).toBeVisible();await expect(page.getByRole('button',{name:'停止生成',exact:true})).toBeEnabled();await expect(page.getByRole('alert')).toHaveCount(0)
  mkdirSync('artifacts/browser',{recursive:true});await page.screenshot({path:'artifacts/browser/session-permission-desktop.png'})
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
  for(const name of ['拒绝并停止','会话内允许','允许这一次']){const button=panel.getByRole('button',{name,exact:true});await expect(button).toBeVisible();const box=(await button.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390)}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'artifacts/browser/session-permission-narrow.png'})
  const endpoint=origin+'/api/sessions/ui/permissions/'+app.core.storage.session<{permissionRequest:{id:string}}>('ui')!.permissionRequest.id
  await page.route(endpoint,r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"暂时无法提交"}'}))
  await panel.getByRole('button',{name:'会话内允许',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('暂时无法提交');expect(app.core.storage.all('SELECT * FROM session_permission_grants')).toHaveLength(0)
  await page.unroute(endpoint)
  const sent=page.waitForRequest(r=>r.url()===endpoint&&r.method()==='POST')
  await panel.getByRole('button',{name:'会话内允许',exact:true}).click();expect((await sent).postDataJSON()).toEqual({allow:true,scope:'session'})
  await expect(panel).toHaveCount(0);await expect(page.getByText('BROWSER_DONE',{exact:true})).toBeVisible();await settle(app)
  await post(base+'/api/sessions/ui/send',input('second'));await settle(app);await page.reload();await expect(panel).toHaveCount(0)
  expect(readFileSync(join(workspace,'browser.txt'),'utf8').trim().split(/\r?\n/)).toEqual(['approved','approved'])
  expect(app.core.storage.all('SELECT state,scope FROM permission_requests ORDER BY created_at')).toEqual([{state:'allowed',scope:'session'},{state:'automatic',scope:'session'}])
  await post(base+'/api/sessions/ui/send',input('changed'));await expect(panel).toBeVisible()
  await panel.getByRole('button',{name:'拒绝并停止',exact:true}).click();await settle(app);await expect(panel).toHaveCount(0)
  expect(readFileSync(join(workspace,'browser.txt'),'utf8').trim().split(/\r?\n/)).toHaveLength(2)
  expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,persistedGrant:true,reload:true,errorRetry:true,realExecutions:2,changedCommandDenied:true,desktop:true,narrow:true,pageErrors:errors}))
 }finally{await browser.close()}
},()=>{calls++;return calls%2===0?sse({content:'BROWSER_DONE'}):call('powershell',{command:calls===5?command+'; Write-Output changed':command,timeout:10},'shell-'+calls)})
