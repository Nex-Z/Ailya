import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import type {Session} from '../../core/contracts'
import type {QuestionRequest} from '../../core/question-contracts'
const schema=z.object({version:z.literal(4),deadlineMs:z.literal(30000),prompt:z.string(),calls:z.array(z.object({request:z.unknown(),response:z.string()})).min(1),files:z.record(z.string(),z.string()),answer:z.string()}).strict()
const mode=process.argv[2]??'replay',candidate=resolve(process.argv[3]??'artifacts/session-candidates/questions-v4.json')
assert(['record','replay'].includes(mode))
if(mode==='record')assert(!existsSync(candidate),'录制候选已存在，请指定新的候选路径；不会覆盖历史录制')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const batch={questions:[{id:'answer',title:'What text should be written?',kind:'text'}]}
const prompt=fixture?.prompt??`Use write to create before.txt containing exactly before-question. Then call ask_questions alone with exactly this JSON: ${JSON.stringify(batch)}. Wait for the answer, then use write to create after.txt containing exactly the answer text. Do not repeat any completed operation. Use no other tools. Finally reply only DONE.`
const root=mkdtempSync(join(tmpdir(),'ailya-question-replay-')),workspace=join(root,'workspace');mkdirSync(workspace)
const calls:z.infer<typeof schema>['calls']=[],captures:Promise<void>[]=[],failures:string[]=[]
let ordinal=0,key='replay-no-key'
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 try{const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string};assert(p);assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com');key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key)}finally{db.close()}
}
const originalFetch=globalThis.fetch
globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
 const url=new URL(input instanceof Request?input.url:String(input))
 if(url.origin!=='https://api.deepseek.com'){assert.equal(url.hostname,'127.0.0.1','undeclared network dependency');return originalFetch(input,init)}
 assert.equal(url.pathname,'/chat/completions')
 const request=JSON.parse(input instanceof Request?await input.clone().text():String(init?.body))
 if(mode==='replay'){
  try{assert.deepEqual(request,fixture!.calls[ordinal]?.request);return new Response(fixture!.calls[ordinal++].response,{headers:{'Content-Type':'text/event-stream'}})}catch(error){failures.push(String(error));return new Response('replay mismatch',{status:400})}
 }
 const response=await originalFetch(input,init);assert(response.ok,`HTTP ${response.status}`)
 const entry={request,response:''};calls.push(entry);captures.push(response.clone().text().then(text=>{entry.response=text}).catch(error=>{failures.push(String(error))}));return response
},originalFetch)
const app=startServer({dataPath:join(root,'db'),workspace,port:0}),base=`http://127.0.0.1:${app.server.port}`
const post=(path:string,body:unknown)=>originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
const waitFor=<T>(read:()=>T|undefined,ms=120000)=>new Promise<T>((resolve,reject)=>{
 const check=()=>{try{const value=read();if(value!==undefined){cleanup();resolve(value)}}catch(error){cleanup();reject(error)}}
 const cleanup=()=>{clearTimeout(timer);app.core.listeners.delete(check)}
 const timer=setTimeout(()=>{cleanup();reject(Error('scenario deadline'))},ms);app.core.listeners.add(check);check()
})
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 const response=await post('/api/sessions/questions/send',{requestId:crypto.randomUUID(),text:prompt,context:{workspace:'Ailya',agent:'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'full'}})
 assert.equal(response.status,202,await response.text())
 const task=app.core.storage.get<{id:string;started_at:number}>('SELECT id,started_at FROM tasks')!
 const q:QuestionRequest=await waitFor(()=>{const s=app.core.storage.session<Session>('questions');if(s?.messages.at(-1)?.error)throw Error(s.messages.at(-1)!.error);return s?.questionRequest})
 assert.deepEqual(q.questions,batch.questions);assert.equal(q.deadlineAt-q.createdAt,30000)
 assert.equal(readFileSync(join(workspace,'before.txt'),'utf8'),'before-question')
 // Advance the scheduler boundary explicitly; no frontend clock or deadline mutation.
 app.core.questions.expire(q.id,q.deadlineAt)
 await Promise.all([...app.core.active.values()].map(r=>r.done))
 assert.equal(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status,'stopped')
 const answers={answer:{selected:[],text:'after-answer'}}
 assert.equal((await post(`/api/sessions/questions/questions/${q.id}/answer`,{answers})).status,200)
 await waitFor(()=>{const t=app.core.storage.get<{status:string}>('SELECT status FROM tasks');return ['completed','failed'].includes(t?.status??'')?t:undefined})
 await Promise.all(captures)
 const reply=app.core.storage.session<Session>('questions')!.messages.at(-1)!
 assert.deepEqual(failures,[]);assert.equal(reply.error,undefined);assert.equal(reply.stopped,false)
 assert.equal(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status,'completed')
 assert.deepEqual(app.core.storage.get('SELECT id,started_at FROM tasks'),task)
 assert.equal(app.core.storage.all('SELECT * FROM tasks').length,1)
 assert.deepEqual(readdirSync(workspace).sort(),['after.txt','before.txt'])
 const files={'before.txt':readFileSync(join(workspace,'before.txt'),'utf8'),'after.txt':readFileSync(join(workspace,'after.txt'),'utf8')}
 assert.deepEqual(files,{'before.txt':'before-question','after.txt':'after-answer'})
 const events=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_start'").map(r=>JSON.parse(r.data))
 assert.deepEqual(events.filter(e=>e.toolName==='write').map(e=>e.args.path),['before.txt','after.txt']);assert.equal(events.filter(e=>e.toolName==='ask_questions').length,1)
 assert.equal((await post(`/api/sessions/questions/questions/${q.id}/answer`,{answers})).status,200)
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.deepEqual(files,fixture.files);assert.equal(reply.text,fixture.answer)}
 else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:4,deadlineMs:30000,prompt,calls,files,answer:reply.text},null,2))}
 const evidence={mode,candidate,requests:fixture?.calls.length??calls.length,deadlineMs:q.deadlineAt-q.createdAt,taskCount:1,files,writeCalls:2,questionCalls:1}
 mkdirSync(resolve('artifacts/questions'),{recursive:true});writeFileSync(resolve(`artifacts/questions/${mode}.json`),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
}finally{await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
