import {chromium,expect} from '@playwright/test'
import {withCore,input,post,settle,sse} from '../../tests/core/helpers'
import {SUMMARY_PROMPT} from '../../core/compaction'
import {resolve,sep} from 'node:path'
import {mkdirSync} from 'node:fs'
let release:()=>void=()=>{},entered:()=>void=()=>{},gate=Promise.resolve()
await withCore(async(app,base)=>{
 const browser=await chromium.launch({headless:true})
 try{
  app.core.saveProvider({id:'test',name:'Test',baseUrl:app.core.providers().find(p=>p.id==='test')!.baseUrl,models:['test','larger'],modelOptions:{larger:{contextWindow:1000000,maxTokens:4096}}})
  for(let n=0;n<4;n++){await post(base+'/api/sessions/ui/send',input('Remember blue project constraint. '+'old detail '.repeat(200)));await settle(app)}
  const page=await browser.newPage({viewport:{width:1279,height:1244}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.context().grantPermissions(['local-network-access'])
  const origin='http://127.0.0.1:5173'
  await page.addInitScript(base=>{window.WebSocket=class extends WebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(url);super(target.pathname==='/api/events'?base.replace('http:','ws:')+target.pathname+target.search:url,protocols)}}},base)
  await page.route(origin+'/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname
   if(path.startsWith('/api/'))return route.fulfill({response:await route.fetch({url:base+path+url.search})})
   const file=path.startsWith('/assets/')?resolve('dist','.'+path):resolve('dist/index.html')
   if(!file.startsWith(resolve('dist')+sep))throw Error('Invalid asset path')
   await route.fulfill({path:file})
  })
  await page.goto(origin);await expect(page.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled()
  const editor=page.getByRole('textbox',{name:'消息',exact:true})
  const ring=page.getByRole('button',{name:/^上下文占用/}),progress=page.getByRole('progressbar',{name:'上下文占用'})
  await expect(progress).toHaveAttribute('aria-valuenow',/\d/)
  const beforePercent=Number(await progress.getAttribute('aria-valuenow'))
  await ring.hover();await expect(page.getByRole('tooltip')).toContainText('32,768 tokens')
  await expect(page.getByRole('tooltip')).toContainText('上下文占用')
  await editor.fill('/compact');await expect(page.getByRole('option',{name:'/compact · 压缩上下文',exact:true})).toBeVisible()
  const started=new Promise<void>(r=>entered=r);gate=new Promise<void>(r=>release=r)
  const before=app.core.storage.all('SELECT * FROM tasks').length
  await editor.press('Enter');await expect(page.getByRole('button',{name:'取消压缩',exact:true})).toBeVisible();await started
  await expect(page.getByRole('button',{name:'取消压缩',exact:true})).toBeVisible()
  await expect(editor).toHaveValue('');expect(app.core.storage.all('SELECT * FROM tasks')).toHaveLength(before)
  await page.reload();await expect(page.getByRole('button',{name:'取消压缩',exact:true})).toBeVisible()
  mkdirSync('artifacts/browser',{recursive:true});await page.screenshot({path:'artifacts/browser/compaction-running.png'})
  release();await app.core.compaction.jobs.get('ui')?.done
  await expect(page.getByRole('status')).toContainText('上下文已压缩')
  await expect.poll(async()=>Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(beforePercent)
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
  await editor.fill('/compact');await expect(page.getByRole('option',{name:'/compact · 压缩上下文',exact:true})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'artifacts/browser/compaction-command-narrow.png'})
  await editor.press('Enter');await expect(page.getByRole('status')).toContainText('没有新的可压缩内容')
  await ring.focus();await expect(page.getByRole('tooltip')).toContainText('32,768 tokens')
  const box=(await ring.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390)
  await page.screenshot({path:'artifacts/browser/context-usage-narrow.png'})
  await page.getByRole('combobox',{name:'模型',exact:true}).click()
  await page.getByRole('option',{name:'larger',exact:true}).click()
  await ring.hover();await expect(page.getByRole('tooltip')).toContainText('1M tokens')
  await expect(page.getByRole('tooltip')).toContainText('1,000,000 tokens')
  await page.setViewportSize({width:1465,height:1244});await ring.hover()
  await page.screenshot({path:'artifacts/browser/context-usage-desktop.png'})
  await page.route(/\/context-usage\?/,r=>r.fulfill({status:503,json:{error:'Unavailable'}}))
  await page.getByRole('combobox',{name:'模型',exact:true}).click();await page.getByRole('option',{name:'test',exact:true}).click()
  await expect(ring).toHaveAccessibleName('上下文占用：上下文数据暂不可用')
  await expect(progress).not.toHaveAttribute('aria-valuenow')
  expect(app.core.storage.all('SELECT * FROM tasks')).toHaveLength(before)
  expect(errors).toEqual([])
  console.log(JSON.stringify({ok:true,slashKeyboard:true,corePersistence:true,reloadWhileRunning:true,noChatMessage:true,narrow:true,contextRing:true,hoverAndFocus:true,compressionReduction:true,modelCapacityChange:true,unavailableState:true,pageErrors:errors}))
 }finally{release();await browser.close()}
},async req=>{
 const body=await req.json() as {messages:unknown[]}
 if(JSON.stringify(body.messages[0]).includes(SUMMARY_PROMPT)){entered();await gate;return sse({content:JSON.stringify({goal:'Blue project',constraints:['m1: blue'],decisions:[],completed:[],pending:[],uncertainties:[]})})}
 return sse({content:'OK'})
})
