import {chromium,expect} from '@playwright/test'
import {withCore,sse} from '../../tests/core/helpers'
import {resolve,sep,join} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
await withCore(async(app,base,_workspace,root)=>{
 app.core.storage.db.run("DELETE FROM providers WHERE id<>'test'")
 const bundle=join(root,'browser-plugin');mkdirSync(bundle);writeFileSync(join(bundle,'index.ts'),`export default pi=>pi.registerTool({name:'hello',label:'Hello',description:'Browser fixture',parameters:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:'HELLO'}],details:{}})})`)
 const browser=await chromium.launch({headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1465,height:1244}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  await page.context().grantPermissions(['local-network-access']);const origin='http://127.0.0.1:5173'
  await page.addInitScript(base=>{window.WebSocket=class extends WebSocket{constructor(url:string|URL,protocols?:string|string[]){const target=new URL(url);super(target.pathname==='/api/events'?base.replace('http:','ws:')+target.pathname+target.search:url,protocols)}}},base)
  await page.route(origin+'/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;if(path.startsWith('/api/'))return route.fulfill({response:await route.fetch({url:base+path+url.search})});const file=path.startsWith('/assets/')?resolve('dist','.'+path):resolve('dist/index.html');if(!file.startsWith(resolve('dist')+sep))throw Error('Invalid path');await route.fulfill({path:file})})
  await page.goto(origin);await expect(page.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled()
  await page.getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('tab',{name:'插件',exact:true}).click();await page.getByRole('button',{name:'安装插件',exact:true}).click()
  await page.getByRole('combobox',{name:'来源类型'}).click();await page.getByRole('option',{name:'本地路径',exact:true}).click();await page.getByRole('textbox',{name:'插件来源'}).fill(bundle)
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'安装',exact:true})).toBeDisabled();await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'安装',exact:true}).click()
  await expect(page.getByText('已就绪',{exact:true})).toBeVisible({timeout:15000});const plugin=app.core.plugins.list()[0];expect(plugin.enabled).toBe(true)
  await page.getByRole('button',{name:'停用',exact:true}).click();await expect(page.getByText('已停用',{exact:true})).toBeVisible();expect(app.core.plugins.get(plugin.id)!.enabled).toBe(0)
  await page.getByRole('button',{name:'启用',exact:true}).click();await expect(page.getByText('已就绪',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'重新加载',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'确认',exact:true}).click();await expect(page.getByText('检查中',{exact:true})).toBeVisible();await expect(page.getByText('已就绪',{exact:true})).toBeVisible({timeout:15000})
  mkdirSync('artifacts/browser',{recursive:true});await page.screenshot({path:'artifacts/browser/plugins-desktop.png'})
  await page.getByRole('button',{name:'Agent',exact:true}).click();await page.getByRole('button',{name:'新增 Agent',exact:true}).click();await page.getByRole('textbox',{name:'名称',exact:true}).fill('Plugin Reader')
  await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('option',{name:'插件',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('button',{name:'查看 Plugin Reader',exact:true})).toBeVisible();expect(app.core.catalog.list().agents.find(a=>a.name==='Plugin Reader')!.tools).toContain('插件')
  await page.getByRole('button',{name:'扩展',exact:true}).click();await page.getByRole('tab',{name:'插件',exact:true}).click();await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/plugins-narrow.png'})
  await page.getByRole('button',{name:'编辑',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/plugins-narrow-install.png'});await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'卸载',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'卸载',exact:true}).click();await expect(page.getByText('暂无插件',{exact:true})).toBeVisible();expect(app.core.plugins.list()).toHaveLength(0)
  expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,install:true,trust:true,toggle:true,reload:true,agentSelection:true,uninstall:true,desktop:true,narrow:true,errors}))
 }finally{await browser.close()}
},()=>sse({content:'PLUGIN-UI-OK'}))
