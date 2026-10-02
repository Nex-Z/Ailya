import {waitSession} from './helpers'
import {test,expect} from 'bun:test'
import {startServer} from '../../core/server'
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import type {Session} from '../../core/contracts'
const packet=(delta:unknown,finish:string|null=null)=>`data: ${JSON.stringify({id:'test',object:'chat.completion.chunk',created:1,model:'test',choices:[{index:0,delta,finish_reason:finish}]})}\n\n`
const textResponse=(text='ok')=>new Response(packet({role:'assistant',content:text})+packet({},'stop')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}})
async function withCore(run:(app:ReturnType<typeof startServer>,url:string,root:string)=>Promise<void>,handler:(req:Request)=>Response|Promise<Response>=()=>textResponse()){
 const root=mkdtempSync(join(tmpdir(),'ailya-test-'))
 const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:handler})
 const app=startServer({dataPath:join(root,'db.sqlite'),workspace:root,port:0})
 app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
 try{await run(app,`http://127.0.0.1:${app.server.port}`,root)}finally{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
}
const input=(text='hello')=>({requestId:crypto.randomUUID(),text,context:{workspace:'Ailya',agent:'Ailya',model:'["test","test"]',permission:'default'}})
const post=(url:string,data:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
const settle=(app:ReturnType<typeof startServer>)=>Promise.all([...app.core.active.values()].map(x=>x.done))
test('API persists completion, transcript and request; duplicate is idempotent; origin denied',async()=>{
 await withCore(async(app,url)=>{
  const body=input(),r=await post(url+'/api/sessions/test/send',body);expect(r.status).toBe(202);await settle(app)
  expect(app.core.storage.session<Session>('test')!.messages.at(-1)!.text).toBe('ok')
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('completed')
  expect(app.core.storage.get('SELECT data FROM transcripts')).toBeDefined()
  expect((await post(url+'/api/sessions/test/send',body)).status).toBe(202)
  expect(app.core.storage.get<{n:number}>('SELECT count(*) n FROM tasks')!.n).toBe(1)
  expect((await post(url+'/api/sessions/test/send',{...body,text:'changed'})).status).toBe(400)
  expect((await fetch(url+'/api/snapshot',{headers:{Origin:'https://hostile.example'}})).status).toBe(403)
 })
})
test('disconnect does not cancel, websocket cursor restores completed session',async()=>{
 let release!:()=>void,entered!:()=>void;const waiting=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r)
 await withCore(async(app,url)=>{
  const ws=new WebSocket(url.replace('http','ws')+'/api/events?after=0');await new Promise<void>(r=>ws.onopen=()=>r())
  await post(url+'/api/sessions/test/send',input());await waiting;ws.close();release();await settle(app)
  const restored=new WebSocket(url.replace('http','ws')+'/api/events?after=0')
  await new Promise<void>((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('websocket timeout')),3000);restored.onmessage=e=>{const event=JSON.parse(e.data);if(event.session.messages.at(-1)?.executing===false){clearTimeout(deadline);restored.close();resolve()}}})
  expect(app.core.storage.session<Session>('test')!.messages.at(-1)!.text).toBe('ok')
 },async()=>{entered();await gate;return textResponse()})
})
test('stop aborts pending stream and records stopped; no tool writes',async()=>{
 let entered!:()=>void;const waiting=new Promise<void>(r=>entered=r)
 await withCore(async(app,url,root)=>{
  await post(url+'/api/sessions/test/send',input());await waiting
  await post(url+'/api/sessions/test/stop',{});await settle(app)
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('stopped')
  expect(existsSync(join(root,'late.txt'))).toBe(false)
 },()=>{entered();return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(packet({role:'assistant',content:'start'})))},cancel(){}}),{headers:{'Content-Type':'text/event-stream'}})})
})
test('default permission refuses actual write; failed tool is persisted',async()=>{
 let calls=0
 await withCore(async(app,url,root)=>{
  await post(url+'/api/sessions/test/send',input());const session=await waitSession(app,'test',s=>!!s?.permissionRequest);await post(url+'/api/sessions/test/permissions/'+session.permissionRequest!.id,{allow:false});await settle(app)
  expect(existsSync(join(root,'denied.txt'))).toBe(false)
  const events=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'")
  expect(events).toHaveLength(1);expect(JSON.parse(events[0].data).isError).toBe(true)
 },()=>++calls===1?new Response(packet({role:'assistant',tool_calls:[{index:0,id:'call1',type:'function',function:{name:'write',arguments:JSON.stringify({path:'denied.txt',content:'no'})}}]})+packet({},'tool_calls')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}}):textResponse('denied'))
})
test('provider secret encrypted at rest and absent in API responses',async()=>{
 await withCore(async(app,url,root)=>{
  const result=await post(url+'/api/providers',{id:'secret',name:'Secret',baseUrl:'http://127.0.0.1:9999',models:['test'],apiKey:'test-secret-value'})
  expect(result.status).toBe(200);expect(await result.text()).not.toContain('test-secret-value')
  expect(app.core.key('secret')).toBe('test-secret-value')
  expect(JSON.stringify(app.core.providers())).not.toContain('test-secret-value')
  expect(readFileSync(join(root,'db.sqlite-wal')).includes(Buffer.from('test-secret-value'))).toBe(false)
 })
})

test('second turn receives persisted first reply, switches model, retry replaces last visible reply',async()=>{
 const requests:Record<string,unknown>[]=[]
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/test/send',input('first'));await settle(app)
  const provider=app.core.providers().find(p=>p.id==='test')!
  app.core.saveProvider({id:provider.id,name:provider.name,baseUrl:provider.baseUrl,models:['test','next']})
  const next=input('second');next.context.model='["test","next"]';next.context.workspace='does-not-exist';next.context.agent='Other'
  expect((await post(url+'/api/sessions/test/send',next)).status).toBe(202);await settle(app)
  expect(requests[1].model).toBe('next')
  expect(JSON.stringify(requests[1])).toContain('first');expect(JSON.stringify(requests[1])).toContain('ok')
  const session=app.core.storage.session<Session>('test')!
  expect(session.context.model).toBe('["test","next"]');expect(session.context.agent).toBe('Ailya')
  const last=session.messages.at(-1)!
  await post(url+'/api/sessions/test/send',{...input('second'),retryMessageId:last.id});await settle(app)
  const after=app.core.storage.session<Session>('test')!
  expect(after.messages).toHaveLength(4);expect(after.messages.at(-1)!.id).toBe(last.id)
  expect(app.core.storage.get<{n:number}>('SELECT count(*) n FROM tasks')!.n).toBe(3)
 },async req=>{requests.push(await req.json());return textResponse()})
})

