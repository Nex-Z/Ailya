import {chromium,expect} from '@playwright/test'
import {withCore,input,post,settle,sse} from '../../tests/core/helpers'
import {resolve,sep} from 'node:path'
import {mkdirSync} from 'node:fs'
await withCore(async(app,base)=>{
 const browser=await chromium.launch({headless:true})
 try{
  await post(base+'/api/sessions/source/send',input('UI memory test'));await settle(app)
  const page=await browser.newPage({viewport:{width:1465,height:1244}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.context().grantPermissions(['local-network-access'])
  const origin='http://127.0.0.1:5173'
  await page.addInitScript(base=>{window.WebSocket=class extends WebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(url);super(target.pathname==='/api/events'?base.replace('http:','ws:')+target.pathname+target.search:url,protocols)}}},base)
  await page.route(origin+'/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;if(path.startsWith('/api/'))return route.fulfill({response:await route.fetch({url:base+path+url.search})});const file=path.startsWith('/assets/')?resolve('dist','.'+path):resolve('dist/index.html');if(!file.startsWith(resolve('dist')+sep))throw Error('Invalid path');await route.fulfill({path:file})})
  await page.goto(origin);await expect(page.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled()
  const open=async()=>{await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'记忆',exact:true}).click();await expect(page.getByRole('button',{name:'新增',exact:true})).toBeEnabled()}
  await open();await page.getByRole('button',{name:'新增',exact:true}).click()
  await page.getByRole('textbox',{name:'记忆主题',exact:true}).fill('回答风格');await page.getByRole('textbox',{name:'记忆内容',exact:true}).fill('请使用简洁的中文，先给结论。')
  await page.getByRole('button',{name:'保存记忆',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存')
  expect(app.core.memories.list()[0].content).toBe('请使用简洁的中文，先给结论。')
  await page.reload();await open();await expect(page.getByText('请使用简洁的中文，先给结论。',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'编辑 回答风格',exact:true}).click();await page.getByRole('textbox',{name:'记忆内容',exact:true}).fill('请使用详细的中文，先给结论。');await page.getByRole('button',{name:'保存记忆',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存')
  await expect(page.getByRole('switch',{name:'AI 自动维护',exact:true})).toHaveCount(0)
  await page.getByRole('switch',{name:'使用记忆',exact:true}).click();await expect.poll(()=>app.core.memories.index.config().useEnabled).toBe(false)
  mkdirSync('artifacts/browser',{recursive:true});await page.screenshot({path:'artifacts/browser/memory-desktop.png'})
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.getByRole('button',{name:'编辑 回答风格',exact:true}).click();await page.getByRole('textbox',{name:'记忆内容',exact:true}).fill('窄屏编辑可用');await page.getByRole('button',{name:'保存记忆',exact:true}).click();await expect(page.getByRole('status')).toHaveText('已保存')
  await page.screenshot({path:'artifacts/browser/memory-narrow.png'})
  await page.getByRole('button',{name:'删除 回答风格',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'删除',exact:true}).click();await expect(page.getByText('暂无记忆',{exact:true})).toBeVisible()
  expect(app.core.memories.list()).toHaveLength(0);expect(errors).toEqual([])
  const source=app.core.storage.session<import('../../core/contracts').Session>('source')!.messages[0]
  app.core.memories.index.save({useEnabled:true,learningEnabled:true,embedding:{enabled:false,baseUrl:'',model:''}})
  app.core.memories.save({kind:'fact',topic:'候选测试',content:'测试环境使用本地目录'},{sessionId:'source',messageId:source.id,text:source.text},source.text)
  await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(page.getByText('待确认',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'确认',exact:true}).click();await expect.poll(()=>app.core.memories.list()[0].status).toBe('active')
  expect(app.core.memories.list()[0].origin).toBe('user')
  console.log(JSON.stringify({ok:true,crud:true,reload:true,switches:true,desktop:true,narrow:true,errors}))
 }finally{await browser.close()}
},()=>sse({content:'OK'}))
