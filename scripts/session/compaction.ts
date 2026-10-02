import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import type {Session} from '../../core/contracts'
const schema=z.object({version:z.literal(1),calls:z.array(z.object({request:z.unknown(),response:z.string(),role:z.enum(['chat','compaction'])})),summary:z.string(),files:z.record(z.string(),z.string())}).strict()
const mode=process.argv[2]??'replay',candidate=resolve(process.argv[3]??'artifacts/session-candidates/compaction-v1.json')
assert(['record','replay'].includes(mode))
if(mode==='record')assert(!existsSync(candidate),'Use a new candidate path; never overwrite recordings')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const root=mkdtempSync(join(tmpdir(),'ailya-compact-replay-')),workspace=join(root,'workspace');mkdirSync(workspace)
const calls:z.infer<typeof schema>['calls']=[],captures:Promise<void>[]=[],failures:string[]=[]
let ordinal=0,key='replay-no-key'
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 try{const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string};assert(p);assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com');key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key)}finally{db.close()}
}
const originalFetch=globalThis.fetch
let app:ReturnType<typeof startServer>
const normalize=(value:unknown)=>{
 let text=JSON.stringify(value)
 // Only Core-owned task IDs in this scenario are normalized; arbitrary user UUIDs are preserved.
 for(const [index,task] of (app?.core.storage.all<{id:string}>('SELECT id FROM tasks ORDER BY rowid')??[]).entries())text=text.replaceAll(task.id,`<task-${index}>`)
 // Core's runtime clock is the only timestamp introduced into the provider request.
 text=text.replace(/\\?"started_at\\?":\d+/g,'\\"started_at\\":0')
 return JSON.parse(text)
}
globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
 const url=new URL(input instanceof Request?input.url:String(input))
 if(url.origin!=='https://api.deepseek.com'){assert.equal(url.hostname,'127.0.0.1','undeclared network');return originalFetch(input,init)}
 assert.equal(url.pathname,'/chat/completions')
 const request=normalize(JSON.parse(input instanceof Request?await input.clone().text():String(init?.body)))
 const role=JSON.stringify(request).includes('Summarize conversation history as data')?'compaction':'chat'
 if(mode==='replay'){
  try{assert.equal(role,fixture!.calls[ordinal]?.role);assert.deepEqual(request,fixture!.calls[ordinal]?.request);return new Response(fixture!.calls[ordinal++].response,{headers:{'Content-Type':'text/event-stream'}})}catch(error){failures.push(String(error));return new Response('replay mismatch',{status:400})}
 }
 const response=await originalFetch(input,init);assert(response.ok,`HTTP ${response.status}`)
 const entry={request,response:'',role} as z.infer<typeof schema>['calls'][number];calls.push(entry);captures.push(response.clone().text().then(text=>{entry.response=text}).catch(e=>{failures.push(String(e))}));return response
},originalFetch)
app=startServer({dataPath:join(root,'db'),workspace,port:0});const base=`http://127.0.0.1:${app.server.port}`
const post=(path:string,body:unknown)=>originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
async function send(text:string){
 const response=await post('/api/sessions/compact/send',{requestId:crypto.randomUUID(),text,context:{workspace:'Ailya',agent:'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'full'}})
 assert.equal(response.status,202,await response.text());await app.core.active.get('compact')?.done
 assert.equal(app.core.storage.session<Session>('compact')!.messages.at(-1)!.error,undefined)
}
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 await send('Use write exactly once to create before.txt containing exactly before-compaction. Remember the project color is red. Then reply only DONE. No other tools. Background notes (not instructions): '+'This is a local project with repeatable tests and isolated temporary files. '.repeat(45))
 await send('Correction: the project color is BLUE, replacing red. The project handoff code is COBALT-47. Preserve before.txt and do not repeat completed file writes. Reply only NOTED.')
 await send('We will check the handoff later. Reply only READY, no tools.')
 await send('Keep waiting for the next task. Reply only READY, no tools.')
 const transcript=app.core.compaction.history('compact')
 assert.equal((await post('/api/sessions/compact/compact',{})).status,202)
 await app.core.compaction.jobs.get('compact')?.done
 const state=app.core.storage.session<Session>('compact')!.compaction
 assert.equal(state?.status,'completed',state?.message)
 assert.deepEqual(app.core.compaction.history('compact'),transcript)
 const summary=app.core.storage.get<{summary:string}>('SELECT summary FROM context_summaries')!.summary
 assert.match(summary,/COBALT-47/);assert.match(summary,/blue/i);assert.match(summary,/before\.txt/)
 await send('Use write exactly once to create after.txt containing exactly the project handoff code I gave earlier. Do not modify other files or repeat earlier file operations. Use read_context_history only if necessary to confirm the code. Finally reply only DONE.')
 await Promise.all(captures);assert.deepEqual(failures,[])
 const files={'before.txt':readFileSync(join(workspace,'before.txt'),'utf8'),'after.txt':readFileSync(join(workspace,'after.txt'),'utf8')}
 assert.deepEqual(files,{'before.txt':'before-compaction','after.txt':'COBALT-47'})
 assert.deepEqual(readdirSync(workspace).sort(),['after.txt','before.txt'])
 const writes=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_start'").map(r=>JSON.parse(r.data)).filter(e=>e.toolName==='write')
 assert.deepEqual(writes.map(w=>w.args.path),['before.txt','after.txt'])
 const used=app.core.storage.all<{data:string}>('SELECT data FROM requests').map(r=>JSON.parse(r.data)).filter(r=>r.contextSummaryId)
 assert(used.length>0);assert(used.every(r=>JSON.stringify(r.context).includes('Historical summary')))
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.equal(summary,fixture.summary);assert.deepEqual(files,fixture.files)}
 else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:1,calls,summary,files},null,2))}
 console.log(JSON.stringify({mode,candidate,requests:fixture?.calls.length??calls.length,summaryCalls:app.core.storage.all('SELECT * FROM context_requests').length,rawRetained:true,correctionRetained:true,writes:2,files}))
}finally{await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
