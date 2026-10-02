import {chromium,expect} from '@playwright/test'
import {startServer} from '../../core/server'
import {mkdtempSync,mkdirSync,rmSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {sse,input,post,settle} from '../../tests/core/helpers'
const root=mkdtempSync(join(tmpdir(),'ailya-backup-ui-')),workspace=join(root,'workspace');mkdirSync(workspace)
const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>sse({content:'OK'})}),app=startServer({dataPath:join(root,'db'),workspace,port:0,staticDir:resolve('dist')}),base=`http://127.0.0.1:${app.server.port}`
app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']});app.core.storage.db.run("DELETE FROM providers WHERE id<>'test'")
const browser=await chromium.launch({headless:true})
try{
 await post(base+'/api/sessions/kept/send',input('保留会话'));await settle(app)
 const page=await browser.newPage({viewport:{width:1465,height:1244}}),other=await browser.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));other.on('pageerror',e=>errors.push(e.message))
 await page.goto(base);await other.goto(base);await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'会话与存储',exact:true}).click()
 await page.getByRole('button',{name:'创建备份',exact:true}).click();await expect(page.getByText('备份已创建',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'下载',exact:true})).toBeVisible()
 await post(base+'/api/sessions/later/send',input('应移除'));await settle(app);await expect(other.getByText('应移除',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'恢复',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();expect(app.core.storage.list()).toHaveLength(2);await expect.poll(()=>readdirSync(join(root,'backups')).filter(n=>n.startsWith('preview-'))).toEqual([])
 mkdirSync('artifacts/browser',{recursive:true});await page.screenshot({path:'artifacts/browser/backups-desktop.png'});await page.getByRole('button',{name:'恢复',exact:true}).click();const loaded=page.waitForEvent('load');await page.getByRole('button',{name:'确认恢复',exact:true}).click();await loaded
 await expect(page.getByRole('button',{name:'添加附件',exact:true})).toBeEnabled();await expect(other.getByText('应移除',{exact:true})).toHaveCount(0);expect(app.core.storage.list()).toHaveLength(1)
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'会话与存储',exact:true}).click();await expect(page.getByRole('button',{name:'恢复',exact:true})).toHaveCount(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/backups-narrow.png'})
 await page.getByRole('button',{name:'恢复',exact:true}).first().click();await expect(page.getByRole('alertdialog')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/backups-narrow-confirm.png'})
 expect(errors).toEqual([]);console.log(JSON.stringify({backup:true,download:true,cancel:true,restore:true,secondTabReconnect:true,desktop:true,narrow:true,errors}))
}finally{await browser.close();await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
