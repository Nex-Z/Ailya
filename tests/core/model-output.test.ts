import {test,expect} from 'bun:test'
import {withCore,input,post,settle,packet,sse,waitSession,call} from './helpers'
import {modelRuntime} from '../../core/model-runtime'
import type {Session} from '../../core/contracts'
import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {streamSimple} from '@earendil-works/pi-ai/api/openai-completions'
import {normalizeContext} from '@earendil-works/pi-ai/utils/transcript'

test('Pi profile is origin-bound, budget bounded, overrides validated and persisted',async()=>{
 const config={id:'custom',name:'DeepSeek',baseUrl:'https://api.deepseek.com/v1',models:['deepseek-v4-pro']}
 const runtime=modelRuntime(config,'deepseek-v4-pro')
 expect(runtime.source).toBe('pi-catalog');expect(runtime.model.reasoning).toBe(true)
 expect(runtime.options).toEqual({maxTokens:32768,reasoning:'low'})
 expect(runtime.model.thinkingLevelMap?.low).toBe('low')
 expect(runtime.model.compat?.thinkingFormat).toBe('deepseek')
 expect(modelRuntime({...config,baseUrl:'https://example.com'},'deepseek-v4-pro').source).toBe('compatible-fallback')
 expect(modelRuntime({...config,modelOptions:{'deepseek-v4-pro':{maxTokens:10000,contextWindow:5000}}},'deepseek-v4-pro').options.maxTokens).toBe(5000)
 await withCore(async(app,url)=>{
  const original=app.core.providers()[0]
  const saved={...original,modelOptions:{test:{maxTokens:8192,reasoning:'high'}}}
  expect((await post(url+'/api/providers',saved)).status).toBe(200)
  expect(app.core.providers()[0].modelOptions).toEqual(saved.modelOptions)
  expect((await post(url+'/api/providers',{...saved,modelOptions:{test:{maxTokens:-1}}})).status).toBe(400)
 },()=>sse({content:'ok'}))
})

test('Pi emits the verified DeepSeek budget and thinking switch on the wire',async()=>{
 const requests:Record<string,unknown>[]=[]
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){requests.push(await req.json());return sse({content:'ok'})}})
 try{
  const provider={id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro']}
  for(const reasoning of ['low','off'] as const){
   const runtime=modelRuntime({...provider,modelOptions:{'deepseek-v4-pro':{reasoning}}},'deepseek-v4-pro')
   const result=await streamSimple({...runtime.model,baseUrl:`http://127.0.0.1:${server.port}`},normalizeContext({messages:[{role:'user',content:'hi',timestamp:1}]}),{...runtime.options,apiKey:'test'}).result()
   expect(result.stopReason).toBe('stop')
  }
  expect(requests[0].max_tokens).toBe(32768);expect(requests[0].reasoning_effort).toBe('low');expect(requests[0].thinking).toEqual({type:'enabled'})
  expect(requests[1].thinking).toEqual({type:'disabled'});expect(requests[1].reasoning_effort).toBeUndefined()
 }finally{await server.stop(true)}
})

for(const finish of ['length','stop'])test(`thinking-only ${finish} fails visibly without thousands of snapshots`,async()=>{
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/output/send',input());await settle(app)
  const reply=app.core.storage.session<Session>('output')!.messages.at(-1)!
  expect(reply.error).toContain(finish==='length'?'输出上限':'未返回有效回复')
  expect(reply.executing).toBe(false);expect(reply.phase).toBeUndefined()
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('failed')
  expect(app.core.storage.get<{n:number}>("SELECT count(*) n FROM events WHERE kind='session'")!.n).toBeLessThan(30)
  expect(app.core.storage.get<{n:number}>("SELECT count(*) n FROM events WHERE kind='pi.message_update'")!.n).toBe(0)
  const states=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='session'").map(r=>JSON.parse(r.data))
  expect(states.some(s=>s.messages.at(-1).phase==='thinking')).toBe(true)
  expect(reply.reasoning).toBe('private-reasoning'.repeat(4096));expect(reply.text).toBe('')
 },()=>new Response(packet({role:'assistant'})+Array.from({length:4096},()=>packet({reasoning_content:'private-reasoning'})).join('')+packet({},finish)+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}))
})

test('partial text is preserved on truncation and retry can succeed',async()=>{
 let attempt=0
 await withCore(async(app,url)=>{
  const data=input('create html')
  await post(url+'/api/sessions/output/send',data);await settle(app)
  const reply=app.core.storage.session<Session>('output')!.messages.at(-1)!
  expect(reply.text).toBe('<html>');expect(reply.error).toContain('输出上限')
  expect(reply.reasoning).toBe('first attempt')
  await post(url+'/api/sessions/output/send',{...data,requestId:crypto.randomUUID(),retryMessageId:reply.id});await settle(app)
  const next=app.core.storage.session<Session>('output')!.messages.at(-1)!
  expect(next.text).toBe('done');expect(next.error).toBeUndefined()
  expect(next.reasoning).toBeUndefined()
 },()=>++attempt===1?new Response(packet({reasoning_content:'first attempt'})+packet({content:'<html>'})+packet({},'length')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}):sse({content:'done'}))
})

test('Pi refuses truncated write arguments without side effects or permission requests',async()=>{
 await withCore(async(app,url,workspace)=>{
  await post(url+'/api/sessions/output/send',input());await settle(app)
  expect(existsSync(join(workspace,'bad.html'))).toBe(false)
  expect(app.core.storage.get<{n:number}>('SELECT count(*) n FROM permission_requests')!.n).toBe(0)
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('failed')
 },()=>sse({tool_calls:[{index:0,id:'cut',type:'function',function:{name:'write',arguments:JSON.stringify({path:'bad.html',content:'partial'})}}]},'length'))
})

test('stopping while thinking clears phase and stays stopped',async()=>{
 let controller:ReadableStreamDefaultController<Uint8Array>|undefined
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/output/send',input())
  await waitSession(app,'output',s=>s?.messages.at(-1)?.phase==='thinking')
  await post(url+'/api/sessions/output/stop',{});await settle(app)
  const reply=app.core.storage.session<Session>('output')!.messages.at(-1)!
  expect(reply.reasoning).toBe('reason');expect(reply.stopped).toBe(true);expect(reply.error).toBeUndefined();expect(reply.phase).toBeUndefined()
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('stopped')
  try{controller?.close()}catch{/* already cancelled */}
 },()=>new Response(new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(packet({role:'assistant',reasoning_content:'reason'})))}}),{headers:{'Content-Type':'text/event-stream'}}))
})

test('truncated final answer preserves a completed write and marks task failed',async()=>{
 let request=0
 await withCore(async(app,url,workspace)=>{
  const data=input();data.context.permission='full'
  await post(url+'/api/sessions/output/send',data);await settle(app)
  expect(readFileSync(join(workspace,'done.html'),'utf8')).toBe('<html></html>')
  const reply=app.core.storage.session<Session>('output')!.messages.at(-1)!
  expect(reply.fileChanges).toHaveLength(1);expect(reply.error).toContain('输出上限')
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('failed')
 },()=>++request===1?call('write',{path:'done.html',content:'<html></html>'}):sse({content:'partial'},'length'))
})
