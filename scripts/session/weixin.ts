import {imFixture,until} from '../../tests/core/im-fixture'
import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs'
import {join,resolve,relative} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import type {Session} from '../../core/contracts'
const schema=z.object({version:z.literal(1),calls:z.array(z.object({request:z.unknown(),response:z.string()})),files:z.record(z.string(),z.string())}).strict()
const mode=process.argv[2]??'replay',candidate=resolve(process.argv[3]??'artifacts/session-candidates/weixin-v1.json')
assert(['record','replay'].includes(mode));if(mode==='record')assert(!existsSync(candidate),'Use a new candidate path')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const root=mkdtempSync(join(tmpdir(),'ailya-weixin-replay-')),workspace=join(root,'workspace'),bundle=join(root,'package');mkdirSync(workspace);mkdirSync(bundle)

const calls:z.infer<typeof schema>['calls']=[],captures:Promise<void>[]=[],failures:string[]=[]
let ordinal=0,key='replay-no-key',app:ReturnType<typeof startServer>,im:Awaited<ReturnType<typeof imFixture>>|undefined
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 try{const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string};assert(p);assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com');key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key)}finally{db.close()}
}
const originalFetch=globalThis.fetch,identifiers=new Map<string,string>()
function bindings(){
 for(const row of app?.core.storage.all<{id:string}>('SELECT id FROM tasks ORDER BY rowid')??[])if(!identifiers.has(row.id))identifiers.set(row.id,`<task-${identifiers.size}>`)
 for(const session of app?.core.storage.list<Session>()??[])for(const m of [session,...session.messages])if(!identifiers.has(m.id))identifiers.set(m.id,`<message-${identifiers.size}>`)
 for(const row of app?.core.storage.all<{id:string}>('SELECT id FROM plugins ORDER BY rowid')??[])if(!identifiers.has(row.id))identifiers.set(row.id,`<plugin-${identifiers.size}>`)
 return identifiers
}
const paths=new Map<string,string>()
for(const [i,path] of [...new Set([root,root.toLowerCase(),root.replaceAll('\\','/')])].entries()){let escaped=path;for(let level=0;level<4;level++){paths.set(`<workspace-${i}-${level}>`,escaped);escaped=JSON.stringify(escaped).slice(1,-1)}}
function normalize(value:unknown){let text=JSON.stringify(value);for(const [id,name] of bindings())text=text.replaceAll(id,name);for(const [name,path] of [...paths].sort((a,b)=>b[1].length-a[1].length))text=text.replaceAll(path,name);return JSON.parse(text)}
function restore(text:string){for(const [id,name] of bindings())text=text.replaceAll(name,id);for(const [name,path] of paths)text=text.replaceAll(name,name.endsWith('-0>')?path:JSON.parse('"'+path+'"'));return text}
// Fold each streamed string field before mapping owned paths/IDs: a path may span SSE chunks.
// Model content and tool arguments remain exact; chunk timing is not a replay assertion.
function recordedStream(stream:string){
 const records=stream.split(/\r?\n\r?\n/).filter(Boolean).map(line=>line.startsWith('data: ')&&line!=='data: [DONE]'?JSON.parse(line.slice(6)):line)
 const fields=new Map<string,{object:Record<string,string>;key:string}[]>()
 const add=(id:string,object:Record<string,string>,key:string)=>{if(typeof object[key]==='string'){const list=fields.get(id)??[];list.push({object,key});fields.set(id,list)}}
 for(const record of records)if(typeof record!=='string')for(const choice of record.choices??[]){const delta=choice.delta;if(!delta)continue;for(const key of ['content','reasoning_content'])add(`${choice.index}:${key}`,delta,key);for(const tool of delta.tool_calls??[])if(tool.function)add(`${choice.index}:tool:${tool.index}`,tool.function,'arguments')}
 for(const list of fields.values()){const combined=list.map(x=>x.object[x.key]).join('');for(const x of list)x.object[x.key]='';list.at(-1)!.object[list.at(-1)!.key]=combined}
 return normalize(records.map(record=>typeof record==='string'?record:'data: '+JSON.stringify(record)).join('\n\n')+'\n\n') as string
}
globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
 const url=new URL(input instanceof Request?input.url:String(input))
 if(url.origin!=='https://api.deepseek.com'){assert.equal(url.hostname,'127.0.0.1','undeclared network');return originalFetch(input,init)}
 assert.equal(url.pathname,'/chat/completions')
 const request=normalize(JSON.parse(input instanceof Request?await input.clone().text():String(init?.body)))
  if(fixture){try{assert.deepEqual(request,fixture.calls[ordinal]?.request);return new Response(restore(fixture.calls[ordinal++].response),{headers:{'Content-Type':'text/event-stream'}})}catch(error){failures.push(String(error));return new Response('replay mismatch',{status:400})}}
 const response=await originalFetch(input,init);assert(response.ok,`HTTP ${response.status}`)
 const entry={request,response:''};calls.push(entry);captures.push(response.clone().text().then(text=>{entry.response=recordedStream(text)}).catch(e=>{failures.push(String(e))}));return response
},originalFetch)
app=startServer({dataPath:join(root,'db'),workspace,port:0})
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 im=await imFixture(app)
 await im.bind()
 im.push('receipt-1','请在当前工作空间创建 weixin-receipt.txt，内容严格为 WEIXIN-RECEIPT-42。用文件工具，不使用 Shell，不创建记忆；完成后回复成功。')
 await until(()=>failures.length>0||app.core.storage.list<Session>().some(s=>!!s.permissionRequest),120000)
 assert.deepEqual(failures,[])
 const session=app.core.storage.list<Session>()[0],permission=session.permissionRequest!
 im.push('approval-1','/允许 '+permission.id)
 await until(()=>app.core.active.size===0&&app.core.storage.session<Session>(session.id)?.messages.at(-1)?.executing===false,120000)
 await until(()=>im!.sent.some(x=>x.msg.item_list[0].text_item.text===app.core.storage.session<Session>(session.id)!.messages.at(-1)!.text),15000)
 await im.close()
 const sessionId=session.id

 assert.deepEqual(failures,[])
 const last=app.core.storage.session<Session>(sessionId)!.messages.at(-1)!;assert.equal(last.error,undefined,last.error);assert(!last.stopped)
 if(mode==='record'){mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate+'.trace.json',JSON.stringify({session:app.core.storage.session(sessionId),events:app.core.storage.all("SELECT data FROM events WHERE kind='pi.tool_execution_end'")},null,2))}
 assert.equal(readFileSync(join(workspace,'weixin-receipt.txt'),'utf8'),'WEIXIN-RECEIPT-42')
 const events=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'").map(r=>JSON.parse(r.data))
 for(const name of ['write'])assert(events.some(e=>e.toolName===name&&!e.isError),`Missing successful ${name}`)
 const files:Record<string,string>={};function walk(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else files[relative(workspace,path).replaceAll('\\','/')]=readFileSync(path,'utf8')}}walk(workspace)
 assert.deepEqual(files,{'weixin-receipt.txt':'WEIXIN-RECEIPT-42'})
 await Promise.all(captures);assert.deepEqual(failures,[])
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.deepEqual(files,fixture.files)}else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:1,calls,files},null,2))}
 console.log(JSON.stringify({mode,candidate,requests:fixture?.calls.length??calls.length,wechatAdapter:true,remotePermission:true,realFileWrite:true,files:Object.keys(files)}))
}finally{await im?.close();await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
