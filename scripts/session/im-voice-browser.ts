import {chromium,expect} from '@playwright/test'
import {startServer} from '../../core/server'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {imFixture} from '../../tests/core/im-fixture'
import {encodeWave} from '../../src/lib/voice-wave'
import {sse,settle,input} from '../../tests/core/helpers'
const root=mkdtempSync(join(tmpdir(),'ailya-im-voice-ui-')),workspace=join(root,'workspace');mkdirSync(workspace)
const app=startServer({dataPath:join(root,'db'),workspace,port:0,staticDir:resolve('dist')}),base=`http://127.0.0.1:${app.server.port}`
const f=await imFixture(app);let audioBytes=0,requests=0,block=false,release:(()=>void)|undefined
const asr=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){if(new URL(req.url).pathname.endsWith('chat/completions'))return sse({content:'OK'});const data=await req.formData();audioBytes=(data.get('file') as File).size;requests++;if(block)await new Promise<void>(r=>release=r);return Response.json({text:'这是录音转换的文字'})}})
const fixture=join(root,'voice.wav');writeFileSync(fixture,Buffer.from(encodeWave([Float32Array.from({length:48000},(_,i)=>Math.sin(i/20)*0.2)]),'base64'))
const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+fixture]})
try{
 app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${asr.port}/v1`,models:['test']});app.core.storage.db.run("DELETE FROM providers WHERE id<>'test'");app.core.send('other',input('其他会话'));await settle(app)
 const context=await browser.newContext({viewport:{width:1465,height:1244},permissions:['microphone']}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base)
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'远程 IM',exact:true}).click();await page.getByRole('button',{name:'添加 IM',exact:true}).click();await page.getByRole('button',{name:'扫码绑定',exact:true}).click();await expect(page.getByText('微信 · 已连接',{exact:true})).toBeVisible();await expect(page.getByRole('textbox',{name:'允许的用户 ID'})).toHaveValue('owner')
 mkdirSync('artifacts/browser',{recursive:true});await page.screenshot({path:'artifacts/browser/im-desktop.png'})
 await page.getByRole('button',{name:'停用',exact:true}).click();await expect(page.getByText('微信 · 已停用',{exact:true})).toBeVisible();await page.getByRole('button',{name:'启用',exact:true}).click();await expect(page.getByText('微信 · 已连接',{exact:true})).toBeVisible()
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/im-narrow.png'})
 await page.getByRole('button',{name:'模型与连接',exact:true}).click();await page.getByRole('textbox',{name:'语音服务地址',exact:true}).fill(`http://127.0.0.1:${asr.port}/v1`);await page.getByRole('textbox',{name:'语音模型',exact:true}).fill('fixture-asr');await page.getByRole('button',{name:'保存语音配置',exact:true}).click();await expect(page.getByLabel('语音识别配置').getByText('已保存',{exact:true})).toBeVisible();await page.screenshot({path:'artifacts/browser/speech-settings-narrow.png'})
 await page.keyboard.press('Escape');await page.setViewportSize({width:1465,height:1244})
 await page.getByRole('button',{name:'新会话',exact:true}).click()
 const mic=page.getByRole('button',{name:'语音输入',exact:true});await mic.focus();await page.keyboard.down('Space');await expect(mic).toHaveAttribute('aria-pressed','true');await expect.poll(()=>page.evaluate(()=>navigator.mediaDevices!==undefined)).toBe(true);await page.waitForTimeout(700);await page.keyboard.up('Space')
 await expect(page.getByRole('textbox',{name:'消息',exact:true})).toHaveValue('这是录音转换的文字');expect(audioBytes).toBeGreaterThan(8044);expect(requests).toBe(1);expect(app.core.storage.list()).toHaveLength(1)
 await expect(mic).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('button',{name:'发送消息',exact:true})).toBeEnabled()
 await page.screenshot({path:'artifacts/browser/voice-transcribed.png'})
 // Cancel an in-flight real HTTP transcription by switching sessions; late result must not land in the new draft.
 block=true;await mic.focus();await page.keyboard.down('Space');await expect(mic).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(500);await page.keyboard.up('Space');await expect.poll(()=>requests).toBe(2);await page.getByText('其他会话',{exact:true}).first().click();release?.();await expect(page.getByRole('textbox',{name:'消息',exact:true})).toHaveValue('')
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/browser/voice-narrow.png'});expect(errors).toEqual([])
 console.log(JSON.stringify({binding:true,disable:true,desktop:true,narrow:true,realBrowserCapture:true,wavBytes:audioBytes,transcription:true,draftOnly:true,cancelOnSessionChange:true,errors}))
}finally{release?.();await browser.close();await f.close();await app.close();await asr.stop(true);rmSync(root,{recursive:true,force:true})}
