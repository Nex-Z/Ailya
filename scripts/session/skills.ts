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
const mode=process.argv[2]??'replay',candidate=resolve(process.argv[3]??'artifacts/session-candidates/skills-v2.json')
assert(['record','replay'].includes(mode));if(mode==='record')assert(!existsSync(candidate),'Use a new candidate path')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const root=mkdtempSync(join(tmpdir(),'ailya-skills-replay-')),workspace=join(root,'workspace'),bundle=join(root,'package');mkdirSync(workspace);mkdirSync(join(bundle,'scripts'),{recursive:true});mkdirSync(join(bundle,'references'))
writeFileSync(join(bundle,'SKILL.md'),'---\nname: proof-writer\ndescription: Generate a proof receipt from bundled reference data using a Node script.\n---\nRead references/value.txt using load_skill, then export this package. Run scripts/write.cjs using Node from the workspace. Do not implement your own writer. Verify proof-receipt.txt. Do not create memories for this test.\n')
writeFileSync(join(bundle,'references/value.txt'),'SKILL-RECEIPT-73')
writeFileSync(join(bundle,'scripts/write.cjs'),"require('node:fs').writeFileSync('proof-receipt.txt',require('node:fs').readFileSync(require('node:path').join(__dirname,'../references/value.txt')))")
const calls:z.infer<typeof schema>['calls']=[],captures:Promise<void>[]=[],failures:string[]=[]
let ordinal=0,key='replay-no-key',app:ReturnType<typeof startServer>
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 try{const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string};assert(p);assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com');key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key)}finally{db.close()}
}
const originalFetch=globalThis.fetch,identifiers=new Map<string,string>()
function bindings(){
 for(const row of app?.core.storage.all<{id:string}>('SELECT id FROM tasks ORDER BY rowid')??[])if(!identifiers.has(row.id))identifiers.set(row.id,`<task-${identifiers.size}>`)
 for(const session of app?.core.storage.list<Session>()??[])for(const m of session.messages)if(!identifiers.has(m.id))identifiers.set(m.id,`<message-${identifiers.size}>`)
 for(const row of app?.core.storage.all<{resource_id:string}>('SELECT resource_id FROM skill_packages ORDER BY rowid')??[])if(!identifiers.has(row.resource_id))identifiers.set(row.resource_id,`<skill-${identifiers.size}>`)
 return identifiers
}
const paths=new Map<string,string>()
for(const [i,path] of [...new Set([workspace,workspace.toLowerCase(),workspace.replaceAll('\\','/')])].entries()){let escaped=path;for(let level=0;level<4;level++){paths.set(`<workspace-${i}-${level}>`,escaped);escaped=JSON.stringify(escaped).slice(1,-1)}}
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
 const skill=app.core.resources.importSkill(bundle,true)
 const response=await originalFetch(`http://127.0.0.1:${app.server.port}/api/sessions/proof/send`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),text:'请使用已安装的 proof-writer 技能，运行它随附的脚本生成凭条文件，检查文件后简短确认。',context:{workspace:'Ailya',agent:'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'full'}})})
 assert.equal(response.status,202,await response.text());await app.core.active.get('proof')?.done
 assert.deepEqual(failures,[])
 const last=app.core.storage.session<Session>('proof')!.messages.at(-1)!;assert.equal(last.error,undefined,last.error);assert(!last.stopped)
 if(mode==='record'){mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate+'.trace.json',JSON.stringify({session:app.core.storage.session('proof'),events:app.core.storage.all("SELECT data FROM events WHERE kind='pi.tool_execution_end'")},null,2))}
 assert.equal(readFileSync(join(workspace,'proof-receipt.txt'),'utf8'),'SKILL-RECEIPT-73')
 const events=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'").map(r=>JSON.parse(r.data))
 for(const name of ['load_skill','export_skill','powershell'])assert(events.some(e=>e.toolName===name&&!e.isError),`Missing successful ${name}`)
 assert(events.some(e=>e.toolName==='load_skill'&&JSON.stringify(e).includes('references/value.txt')))
 const files:Record<string,string>={};function walk(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else files[relative(workspace,path).replaceAll('\\','/').replace(skill.id,'<skill>')]=readFileSync(path,'utf8')}}walk(workspace)
 const hash=app.core.resources.skills.metadata(skill.id)!.hash,prefix=`.ailya/skills/<skill>/${hash}/`
 assert.deepEqual(files,{'proof-receipt.txt':'SKILL-RECEIPT-73',[prefix+'SKILL.md']:readFileSync(join(bundle,'SKILL.md'),'utf8'),[prefix+'references/value.txt']:'SKILL-RECEIPT-73',[prefix+'scripts/write.cjs']:readFileSync(join(bundle,'scripts/write.cjs'),'utf8')})
 await Promise.all(captures);assert.deepEqual(failures,[])
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.deepEqual(files,fixture.files)}else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:1,calls,files},null,2))}
 console.log(JSON.stringify({mode,candidate,requests:fixture?.calls.length??calls.length,load:true,export:true,realShell:true,files:Object.keys(files)}))
}finally{await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
