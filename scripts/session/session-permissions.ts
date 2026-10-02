import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,readdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import type {Session} from '../../core/contracts'
const schema=z.object({version:z.literal(1),prompts:z.array(z.string()).length(2),calls:z.array(z.object({request:z.unknown(),response:z.string()})).min(1),answers:z.array(z.string()).length(2)}).strict()
const mode=process.argv[2]??'replay',candidate=resolve(process.argv[3]??'artifacts/session-candidates/session-permissions-v1.json')
assert(['record','replay'].includes(mode));if(mode==='record')assert(!existsSync(candidate),'Use a new candidate path')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const args={command:"Add-Content -LiteralPath proof.txt -Value 'session-grant-proof'",timeout:10}
const prompts=fixture?.prompts??[
 `这是会话授权验收。请单独调用 powershell 两次，每次参数严格相同：${JSON.stringify(args)}。每次都要真实执行，不要合并命令。这是用户明确要求的两次独立追加，用于验证授权，不是重试。不要使用其他工具。完成后简短确认。`,
 `请再调用 powershell 一次，参数严格为 ${JSON.stringify(args)}。这是第三次有意追加，完成后简短确认。`
]
let key='replay-no-key'
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 try{const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string};assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com');key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key)}finally{db.close()}
}
const root=mkdtempSync(join(tmpdir(),'ailya-grant-replay-')),workspace=join(root,'workspace');mkdirSync(workspace)
const originalFetch=globalThis.fetch,calls:z.infer<typeof schema>['calls']=[],captures:Promise<void>[]=[],failures:string[]=[];let ordinal=0,approvals=0
globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
 const url=new URL(input instanceof Request?input.url:String(input))
 if(url.origin!=='https://api.deepseek.com'){assert.equal(url.hostname,'127.0.0.1','undeclared network');return originalFetch(input,init)}
 assert.equal(url.pathname,'/chat/completions')
 const request=JSON.parse(input instanceof Request?await input.clone().text():String(init?.body))
 if(fixture){try{assert.deepEqual(request,fixture.calls[ordinal]?.request);return new Response(fixture.calls[ordinal++].response,{headers:{'Content-Type':'text/event-stream'}})}catch(e){failures.push(String(e));return new Response('request mismatch',{status:400})}}
 const response=await originalFetch(input,init);assert(response.ok,`HTTP ${response.status}`)
 const entry={request,response:''};calls.push(entry);captures.push(response.clone().text().then(text=>{entry.response=text}).catch(e=>{failures.push(String(e))}));return response
},originalFetch)
const app=startServer({dataPath:join(root,'db'),workspace,port:0}),base=`http://127.0.0.1:${app.server.port}`,sessionId='grant-test'
const post=(path:string,body:unknown)=>originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
const seen=new Set<string>(),decisions:Promise<void>[]=[],answers:string[]=[]
app.core.listeners.add(()=>{
 const p=app.core.storage.session<Session>(sessionId)?.permissionRequest;if(!p||seen.has(p.id))return;seen.add(p.id)
 decisions.push((async()=>{try{
  // Only the exact, declared synthetic command in this isolated workspace is approved.
  assert.equal(++approvals,1,'Repeated command asked for permission again');assert.equal(p.tool,'powershell');assert.deepEqual(p.args,args)
  assert.equal((await post(`/api/sessions/${sessionId}/permissions/${p.id}`,{allow:true,scope:'session'})).status,200)
 }catch(e){failures.push(String(e));app.core.stop(sessionId)}})())
})
const timer=setTimeout(()=>{failures.push('scenario deadline');app.core.stop(sessionId)},120000)
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 for(const text of prompts){
  assert.equal((await post(`/api/sessions/${sessionId}/send`,{requestId:crypto.randomUUID(),text,context:{workspace:'Ailya',agent:'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'default'}})).status,202)
  await Promise.all([...app.core.active.values()].map(r=>r.done));await Promise.all(decisions);assert.deepEqual(failures,[])
  const reply=app.core.storage.session<Session>(sessionId)!.messages.at(-1)!;assert(!reply.error&&!reply.stopped);answers.push(reply.text)
 }
 await Promise.all(captures);assert.deepEqual(failures,[]);assert.equal(approvals,1)
 assert.deepEqual(readdirSync(workspace),['proof.txt'])
 assert.deepEqual(readFileSync(join(workspace,'proof.txt'),'utf8').trim().split(/\r?\n/),Array(3).fill('session-grant-proof'))
 assert.deepEqual(app.core.storage.all('SELECT state,scope FROM permission_requests ORDER BY created_at'),[{state:'allowed',scope:'session'},{state:'automatic',scope:'session'},{state:'automatic',scope:'session'}])
 const events=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'").map(r=>JSON.parse(r.data));assert.equal(events.length,3);assert(events.every(e=>e.toolName==='powershell'&&!e.isError))
 assert.equal(app.core.storage.all('SELECT * FROM tasks').length,2);assert.equal(app.core.storage.all('SELECT * FROM session_permission_grants').length,1)
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.deepEqual(answers,fixture.answers)}
 else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:1,prompts,calls,answers},null,2))}
 console.log(JSON.stringify({mode,candidate,requests:fixture?.calls.length??calls.length,approvals,executions:events.length,tasks:2,files:['proof.txt']}))
}finally{clearTimeout(timer);await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
