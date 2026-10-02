import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import {agentSchema} from '../../core/catalog'
import type {Session} from '../../core/contracts'

const teamSchema=z.object({leader:agentSchema,worker:agentSchema}).strict()
const schema=z.object({version:z.literal(3),team:teamSchema.optional(),persona:agentSchema.optional(),thinking:z.enum(['off','low','high','max']).optional(),prompt:z.string(),calls:z.array(z.object({request:z.unknown(),response:z.string()})).min(1),files:z.record(z.string(),z.string()),answer:z.string()}).strict()
const mode=process.argv[2]??'replay'
assert(['record','replay'].includes(mode))
const candidate=resolve(process.argv[3]??'artifacts/session-candidates/phase3-thinking-default-off.json')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const persona=fixture?.persona??(mode==='record'&&process.env.AILYA_REPLAY_AGENT==='1'?{id:'proof-agent',name:'Proof Agent',model:'默认模型',skills:[],tools:['文件','Shell'],prompt:'Execute the requested verification precisely. Report only confirmed results.'}:undefined)
const team=fixture?.team??(mode==='record'&&process.env.AILYA_REPLAY_GROUP==='1'?{
 leader:{id:'proof-leader',name:'Proof Leader',model:'默认模型',skills:[],tools:[],prompt:'Delegate the requested task exactly once to proof-worker. Wait for its result and report only confirmed results.'},
 worker:{id:'proof-worker',name:'Proof Worker',model:'默认模型',skills:[],tools:['文件','Shell'],prompt:'Execute the assigned verification precisely. Use all requested tools. Report only confirmed results.'},
}:undefined)
const thinking=fixture?.thinking??(mode==='record'?z.enum(['off','low','high','max']).optional().parse(process.env.AILYA_REPLAY_THINKING):undefined)
const root=mkdtempSync(join(tmpdir(),'ailya-phase3-tools-')),workspace=join(root,'workspace');mkdirSync(workspace)
const command="[IO.File]::WriteAllText((Join-Path $PWD 'proof.txt'), 'phase3-proof')"
const prompt=fixture?.prompt??`${team?'Delegate this complete task to proof-worker exactly once, then reply only DONE after it completes: ':''}Use powershell exactly once with command ${command}. After it succeeds, call ls for path '.', find with pattern proof.txt, and search_files with query phase3-proof. Use no other tools and then reply only DONE.`

const calls:z.infer<typeof schema>['calls']=[],captures:Promise<void>[]=[],failures:string[]=[]
let ordinal=0,key='replay-no-key'
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string}
 assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com')
 key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key);db.close()
}
const originalFetch=globalThis.fetch
globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
 const url=new URL(input instanceof Request?input.url:String(input))
 if(url.origin!=='https://api.deepseek.com'){assert.equal(url.hostname,'127.0.0.1','undeclared network dependency');return originalFetch(input,init)}
 assert.equal(url.pathname,'/chat/completions')
 const request=JSON.parse(input instanceof Request?await input.clone().text():String(init?.body))
 if(mode==='replay'){
  try{assert.deepEqual(request,fixture!.calls[ordinal]?.request);return new Response(fixture!.calls[ordinal++].response,{headers:{'Content-Type':'text/event-stream'}})}catch(e){failures.push(String(e));return new Response('replay mismatch',{status:400})}
 }
 const response=await originalFetch(input,init);assert(response.ok,`HTTP ${response.status}`)
 const call={request,response:''};calls.push(call)
 captures.push(response.clone().text().then(text=>{call.response=text}).catch(e=>{failures.push('capture failed: '+String(e))}))
 return response
},originalFetch)
const app=startServer({dataPath:join(root,'db.sqlite'),workspace,port:0})
const base=`http://127.0.0.1:${app.server.port}`
const post=(path:string,data:unknown)=>originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
const seen=new Set<string>(),approvals:Promise<void>[]=[]
app.core.listeners.add(()=>{
 const p=app.core.storage.session<Session>('phase3-tools')?.permissionRequest
 if(!p||seen.has(p.id))return;seen.add(p.id)
 approvals.push((async()=>{
  try{
   assert.equal(p.tool,'powershell');assert.equal(p.args.command,command)
   assert.equal((await post('/api/sessions/phase3-tools/permissions/'+p.id,{allow:true})).status,200)
  }catch(e){failures.push(String(e));await post('/api/sessions/phase3-tools/stop',{})}
 })())
})
const timeout=setTimeout(()=>{failures.push('scenario deadline');app.core.stop('phase3-tools')},240000)
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 if(thinking)app.core.selectReasoning('["deepseek","deepseek-v4-pro"]',thinking)
 if(persona)app.core.catalog.save('agents',persona)
 if(team){app.core.catalog.save('agents',team.leader);app.core.catalog.save('agents',team.worker);app.core.catalog.save('groups',{id:'proof-team',name:'Proof Team',coordinator:team.leader.id,members:[team.worker.id]})}
 const sent=await post('/api/sessions/phase3-tools/send',{requestId:crypto.randomUUID(),text:prompt,context:{workspace:'Ailya',agent:team?'Proof Team':persona?.name??'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'default'}})
 assert.equal(sent.status,202,await sent.text())
 await Promise.all([...app.core.active.values()].map(r=>r.done));await Promise.all(approvals);await Promise.all(captures)
 assert.deepEqual(failures,[])
 const reply=app.core.storage.session<Session>('phase3-tools')!.messages.at(-1)!
 assert.equal(reply.error,undefined);assert.equal(reply.stopped,undefined);assert(reply.text.trim())
 const names=readdirSync(workspace);assert.deepEqual(names,['proof.txt'])
 const files={'proof.txt':readFileSync(join(workspace,'proof.txt'),'utf8')};assert.deepEqual(files,{'proof.txt':'phase3-proof'})
 const used=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'").map(r=>JSON.parse(r.data).toolName);for(const name of ['powershell','ls','find','search_files'])assert(used.includes(name),name+' was not executed')
 assert(seen.size>0);assert.equal(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status,'completed')
 if(team){
  const links=app.core.storage.all<{parent_task_id:string;child_task_id:string;child_session_id:string}>('SELECT * FROM group_runs');assert.equal(links.length,1);assert.notEqual(links[0].parent_task_id,links[0].child_task_id)
  assert.equal(app.core.storage.session<Session>(links[0].child_session_id)?.parentSessionId,'phase3-tools')
  assert(app.core.storage.all<{status:string}>('SELECT status FROM tasks').every(t=>t.status==='completed'))
  assert(reply.parts?.some(p=>p.type==='tool-call'&&p.toolName==='delegate_agent'&&p.args.executionStatus==='completed'))
  assert(reply.fileChanges?.some(f=>f.path.endsWith('proof.txt')))
 }
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.deepEqual(files,fixture.files);assert.equal(reply.text,fixture.answer)}
 else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:3,persona,team,thinking,prompt,calls,files,answer:reply.text},null,2))}
 const evidence={mode,workspace,candidate,requests:fixture?.calls.length??calls.length,files:names,durationMs:reply.durationMs,snapshots:app.core.storage.get("SELECT count(*) n FROM events WHERE kind='session'"),usage:app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.message_end'").map(r=>JSON.parse(r.data).message).filter(m=>m.role==='assistant').map(m=>({stopReason:m.stopReason,usage:m.usage}))}
 mkdirSync(resolve('artifacts/phase3-tools'),{recursive:true});writeFileSync(resolve(`artifacts/phase3-tools/${mode}.json`),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
}finally{clearTimeout(timeout);await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
