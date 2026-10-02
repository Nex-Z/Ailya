import {test,expect} from '@playwright/test'
import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'

test('real generated pelican HTML renders without script errors',async({page})=>{
 const workspace=process.env.AILYA_PELICAN_WORKSPACE??JSON.parse(readFileSync('artifacts/pelican/record.json','utf8')).workspace
 const files=readdirSync(workspace).filter(n=>n.endsWith('.html'))
 expect(files.length).toBeGreaterThan(0)
 const errors:string[]=[],external:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',route=>{
  if(route.request().url()==='http://127.0.0.1:5173/__pelican_artifact__')return route.fulfill({contentType:'text/html',body:readFileSync(join(workspace,files[0]),'utf8')})
  external.push(route.request().url());return route.abort()
 })
 await page.goto('http://127.0.0.1:5173/__pelican_artifact__')
 await expect(page).toHaveTitle(/鹈鹕|pelican/i)
 expect(await page.locator('body').innerText()).toMatch(/鹈鹕|pelican/i)
 await page.screenshot({path:'artifacts/pelican/desktop.png'})
 await page.setViewportSize({width:390,height:844})
 await page.screenshot({path:'artifacts/pelican/narrow.png'})
 expect(errors).toEqual([]);expect(external).toEqual([])
})
