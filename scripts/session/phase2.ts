import {z} from 'zod'
import {startServer} from '../../core/server'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import type {Session} from '../../core/contracts'
const schema=z.object({scenarioVersion:z.literal(2),model:z.string(),prompt:z.string(),attachment:z.object({id:z.string().uuid(),name:z.string(),mime:z.string(),base64:z.string()}),calls:z.array(z.object({request:z.unknown(),response:z.string()})).min(1),actions:z.array(z.object({tool:z.literal('write'),allow:z.literal(true)})).length(1),workspaceExpected:z.record(z.string(),z.string()),answer:z.string()}).strict()
type Fixture=z.infer<typeof schema>
const defaults={model:'deepseek-flash',prompt:'First use read_attachment to read the attached text file. After receiving its content, use write exactly once to create proof.txt containing exactly that attachment text, including the newline. Do not use read or edit. Then reply only DONE.',attachment:{id:'21aa4f14-5e84-41f3-9784-c0a947dbceaa',name:'source.txt',mime:'text/plain',base64:Buffer.from('phase2-token-42\n').toString('base64')},actions:[{tool:'write',allow:true}] as Fixture['actions'],workspaceExpected:{'proof.txt':'phase2-token-42\n'}}
export async function executePhase2(mode:'record'|'replay',candidate?:unknown){
 const fixture=mode==='replay'?schema.parse(candidate):undefined,plan=fixture??defaults
 if(mode==='record'&&!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY required')
 const root=mkdtempSync(join(tmpdir(),'ailya-replay2-')),workspace=join(root,'workspace');mkdirSync(workspace)
 const calls:Fixture['calls']=[],failures:string[]=[],actionPromises:Promise<void>[]=[];let ordinal=0,actionIndex=0
 const seen=new Set<string>()
 const provider=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
  assert.equal(new URL(req.url).pathname,'/chat/completions');const request=await req.json()
  if(mode==='record'){
   const r=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(60000)})
   if(!r.ok)throw Error('record HTTP '+r.status)
   const response=await r.text();calls.push({request,response});return new Response(response,{headers:{'Content-Type':'text/event-stream'}})
  }
  try{assert.deepEqual(request,fixture!.calls[ordinal]?.request);return new Response(fixture!.calls[ordinal++].response,{headers:{'Content-Type':'text/event-stream'}})}catch(error){failures.push(String(error));return new Response('request mismatch',{status:400})}
 }})
 const app=startServer({dataPath:join(root,'db.sqlite'),workspace,port:0}),base=`http://127.0.0.1:${app.server.port}`
 const socket=new WebSocket(base.replace('http','ws')+'/api/events?after=0')
 const post=(path:string,data:unknown)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
 try{
  await new Promise<void>((resolve,reject)=>{socket.onopen=()=>resolve();socket.onerror=()=>reject(Error('websocket connection failed'))})
  socket.onmessage=event=>{
   const permission=JSON.parse(event.data).session?.permissionRequest
   if(!permission||seen.has(permission.id))return;seen.add(permission.id)
   actionPromises.push((async()=>{
    try{const action=plan.actions[actionIndex++];assert.equal(permission.tool,action?.tool);assert.equal(permission.args.path,'proof.txt');assert.equal(permission.args.content,plan.workspaceExpected['proof.txt']);assert.equal(existsSync(join(workspace,'proof.txt')),false);assert.equal((await post('/api/sessions/replay/permissions/'+permission.id,{allow:action.allow})).status,200)}catch(error){failures.push(String(error));await post('/api/sessions/replay/stop',{})}
   })())
  }
  app.core.saveProvider({id:'replay',name:'Replay',baseUrl:`http://127.0.0.1:${provider.port}`,models:[plan.model]})
  const sent=await post('/api/sessions/replay/send',{requestId:crypto.randomUUID(),text:plan.prompt,attachments:[plan.attachment],context:{workspace:'Ailya',agent:'Ailya',model:JSON.stringify(['replay',plan.model]),permission:'default'}})
  assert.equal(sent.status,202,await sent.text());await Promise.all([...app.core.active.values()].map(r=>r.done));await Promise.all(actionPromises)
  assert.deepEqual(failures,[]);assert.equal(actionIndex,plan.actions.length)
  const session=app.core.storage.session<Session>('replay')!,reply=session.messages.at(-1)!
  assert.equal(reply.error,undefined);assert.equal(reply.stopped,undefined);assert.equal(reply.executing,false);assert.equal(session.permissionRequest,undefined)
  assert.deepEqual(readdirSync(workspace).sort(),Object.keys(plan.workspaceExpected).sort())
  for(const [name,content] of Object.entries(plan.workspaceExpected)){assert(!name.includes('/')&&!name.includes('\\')&&!name.includes('..'));assert.equal(readFileSync(join(workspace,name),'utf8'),content)}
  const state={tasks:app.core.storage.all('SELECT status FROM tasks'),permissions:app.core.storage.all('SELECT tool,state FROM permission_requests'),attachments:app.core.storage.all('SELECT id,name,size,hash FROM attachments')}
  assert.deepEqual(state.tasks,[{status:'completed'}]);assert.deepEqual(state.permissions,[{tool:'write',state:'allowed'}]);assert.equal(state.attachments.length,1)
  assert.equal(reply.fileChanges?.[0].added,1);assert.equal(reply.fileChanges?.[0].deleted,0)
  if(fixture){assert.equal(ordinal,fixture.calls.length);assert.equal(reply.text,fixture.answer)}
  return {fixture:{scenarioVersion:2,...plan,calls:fixture?.calls??calls,answer:reply.text} as Fixture,state}
 }finally{socket.close();await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
}
if(import.meta.main){
 const mode=process.argv[2]??'replay',path=resolve(process.argv[3]??'artifacts/session-candidates/phase2-permission-attachment.json')
 if(!['record','replay','verify'].includes(mode))throw Error('Unknown mode')
 const candidate=mode==='record'?undefined:JSON.parse(readFileSync(path,'utf8'))
 const result=await executePhase2(mode==='record'?'record':'replay',candidate)
 if(mode==='record'){mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(path,JSON.stringify(result.fixture,null,2))}
 if(mode==='verify')for(const [name,change] of [
  ['request',(x:Fixture)=>{x.prompt+=' mismatch'}],['response missing',(x:Fixture)=>{x.calls.pop()}],['unconsumed response',(x:Fixture)=>{x.calls.push(x.calls[0])}],['unauthorized side effect',(x:Fixture)=>{x.workspaceExpected['extra.txt']='no'}],['version',(x:Fixture)=>{(x as {scenarioVersion:number}).scenarioVersion=99}],
 ] as const){const altered=structuredClone(candidate);change(altered);await assert.rejects(()=>executePhase2('replay',altered));console.log('negative control passed:',name)}
 console.log(JSON.stringify({mode,requests:result.fixture.calls.length,state:result.state,candidate:path}))
}
