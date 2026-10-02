import {test,expect} from 'bun:test'
import {withCore,post,settle,sse} from './helpers'
import {Core} from '../../core/core'
import {thinkingChoices,modelRuntime} from '../../core/model-runtime'
import {streamSimple} from '@earendil-works/pi-ai/api/openai-completions'
import {normalizeContext} from '@earendil-works/pi-ai/utils/transcript'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const provider={id:'thinking-test',name:'Thinking',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro','deepseek-flash']}
const key=JSON.stringify([provider.id,provider.models[0]])

test('other catalogs distinguish toggles, required thinking, and unknown endpoints',()=>{
 const kimi={...provider,baseUrl:'https://api.moonshot.ai/v1'}
 expect(thinkingChoices(kimi,'kimi-k2.6')).toEqual(['off','on'])
 expect(thinkingChoices(kimi,'kimi-k3')).toEqual(['low','high','max'])
 expect(modelRuntime(kimi,'kimi-k2.6','on').options.reasoning).toBe('high')
 expect(modelRuntime(kimi,'kimi-k3','high').model.thinkingLevelMap?.low).toBe('low')
 const zai={...provider,baseUrl:'https://api.z.ai/api/coding/paas/v4'}
 expect(thinkingChoices(zai,'glm-5.2')).toEqual(['off','high','max'])
 expect(thinkingChoices(zai,'glm-5.3')).toEqual(['low','high','max'])
 expect(thinkingChoices({...kimi,baseUrl:'https://proxy.invalid/v1'},'kimi-k3')).toEqual([])
 expect(thinkingChoices(kimi,'unknown')).toEqual([])
})

test('Kimi and Zai catalog settings serialize through real Pi adapters',async()=>{
 const requests:Record<string,unknown>[]=[]
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){requests.push(await req.json());return sse({content:'ok'})}})
 try{
  for(const [baseUrl,id,level] of [
   ['https://api.moonshot.ai/v1','kimi-k2.6','off'],
   ['https://api.moonshot.ai/v1','kimi-k2.6','on'],
   ['https://api.moonshot.ai/v1','kimi-k3','max'],
   ['https://api.z.ai/api/coding/paas/v4','glm-5.2','off'],
   ['https://api.z.ai/api/coding/paas/v4','glm-5.2','max'],
  ] as const){
   const runtime=modelRuntime({...provider,baseUrl},id,level)
   const result=await streamSimple({...runtime.model,baseUrl:`http://127.0.0.1:${server.port}`},normalizeContext({messages:[{role:'user',content:'hi',timestamp:1}]}),{...runtime.options,apiKey:'test'}).result()
   expect(result.stopReason).toBe('stop')
  }
  expect(requests[0].thinking).toEqual({type:'disabled'})
  expect(requests[1].thinking).toEqual({type:'enabled'})
  expect(requests[1].reasoning_effort).toBeUndefined()
  expect(requests[2].reasoning_effort).toBe('max')
  expect(requests[3].thinking).toEqual({type:'disabled'})
  expect(requests[4].thinking).toEqual({type:'enabled',clear_thinking:false})
  expect(requests[4].reasoning_effort).toBe('max')
 }finally{await server.stop(true)}
})
test('thinking choices are capability gated, per model, persistent, and cannot change an active task',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-thinking-')),path=join(root,'db');let core=new Core(path,root)
 try{
  core.saveProvider(provider);expect(core.reasoningProfile(key).options).toEqual(['off','low','high','max'])
  core.selectReasoning(key,'high');expect(core.reasoningProfile(JSON.stringify([provider.id,'deepseek-flash'])).value).toBe('off')
  core.active.set('running',{} as never);try{expect(()=>core.selectReasoning(key,'off','running')).toThrow('正在执行')}finally{core.active.delete('running')}
  await core.close();core=new Core(path,root);expect(core.reasoningProfile(key).value).toBe('high')
  expect(()=>core.selectReasoning(key,'medium')).toThrow('不支持');core.selectReasoning(key,'default');expect(core.reasoningProfile(key).value).toBe('off')
  core.saveProvider({...provider,baseUrl:'https://example.com'});expect(core.reasoningProfile(key).options).toEqual([]);expect(()=>core.selectReasoning(key,'high')).toThrow('不支持')
  core.saveProvider({...provider,baseUrl:'https://api.moonshot.ai/v1',models:['kimi-k3']})
  const required=JSON.stringify([provider.id,'kimi-k3'])
  expect(core.reasoningProfile(required).value).toBe('low')
  expect(()=>core.selectReasoning(required,'off')).toThrow('不支持')
  core.selectReasoning(required,'max');expect(core.selectReasoning(required,'default').value).toBe('low')
 }finally{await core.close();rmSync(root,{recursive:true,force:true})}
})
test('Core selected thinking depth reaches actual Pi HTTP serialization for every supported level',async()=>{
 const original=globalThis.fetch,requests:Record<string,unknown>[]=[]
 globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
  const url=input instanceof Request?input.url:String(input)
  if(new URL(url).origin==='https://api.deepseek.com'){requests.push(JSON.parse(input instanceof Request?await input.text():String(init?.body)));return sse({content:'OK'})}
  return original(input,init)
 },original)
 try{await withCore(async(app,url)=>{
  app.core.saveProvider(provider)
  for(const level of ['default','off','low','high','max']){
   expect((await post(url+'/api/reasoning',{model:key,level,sessionId:'s'})).status).toBe(200)
   expect((await post(url+'/api/sessions/s/send',{requestId:crypto.randomUUID(),text:'hello',context:{workspace:'Ailya',agent:'Ailya',model:key,permission:'default'}})).status).toBe(202)
   await settle(app)
   const wire=requests.at(-1)!;expect(wire.thinking).toEqual({type:(level==='off'||level==='default')?'disabled':'enabled'});expect(wire.reasoning_effort).toBe((level==='off'||level==='default')?undefined:level)
  }
  expect(requests).toHaveLength(5)
 },()=>sse({content:'unused'}))}finally{globalThis.fetch=original}
})
