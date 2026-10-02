// Exercise settings against an isolated Core/SQLite without changing the user's policy.
import {chromium,expect} from '@playwright/test'
import {withCore} from '../../tests/core/helpers'
import {resolve,sep} from 'node:path'
import {mkdirSync} from 'node:fs'

await withCore(async(_app,base)=>{
 const browser=await chromium.launch({headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1279,height:1244}})
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.context().grantPermissions(['local-network-access'])
  const origin='http://127.0.0.1:5173'
  await page.addInitScript(base=>{window.WebSocket=class extends WebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(url);super(target.pathname==='/api/events'?base.replace('http:','ws:')+target.pathname+target.search:url,protocols)}}},base)
  let writes=0,failRead=false,failWrite=false
  await page.route(origin+'/**',async route=>{
   const url=new URL(route.request().url()),path=url.pathname
   if(path==='/api/policy'){
    const writing=route.request().method()==='POST';if(writing)writes++
    if(writing?failWrite:failRead)return route.fulfill({status:503,json:{error:'策略服务暂不可用'}})
   }
   if(path.startsWith('/api/'))return route.fulfill({response:await route.fetch({url:base+path+url.search})})
   const file=path.startsWith('/assets/')?resolve('dist','.'+path):resolve('dist/index.html')
   if(!file.startsWith(resolve('dist')+sep))throw Error('Invalid asset path')
   await route.fulfill({path:file})
  })
  await page.goto(origin)
  await page.getByRole('button',{name:'设置',exact:true}).click()
  const dialog=page.getByRole('dialog'),save=dialog.getByRole('button',{name:'保存',exact:true})
  const policy=dialog.getByRole('textbox',{name:'风险授权白名单'})
  const nav=(name:string)=>dialog.getByRole('button',{name,exact:true}).click()
  await expect(policy).toHaveCount(0)
  await save.click();await expect(dialog.getByRole('status')).toHaveText('已保存');expect(writes).toBe(0)
  await nav('权限与安全');await expect(policy).toBeEnabled()
  await policy.fill('[');await save.click()
  await expect(dialog.getByRole('status')).toContainText('第 1 行');expect(writes).toBe(0)
  await nav('常规');await expect(dialog.getByRole('status')).toHaveText('')
  await save.click();await expect(dialog.getByRole('status')).toHaveText('已保存');expect(writes).toBe(0)
  await nav('权限与安全');await expect(policy).toHaveValue('[')
  const rule='^write example\\.txt$';await policy.fill(rule)
  failWrite=true;await save.click();await expect(dialog.getByRole('status')).toContainText('策略服务暂不可用')
  await expect(policy).toHaveValue(rule)
  failWrite=false;await save.click();await expect(dialog.getByRole('status')).toHaveText('已保存')
  expect((await(await fetch(base+'/api/policy')).json()).allowlist).toBe(rule)
  await page.reload();await page.getByRole('button',{name:'设置',exact:true}).click();await nav('权限与安全')
  await expect(policy).toHaveValue(rule)
  mkdirSync('artifacts/browser',{recursive:true})
  await page.screenshot({path:'artifacts/browser/settings-policy-desktop.png'})
  await page.setViewportSize({width:390,height:844})
  for(const element of [policy,save,dialog.getByRole('button',{name:'权限与安全',exact:true})]){
   await expect(element).toBeVisible();const box=(await element.boundingBox())!
   expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390)
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'artifacts/browser/settings-policy-narrow.png'})
  await nav('关闭');failRead=true
  await page.getByRole('button',{name:'设置',exact:true}).click()
  await expect(dialog.getByRole('status')).toContainText('策略服务暂不可用');await expect(save).toBeDisabled()
  await nav('常规');await expect(save).toBeEnabled();await save.click()
  await expect(dialog.getByRole('status')).toHaveText('已保存')
  expect((await(await fetch(base+'/api/policy')).json()).allowlist).toBe(rule)
  expect(writes).toBe(2);expect(errors).toEqual([])
  console.log(JSON.stringify({ok:true,sectionIsolation:true,regexValidation:true,persisted:true,errorRetry:true,loadFailureIsolation:true,desktop:true,narrow:true}))
 }finally{await browser.close()}
},()=>new Response('Model unused',{status:500}))
