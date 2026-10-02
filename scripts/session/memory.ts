import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import type {Session} from '../../core/contracts'
const schema=z.object({version:z.literal(1),calls:z.array(z.object({request:z.unknown(),response:z.string()})),files:z.record(z.string(),z.string())}).strict()
const mode=process.argv[2]??'replay',candidate=resolve(process.argv[3]??'artifacts/session-candidates/memory-v1.json')
assert(['record','replay'].includes(mode));if(mode==='record')assert(!existsSync(candidate),'Use a new candidate path')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const root=mkdtempSync(join(tmpdir(),'ailya-memory-replay-')),workspace=join(root,'workspace');mkdirSync(workspace)
const calls:z.infer<typeof schema>['calls']=[],captures:Promise<void>[]=[],failures:string[]=[]
let ordinal=0,key='replay-no-key',app:ReturnType<typeof startServer>
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 try{const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string};assert(p);assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com');key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key)}finally{db.close()}
}
const originalFetch=globalThis.fetch
const identifiers=new Map<string,string>()
function bindings(){
 for(const row of app?.core.storage.all<{id:string}>('SELECT id FROM tasks ORDER BY rowid')??[])if(!identifiers.has(row.id))identifiers.set(row.id,`<task-${identifiers.size}>`)
 for(const session of app?.core.storage.list<Session>()??[])for(const m of session.messages)if(!identifiers.has(m.id))identifiers.set(m.id,`<message-${identifiers.size}>`)
 for(const row of app?.core.storage.all<{id:string}>('SELECT id FROM memories ORDER BY rowid')??[])if(!identifiers.has(row.id))identifiers.set(row.id,`<memory-${identifiers.size}>`)
 return identifiers
}
function normalize(value:unknown){
 let text=JSON.stringify(value)
 for(const [id,name] of bindings())text=text.replaceAll(id,name)
 for(const path of [workspace,workspace.toLowerCase()]){const escaped=JSON.stringify(path).slice(1,-1);text=text.replaceAll(escaped.replaceAll('\\','\\\\'),'<workspace>').replaceAll(escaped,'<workspace>')}
 // These are Core-generated metadata fields only, not arbitrary numeric user content.
 text=text.replace(/(\\?"(?:created_at|updated_at)\\?":)\d+/g,'$10')
 return JSON.parse(text)
}
function restore(text:string){for(const [id,name] of bindings())text=text.replaceAll(name,id);return text}
globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
 const url=new URL(input instanceof Request?input.url:String(input))
 if(url.origin!=='https://api.deepseek.com'){assert.equal(url.hostname,'127.0.0.1','undeclared network');return originalFetch(input,init)}
 assert.equal(url.pathname,'/chat/completions')
 const request=normalize(JSON.parse(input instanceof Request?await input.clone().text():String(init?.body)))
 if(fixture){try{assert.deepEqual(request,fixture.calls[ordinal]?.request);return new Response(restore(fixture.calls[ordinal++].response),{headers:{'Content-Type':'text/event-stream'}})}catch(error){failures.push(String(error));return new Response('replay mismatch',{status:400})}}
 const response=await originalFetch(input,init);assert(response.ok,`HTTP ${response.status}`)
 const entry={request,response:''};calls.push(entry);captures.push(response.clone().text().then(text=>{entry.response=normalize(text)}).catch(e=>{failures.push(String(e))}));return response
},originalFetch)
app=startServer({dataPath:join(root,'db'),workspace,port:0});const base=`http://127.0.0.1:${app.server.port}`
const post=(path:string,body:unknown)=>originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
async function send(id:string,text:string){const response=await post('/api/sessions/'+id+'/send',{requestId:crypto.randomUUID(),text,context:{workspace:'Ailya',agent:'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'full'}});assert.equal(response.status,202,await response.text());await app.core.active.get(id)?.done;const last=app.core.storage.session<Session>(id)!.messages.at(-1)!;assert.equal(last.error,undefined,last.error);assert(!last.stopped)}
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 await send('remember','请记住：这个项目的交付标记是 LILAC-73。保存为长期记忆，以后新会话也要能找到。')
 const original=app.core.memories.list().find(m=>m.status==='active'&&m.content.includes('LILAC-73'));assert(original,'Actual model must create an active memory')
 await send('recall','把这个项目长期记忆中的交付标记，用 write 写入 memory-proof.txt。文件只含标记，不加换行。不要新增记忆，完成后简短确认。')
 assert.equal(readFileSync(join(workspace,'memory-proof.txt'),'utf8'),'LILAC-73')
 app.core.memories.save({id:original.id,version:original.version,kind:original.kind,topic:original.topic,content:'这个项目的交付标记是 LILAC-84。',workspace})
 await send('corrected','把这个项目长期记忆中的交付标记，用 write 写入 corrected-proof.txt。文件只含标记，不加换行。不要新增记忆，完成后简短确认。')
 assert.equal(readFileSync(join(workspace,'corrected-proof.txt'),'utf8'),'LILAC-84')
 const latest=app.core.memories.get(original.id);app.core.memories.remove(latest.id,latest.version)
 await send('forgotten','这个项目的交付标记是什么？如果长期记忆没有，请只回答“不知道”，不要猜测、读文件或新增记忆。')
 assert.match(app.core.storage.session<Session>('forgotten')!.messages.at(-1)!.text,/不知道/)
 const requestRows=app.core.storage.all<{data:string;session_id:string}>('SELECT requests.data,tasks.session_id FROM requests JOIN tasks ON tasks.id=requests.task_id').map(r=>({session:r.session_id,...JSON.parse(r.data)}))
 assert(requestRows.some(r=>r.session==='recall'&&r.memoryReferences?.length===1));assert(requestRows.some(r=>r.session==='corrected'&&r.memoryReferences?.[0]?.version===2));assert(requestRows.filter(r=>r.session==='forgotten').every(r=>r.memoryReferences?.length===0))
 await Promise.all(captures);assert.deepEqual(failures,[])
 const files={'memory-proof.txt':readFileSync(join(workspace,'memory-proof.txt'),'utf8'),'corrected-proof.txt':readFileSync(join(workspace,'corrected-proof.txt'),'utf8')};assert.deepEqual(readdirSync(workspace).sort(),Object.keys(files).sort())
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.deepEqual(files,fixture.files)}else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:1,calls,files},null,2))}
 console.log(JSON.stringify({mode,candidate,requests:fixture?.calls.length??calls.length,explicitMemory:true,freshSessionRecall:true,userCorrection:true,forget:true,files}))
}finally{await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
