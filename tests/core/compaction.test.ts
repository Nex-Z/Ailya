import {test,expect} from 'bun:test'
import {withCore,post,input,settle,sse,call,waitSession} from './helpers'
import {hash,estimate,SUMMARY_PROMPT} from '../../core/compaction'
import {modelRuntime} from '../../core/model-runtime'
import type {AgentMessage} from '@earendil-works/pi-agent-core'
import type {Session} from '../../core/contracts'
import {Core} from '../../core/core'
import {join} from 'node:path'
import {Database} from 'bun:sqlite'
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {Storage} from '../../core/storage'
const summary={goal:'Continue project',constraints:['m1: only use current workspace'],decisions:['m3: user corrected color to blue'],completed:[],pending:[],uncertainties:[]}
const summaryResponse=()=>sse({content:JSON.stringify(summary)})
const isSummary=(body:any)=>JSON.stringify(body.messages[0]).includes(SUMMARY_PROMPT)
async function turns(app:any,base:string,id='s'){
 for(let n=0;n<4;n++){expect((await post(base+`/api/sessions/${id}/send`,input((n===0?'Remember project constraints. ':n===1?'Correction: color is blue. ':'Continue. ')+'source detail '.repeat(180)))).status).toBe(202);await settle(app)}
}
test('manual compaction preserves raw transcript and uses versioned summary only in subsequent model requests',async()=>{
 let last:any,summaryCalls=0
 await withCore(async(app,base)=>{
  await turns(app,base)
  const before=app.core.compaction.history('s'),session=app.core.storage.session<Session>('s')!
  expect((await post(base+'/api/sessions/s/compact',{})).status).toBe(202)
  await app.core.compaction.jobs.get('s')?.done
  expect(app.core.storage.session<Session>('s')!.compaction?.status).toBe('completed')
  expect(app.core.compaction.history('s')).toEqual(before)
  expect(app.core.storage.session<Session>('s')!.messages).toEqual(session.messages)
  expect(app.core.storage.all('SELECT * FROM context_requests')).toHaveLength(1)
  expect(summaryCalls).toBe(1)
  await post(base+'/api/sessions/s/send',input('What color now?'));await settle(app)
  expect(JSON.stringify(last)).toContain('Historical summary')
  expect(JSON.stringify(last)).toContain('color to blue')
  expect(JSON.stringify(last)).not.toContain('Remember project constraints. source detail')
  const audit=JSON.parse(app.core.storage.get<{data:string}>('SELECT data FROM requests ORDER BY rowid DESC LIMIT 1')!.data)
  expect(audit.contextSummaryId).toBeTruthy()
  const profile=modelRuntime(app.core.providers().find(p=>p.id==='test')!,'test')
  const p={model:profile.model,maxTokens:profile.options.maxTokens!}
  expect(app.core.compaction.valid('s',app.core.compaction.history('s'),p)).toBeTruthy()
  expect(app.core.compaction.valid('s',app.core.compaction.history('s'),{...p,model:{...p.model,contextWindow:8000}})).toBeUndefined()
  const altered=structuredClone(before);const user=altered.find(m=>m.role==='user')!;if(user.role==='user')user.content='changed'
  expect(app.core.compaction.valid('s',altered,p)).toBeUndefined()
 },async req=>{last=await req.json();if(isSummary(last)){summaryCalls++;return summaryResponse()}return sse({content:'Acknowledged'})})
})
test('background source prefix accepts appended turns and rejects edited history; failed auto attempt is bounded',async()=>{
 let release:()=>void=()=>{},started:()=>void=()=>{}
 let gate=Promise.resolve();let calls=0
 await withCore(async(app,base)=>{
  await turns(app,base)
  const provider=app.core.providers().find(p=>p.id==='test')!,runtime=modelRuntime(provider,'test'),p={model:runtime.model,maxTokens:runtime.options.maxTokens!}
  let entered=new Promise<void>(r=>started=r);gate=new Promise<void>(r=>release=r)
  const job=app.core.compaction.start('s',app.core.compaction.history('s'),p,'auto');await entered
  await post(base+'/api/sessions/s/send',input('Appended during compression'));await settle(app)
  release();await job
  expect(app.core.storage.session<Session>('s')!.compaction?.status).toBe('completed')
  entered=new Promise<void>(r=>started=r);gate=new Promise<void>(r=>release=r)
  const changedJob=app.core.compaction.start('s',app.core.compaction.history('s'),p,'auto');await entered
  const history=app.core.compaction.history('s');history.splice(1,1)
  app.core.storage.db.run('UPDATE transcripts SET data=? WHERE session_id=?',[JSON.stringify(history),'s'])
  release();await changedJob
  expect(app.core.storage.session<Session>('s')!.compaction?.status).toBe('failed')
  expect(app.core.storage.all('SELECT * FROM context_summaries')).toHaveLength(1)
  expect(calls).toBe(2)
 },async req=>{if(isSummary(await req.json())){calls++;started();await gate;return summaryResponse()}return sse({content:'OK'})})
})
test('manual cancellation and deletion discard late summary; no task, question or permission mutation',async()=>{
 let release:()=>void=()=>{},started:()=>void=()=>{};let gate=Promise.resolve()
 await withCore(async(app,base)=>{
  await turns(app,base)
  const tasks=app.core.storage.all('SELECT * FROM tasks'),permissions=app.core.storage.all('SELECT * FROM permission_requests')
  let entered=new Promise<void>(r=>started=r);gate=new Promise<void>(r=>release=r)
  await post(base+'/api/sessions/s/compact',{});await entered
  const done=app.core.compaction.jobs.get('s')!.done
  await post(base+'/api/sessions/s/compact/cancel',{});release();await done
  expect(app.core.storage.session<Session>('s')!.compaction?.status).toBe('cancelled')
  expect(app.core.storage.all('SELECT * FROM tasks')).toEqual(tasks)
  expect(app.core.storage.all('SELECT * FROM permission_requests')).toEqual(permissions)
  entered=new Promise<void>(r=>started=r);gate=new Promise<void>(r=>release=r)
  await post(base+'/api/sessions/s/compact',{});await entered
  const deleting=app.core.compaction.jobs.get('s')!.done
  expect((await fetch(base+'/api/sessions/s',{method:'DELETE',headers:{'Content-Type':'application/json'}})).status).toBe(200)
  release();await deleting
  expect(app.core.storage.session('s')).toBeUndefined();expect(app.core.storage.all('SELECT * FROM context_summaries')).toHaveLength(0)
  expect(app.core.storage.all('SELECT * FROM context_requests')).toHaveLength(0)
  expect(app.core.storage.all('SELECT * FROM context_segments')).toHaveLength(0)
 },async req=>{if(isSummary(await req.json())){started();await gate;return summaryResponse()}return sse({content:'OK'})})
})
test('failed summary does not replace valid data, auto retries are bounded and manual retry works',async()=>{
 let fail=true,calls=0
 await withCore(async(app,base)=>{
  await turns(app,base)
  const runtime=modelRuntime(app.core.providers().find(p=>p.id==='test')!,'test'),p={model:runtime.model,maxTokens:runtime.options.maxTokens!}
  const history=app.core.compaction.history('s')
  await app.core.compaction.start('s',history,p,'auto');await app.core.compaction.start('s',history,p,'auto')
  expect(calls).toBe(1);expect(app.core.storage.all('SELECT * FROM context_summaries')).toHaveLength(0)
  expect(app.core.compaction.history('s')).toEqual(history)
  fail=false;await post(base+'/api/sessions/s/compact',{});await app.core.compaction.jobs.get('s')?.done
  expect(calls).toBe(2);expect(app.core.storage.session<Session>('s')!.compaction?.status).toBe('completed')
 },async req=>{if(isSummary(await req.json())){calls++;return fail?sse({content:'not JSON'}):summaryResponse()}return sse({content:'OK'})})
})
test('automatic preflight and post-turn compaction use real model boundary; oversized current input is rejected before network',async()=>{
 let summaries=0,chatCalls=0
 await withCore(async(app,base)=>{
  app.core.saveProvider({id:'test',name:'Test',baseUrl:app.core.providers().find(p=>p.id==='test')!.baseUrl,models:['test'],modelOptions:{test:{contextWindow:16000,maxTokens:2048}}})
  for(let i=0;i<6;i++){
   await post(base+'/api/sessions/auto/send',input('Turn '+i+' original detail '.repeat(230)));await settle(app)
   await app.core.compaction.jobs.get('auto')?.done
   expect(app.core.storage.session<Session>('auto')!.messages.at(-1)!.error).toBeUndefined()
  }
  expect(summaries).toBeGreaterThan(0)
  const previous=chatCalls
  await post(base+'/api/sessions/huge/send',input('Large user input '.repeat(2500)));await settle(app)
  expect(chatCalls).toBe(previous)
  expect(app.core.storage.session<Session>('huge')!.messages.at(-1)!.error).toContain('安全预算')
 },async req=>{if(isSummary(await req.json())){summaries++;return summaryResponse()}chatCalls++;return sse({content:'OK'})})
})
test('large tool results keep paired metadata and allow paged original retrieval restricted to the same session',async()=>{
 await withCore(async(app,base)=>{
  await turns(app,base)
  const history=app.core.compaction.history('s')
  history.push({role:'toolResult',toolCallId:'big',toolName:'powershell',content:[{type:'text',text:'X'.repeat(20000)+'secret-tail'}],isError:false,timestamp:1})
  app.core.storage.db.run('UPDATE transcripts SET data=? WHERE session_id=?',[JSON.stringify(history),'s'])
  const runtime=modelRuntime(app.core.providers().find(p=>p.id==='test')!,'test'),p={model:runtime.model,maxTokens:runtime.options.maxTokens!}
  const projected=app.core.compaction.project('s',history,p).messages.at(-1)!
  expect(JSON.stringify(projected)).toContain('Large result excerpt');expect(JSON.stringify(projected)).not.toContain('secret-tail')
  const number=history.filter(m=>m.role!=='system').length
  const result=await app.core.compaction.tool('s').execute('r',{message:number,offset:19990,limit:100})
  expect(JSON.stringify(result)).toContain('secret-tail')
  let error='';try{await app.core.compaction.tool('other').execute('r',{message:number})}catch(e){error=String(e)}
  expect(error).toContain('不存在')
 },()=>sse({content:'OK'}))
})
test('cutoff cannot split pending tool pairs; active questions reject manual compaction',async()=>{
 await withCore(async(app,base)=>{
  const history:AgentMessage[]=[{role:'user',content:'old',timestamp:1},{role:'user',content:'recent',timestamp:2},{role:'user',content:'current',timestamp:3}]
  expect(app.core.compaction.cutoff(history)).toBe(1)
  const pending:AgentMessage={role:'assistant',content:[{type:'toolCall',id:'pending',name:'write',arguments:{path:'x'}}],api:'openai-completions',provider:'test',model:'test',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'toolUse',timestamp:1}
  expect(app.core.compaction.cutoff([history[0],pending,...history.slice(1)])).toBe(0)
  expect(estimate(history)).toBeGreaterThan(0);expect(hash(history)).not.toBe(hash(history.slice(1)))
  await post(base+'/api/sessions/q/send',input('ask'))
  await waitSession(app,'q',s=>!!s?.questionRequest)
  const response=await post(base+'/api/sessions/q/compact',{})
  expect(response.status).toBe(400);expect(await response.text()).toContain('提问结束')
  app.core.stop('q');await settle(app)
 },()=>call('ask_questions',{questions:[{id:'q',title:'Choose',kind:'text'}]}))
})
test('summary and source survive backup/restart; interrupted compression recovers without resuming or changing permissions',async()=>{
 await withCore(async(app,base,workspace,root)=>{
  await turns(app,base);await post(base+'/api/sessions/s/compact',{});await app.core.compaction.jobs.get('s')?.done
  const transcript=app.core.compaction.history('s'),summary=app.core.storage.all('SELECT * FROM context_summaries')
  app.core.storage.db.run("INSERT INTO context_jobs VALUES('interrupted','s','manual','running',1,'hash','profile',NULL,1,NULL)")
  const backup=join(root,'restored.sqlite');app.core.storage.backup(backup)
  const restored=new Core(backup,workspace)
  try{
   expect(restored.compaction.history('s')).toEqual(transcript)
   expect(restored.storage.all('SELECT * FROM context_summaries')).toEqual(summary)
   expect(restored.storage.get<{status:string}>("SELECT status FROM context_jobs WHERE id='interrupted'")?.status).toBe('cancelled')
   expect(restored.storage.session<Session>('s')!.compaction?.message).toContain('Core 重启')
   expect(restored.compaction.jobs.size).toBe(0)
   expect(restored.storage.all('SELECT * FROM session_permission_grants')).toEqual(app.core.storage.all('SELECT * FROM session_permission_grants'))
  }finally{await restored.close()}
 },async req=>isSummary(await req.json())?summaryResponse():sse({content:'OK'}))
})
test('v7 upgrade preserves raw history and creates a readable pre-v8 backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-v8-')),path=join(root,'db'),old=new Database(path)
 try{
  old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
  for(let version=1;version<=7;version++){old.exec(readFileSync(new URL(`../../core/migrations/000${version}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[version])}
  old.run('INSERT INTO sessions VALUES(?,?,?)',['s','{"id":"s","messages":[]}',1])
  old.run('INSERT INTO transcripts VALUES(?,?)',['s','[{"role":"user","content":"preserved","timestamp":1}]']);old.close()
  const upgraded=new Storage(path)
  try{
   expect(upgraded.get<{data:string}>('SELECT data FROM transcripts')!.data).toContain('preserved')
   expect(upgraded.all('SELECT * FROM context_summaries')).toEqual([])
   const backup=new Database(join(root,readdirSync(root).find(p=>p.startsWith('db.before-v8-'))!),{readonly:true})
   try{expect(backup.query('SELECT max(version) v FROM schema_migrations').get()).toEqual({v:7});expect(backup.query('SELECT count(*) n FROM transcripts').get()).toEqual({n:1})}finally{backup.close()}
  }finally{upgraded.close()}
 }finally{rmSync(root,{recursive:true,force:true})}
})
test('million-token windows use adaptive chunks and reuse unchanged source segments as history grows',async()=>{
 let calls=0
 await withCore(async(app,base)=>{
  await turns(app,base)
  const history=app.core.compaction.history('s'),first=history.find(m=>m.role==='user')!
  if(first.role==='user')first.content='Long project source. '.repeat(55000)
  app.core.storage.db.run('UPDATE transcripts SET data=? WHERE session_id=?',[JSON.stringify(history),'s'])
  const runtime=modelRuntime(app.core.providers().find(p=>p.id==='test')!,'test')
  const p={model:{...runtime.model,contextWindow:1000000},maxTokens:32768}
  await app.core.compaction.start('s',history,p,'auto')
  expect(app.core.storage.session<Session>('s')!.compaction?.status).toBe('completed')
  expect(calls).toBeGreaterThan(1);expect(calls).toBeLessThanOrEqual(8)
  const firstCalls=calls
  history.push({role:'user',content:'Next task after appended history',timestamp:100})
  app.core.storage.db.run('UPDATE transcripts SET data=? WHERE session_id=?',[JSON.stringify(history),'s'])
  await app.core.compaction.start('s',history,p,'auto')
  expect(app.core.storage.session<Session>('s')!.compaction?.status).toBe('completed')
  expect(calls-firstCalls).toBeLessThan(firstCalls)
  expect(app.core.compaction.history('s')).toEqual(history)
 },async req=>{if(isSummary(await req.json())){calls++;return summaryResponse()}return sse({content:'OK'})})
})
test('input estimation calibrates upward using measured usage without weakening conservative defaults',async()=>{
 await withCore(async(app)=>{
  const runtime=modelRuntime(app.core.providers().find(p=>p.id==='test')!,'test'),p={model:runtime.model,maxTokens:runtime.options.maxTokens!}
  const value='test input',before=app.core.compaction.inputEstimate(p,value)
  app.core.compaction.observe(p,before,{input:before*2,cacheRead:0,cacheWrite:0})
  const after=app.core.compaction.inputEstimate(p,value);expect(after).toBeGreaterThan(before*2)
  app.core.compaction.observe(p,before,{input:1,cacheRead:0,cacheWrite:0})
  expect(app.core.compaction.inputEstimate(p,value)).toBe(after)
 },()=>sse({content:'unused'}))
})
test('context usage API reports actual model capacity, projected history and compression changes',async()=>{
 await withCore(async(app,base)=>{
  const endpoint=(id:string,model='test')=>base+`/api/sessions/${id}/context-usage?model=`+encodeURIComponent(JSON.stringify(['test',model]))
  const empty=await(await fetch(endpoint('draft'))).json()
  expect(empty.used).toBe(0);expect(empty.capacity).toBe(32768);expect(empty.estimated).toBe(true)
  await turns(app,base)
  const before=await(await fetch(endpoint('s'))).json();expect(before.used).toBeGreaterThan(0)
  await post(base+'/api/sessions/s/compact',{});await app.core.compaction.jobs.get('s')?.done
  const after=await(await fetch(endpoint('s'))).json()
  expect(after.used).toBeLessThan(before.used);expect(after.summaryId).toBeTruthy();expect(after.capacity).toBe(before.capacity)
  const provider=app.core.providers().find(p=>p.id==='test')!
  app.core.saveProvider({...provider,hasKey:undefined,models:['test','larger'],modelOptions:{larger:{contextWindow:1000000,maxTokens:4096}}})
  const larger=await(await fetch(endpoint('s','larger'))).json()
  expect(larger.capacity).toBe(1000000);expect(larger.summaryId).toBeNull()
  expect((await fetch(endpoint('s','missing'))).status).toBe(400)
 },async req=>isSummary(await req.json())?summaryResponse():sse({content:'OK'}))
})
