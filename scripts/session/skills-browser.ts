import {chromium,expect} from '@playwright/test'
import {withCore,sse} from '../../tests/core/helpers'
import {resolve,sep,join} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
await withCore(async(app,base,_workspace,root)=>{
 app.core.storage.db.run("DELETE FROM providers WHERE id<>'test'")
 const bundle=join(root,'browser-package');mkdirSync(bundle);writeFileSync(join(bundle,'SKILL.md'),'---\nname: browser-skill\ndescription: Browser acceptance skill.\ndisable-model-invocation: true\n---\nBROWSER-SKILL-BODY')
 const browser=await chromium.launch({headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1465,height:1244}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.context().grantPermissions(['local-network-access']);const origin='http://127.0.0.1:5173'
  await page.addInitScript(base=>{window.WebSocket=class extends WebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(url);super(target.pathname==='/api/events'?base.replace('http:','ws:')+target.pathname+target.search:url,protocols)}}},base)
  await page.route(origin+'/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;if(path.startsWith('/api/'))return route.fulfill({response:await route.fetch({url:base+path+url.search})});const file=path.startsWith('/assets/')?resolve('dist','.'+path):resolve('dist/index.html');if(!file.startsWith(resolve('dist')+sep))throw Error('Invalid path');await route.fulfill({path:file})})
  await page.goto(origin);await expect(page.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('tab',{name:'Skills',exact:true}).click()
  await page.getByRole('button',{name:'导入本地 Skills',exact:true}).click();await page.getByRole('textbox',{name:'Skills 目录'}).fill(bundle);await page.getByRole('button',{name:'查找',exact:true}).click()
  await page.getByRole('button',{name:'导入',exact:true}).click();await expect(page.getByRole('button',{name:'已导入',exact:true})).toBeVisible();await page.getByRole('button',{name:'完成',exact:true}).click()
  await page.getByRole('button',{name:'启用 browser-skill',exact:true}).click();await expect(page.getByRole('button',{name:'停用 browser-skill',exact:true})).toBeVisible()
  const skill=app.core.resources.list().find(r=>r.kind==='skill')!;expect(skill.enabled).toBe(true)
  await page.getByRole('button',{name:'编辑 browser-skill',exact:true}).click();await page.getByRole('textbox',{name:'名称',exact:true}).fill('浏览器技能');await page.getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('button',{name:'编辑 浏览器技能',exact:true})).toBeVisible()
  mkdirSync('artifacts/browser',{recursive:true});await page.screenshot({path:'artifacts/browser/skills-desktop.png'})
  await page.getByRole('button',{name:'Agent',exact:true}).click();await page.getByRole('button',{name:'新增 Agent',exact:true}).click();await page.getByRole('textbox',{name:'名称',exact:true}).fill('Skill Reader')
  await page.getByRole('button',{name:'Skills',exact:true}).click();await page.getByRole('option',{name:'浏览器技能',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'保存',exact:true}).click()
  await expect(page.getByRole('button',{name:'查看 Skill Reader',exact:true})).toBeVisible();expect(app.core.catalog.list().agents.find(a=>a.name==='Skill Reader')!.skills).toEqual([skill.id])
  await page.getByRole('button',{name:'查看 Skill Reader',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'新建会话',exact:true}).click()
  const composer=page.getByRole('textbox',{name:'消息',exact:true});await composer.fill('/skill');await page.getByRole('option',{name:'/skill · 浏览器技能',exact:true}).click();await expect(composer).toHaveValue('/skill:browser-skill ')
  await composer.pressSequentially('解释这个技能');await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeEnabled();await page.getByRole('button',{name:'发送消息',exact:true}).click();await expect(page.getByText('SKILL-UI-OK',{exact:true})).toBeVisible()
  expect(JSON.stringify(app.core.storage.all('SELECT data FROM requests'))).toContain('BROWSER-SKILL-BODY')
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click();await composer.fill('/skill');await expect(page.getByRole('option',{name:'/skill · 浏览器技能',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/skills-narrow-command.png'})
  await composer.press('Escape');await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await page.getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('tab',{name:'Skills',exact:true}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'导入本地 Skills',exact:true}).click();await page.getByRole('textbox',{name:'Skills 目录'}).fill(bundle);await page.getByRole('button',{name:'查找',exact:true}).click();await expect(page.getByRole('button',{name:'导入',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/skills-narrow-import.png'})
  expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,import:true,enable:true,edit:true,agentSelection:true,slashExecution:true,desktop:true,narrow:true,errors}))
 }finally{await browser.close()}
},()=>sse({content:'SKILL-UI-OK'}))
