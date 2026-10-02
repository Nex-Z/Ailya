import { z } from 'zod'
import { startServer } from '../../core/server'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { strict as assert } from 'node:assert'
import type { Session } from '../../core/contracts'
const schema=z.object({scenarioVersion:z.literal(1),sessionFormatVersion:z.literal(1),prompt:z.string(),model:z.string(),calls:z.array(z.object({request:z.unknown(),response:z.string()})).min(1),workspaceExpected:z.record(z.string(),z.string()),answer:z.string()}).strict()
export type Recording=z.infer<typeof schema>
export const prompt='Use the write tool exactly once to create hello.txt with the exact UTF-8 content "Hello from Ailya!\\n" (a real newline at the end). Then reply only DONE. Do not read files or use other tools.'
export async function execute(mode:'record'|'replay',fixture?:unknown){
 const recording=mode==='replay'?schema.parse(fixture):undefined
 if(mode==='record'&&!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 未配置')
 const root=mkdtempSync(join(tmpdir(),'ailya-replay-')),workspace=join(root,'workspace');mkdirSync(workspace)
 const calls:Recording['calls']=[];let ordinal=0;const failures:string[]=[]
 const provider=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
  if(new URL(req.url).pathname!=='/chat/completions')return new Response('Unexpected route',{status:400})
  const body=await req.json()
  if(mode==='record'){
   const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)})
   if(!response.ok)throw Error(`record HTTP ${response.status}`)
   const text=await response.text();calls.push({request:body,response:text});return new Response(text,{headers:{'Content-Type':'text/event-stream'}})
  }
  try{assert.deepEqual(body,recording!.calls[ordinal]?.request);const call=recording!.calls[ordinal++];return new Response(call.response,{headers:{'Content-Type':'text/event-stream'}})}catch(error){failures.push(String(error));return new Response('Replay request mismatch',{status:400})}
 }})
 const app=startServer({dataPath:join(root,'db.sqlite'),workspace,port:0})
 try{
  app.core.saveProvider({id:'replay',name:'Replay boundary',baseUrl:`http://127.0.0.1:${provider.port}`,models:[recording?.model??'deepseek-chat']})
  const response=await fetch(`http://127.0.0.1:${app.server.port}/api/sessions/replay/send`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),text:recording?.prompt??prompt,context:{workspace:'Ailya',agent:'Ailya',permission:'full',model:JSON.stringify(['replay',recording?.model??'deepseek-chat'])}})})
  assert.equal(response.status,202,await response.text())
  await Promise.all([...app.core.active.values()].map(r=>r.done))
  assert.deepEqual(failures,[])
  const session=app.core.storage.session<Session>('replay')!,reply=session.messages.at(-1)!
  assert.equal(reply.error,undefined);assert.equal(reply.executing,false)
  const expected=recording?.workspaceExpected??{'hello.txt':'Hello from Ailya!\n'}
  assert.deepEqual(readdirSync(workspace).sort(),Object.keys(expected).sort())
  for(const [name,content] of Object.entries(expected)){assert(!name.includes('..')&&!name.includes('/')&&!name.includes('\\'));assert.equal(readFileSync(join(workspace,name),'utf8'),content)}
  const state=app.core.storage.all<{status:string}>('SELECT status FROM tasks')
  assert.deepEqual(state,[{status:'completed'}]);assert.equal(reply.fileChanges?.length,1)
  assert.equal(reply.fileChanges![0].added,1);assert.equal(reply.fileChanges![0].deleted,0)
  if(recording){assert.equal(ordinal,recording.calls.length);assert.equal(reply.text,recording.answer)}
  assert.equal(app.core.storage.get<{n:number}>('SELECT count(*) n FROM requests')!.n,mode==='record'?calls.length:ordinal)
  const events=app.core.storage.all<{seq:number;kind:string;data:string}>('SELECT seq,kind,data FROM events ORDER BY seq')
  assert(events.some(e=>e.kind==='pi.tool_execution_end'))
  return {recording:{scenarioVersion:1,sessionFormatVersion:1,prompt:recording?.prompt??prompt,model:recording?.model??'deepseek-chat',calls:mode==='record'?calls:recording!.calls,workspaceExpected:expected,answer:reply.text} as Recording,state,events:events.map(e=>({...e,data:JSON.parse(e.data)}))}
 }finally{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
}
if(import.meta.main){
 const mode=process.argv[2]??'replay',path=resolve(process.argv[3]??'artifacts/session-candidates/file-write.json')
 if(!['record','replay'].includes(mode))throw Error('仅支持 record / replay；不会自动刷新预期')
 const result=await execute(mode as 'record'|'replay',mode==='replay'?JSON.parse(readFileSync(path,'utf8')):undefined)
 if(mode==='record'){mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(path,JSON.stringify(result.recording,null,2));writeFileSync(path+'.events.json',JSON.stringify(result.events,null,2))}
 console.log(JSON.stringify({mode,requests:result.recording.calls.length,state:result.state,files:result.recording.workspaceExpected,candidate:path}))
}
