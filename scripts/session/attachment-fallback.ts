import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,readdirSync} from 'node:fs'
import {join,resolve,relative} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import {pdfFixture} from '../../tests/fixtures/pdf'
import type {Session} from '../../core/contracts'
const schema=z.object({version:z.literal(5),prompt:z.string(),calls:z.array(z.object({request:z.unknown(),response:z.string()})).min(1),approvals:z.array(z.object({tool:z.string(),args:z.unknown()})),files:z.record(z.string(),z.string()),answer:z.string()}).strict()
const mode=process.argv[2]??'replay',candidate=resolve(process.argv[3]??'artifacts/session-candidates/attachment-fallback-v5.json')
assert(['record','replay'].includes(mode));if(mode==='record')assert(!existsSync(candidate),'Use a new candidate path')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const root=mkdtempSync(join(tmpdir(),'ailya-attachment-replay-')),workspace=join(root,'workspace');mkdirSync(workspace)
const id='10000000-0000-4000-8000-000000000001',sessionId='attachment-fallback',pdf=pdfFixture()
const prompt=fixture?.prompt??'请读一下附件 PDF，告诉我里面的项目代号和交付时间。请自行使用已有工具完成，不要让我手工转换。测试环境不要安装依赖或联网下载；只在当前工作空间操作，工具调用使用相对路径。'
const remap=(text:string,from:string,to:string)=>text.replaceAll(JSON.stringify(from).slice(1,-1),JSON.stringify(to).slice(1,-1)).replaceAll(from,to).replaceAll(from.replaceAll('\\','/'),to)
const transform=(value:unknown,from:string,to:string):unknown=>typeof value==='string'?remap(value,from,to):Array.isArray(value)?value.map(v=>transform(v,from,to)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v,from,to)])):value
const normalize=(value:unknown)=>transform(value,workspace,'$WORKSPACE')
// Normalize complete streamed argument/text strings, even when paths span SSE chunks.
function mapStream(raw:string,from:string,to:string){
 const packets=raw.split('\n\n').map(block=>{const line=block.split('\n').find(l=>l.startsWith('data: '));if(!line||line==='data: [DONE]')return {raw:block};return {raw:block,value:JSON.parse(line.slice(6))}})
 const fields=new Map<string,{object:Record<string,unknown>;key:string}[]>()
 const add=(id:string,object:Record<string,unknown>,key:string)=>{if(typeof object[key]==='string')fields.set(id,[...(fields.get(id)??[]),{object,key}])}
 for(const p of packets)for(const choice of p.value?.choices??[]){const delta=choice.delta;if(!delta)continue;add('text-'+choice.index,delta,'content');add('reasoning-'+choice.index,delta,'reasoning_content');for(const tool of delta.tool_calls??[])if(tool.function)add(`args-${choice.index}-${tool.index}`,tool.function,'arguments')}
 for(const list of fields.values()){const before=list.map(f=>f.object[f.key]).join(''),after=remap(before,from,to);if(before!==after)list.forEach((f,i)=>{f.object[f.key]=i===0?after:''})}
 return packets.map(p=>p.value?'data: '+JSON.stringify(p.value):p.raw).join('\n\n')
}
const calls:z.infer<typeof schema>['calls']=[],approvals:z.infer<typeof schema>['approvals']=[],captures:Promise<void>[]=[],failures:string[]=[]
let ordinal=0,key='replay-no-key',approvalIndex=0
if(mode==='record'){
 const db=new Database(join(process.env.LOCALAPPDATA!,'Ailya/data/ailya.sqlite'),{readonly:true})
 try{const p=db.query('SELECT secret,config FROM providers WHERE id=?').get('deepseek') as {secret:string|null;config:string};assert(p);assert.equal(new URL(JSON.parse(p.config).baseUrl).origin,'https://api.deepseek.com');key=p.secret?decryptSecret(p.secret):process.env.DEEPSEEK_API_KEY!;assert(key)}finally{db.close()}
}
const originalFetch=globalThis.fetch
globalThis.fetch=Object.assign(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
 const url=new URL(input instanceof Request?input.url:String(input))
 if(url.origin!=='https://api.deepseek.com'){assert.equal(url.hostname,'127.0.0.1','undeclared network dependency');return originalFetch(input,init)}
 assert.equal(url.pathname,'/chat/completions')
 const request=normalize(JSON.parse(input instanceof Request?await input.clone().text():String(init?.body)))
 if(fixture){try{assert.deepEqual(request,fixture.calls[ordinal]?.request);return new Response(mapStream(fixture.calls[ordinal++].response,'$WORKSPACE',workspace),{headers:{'Content-Type':'text/event-stream'}})}catch(error){failures.push(String(error));return new Response('replay mismatch',{status:400})}}
 const response=await originalFetch(input,init);assert(response.ok,`HTTP ${response.status}`)
 const entry={request,response:''};calls.push(entry);captures.push(response.clone().text().then(text=>{entry.response=mapStream(text,workspace,'$WORKSPACE')}).catch(error=>{failures.push(String(error))}));return response
},originalFetch)
const app=startServer({dataPath:join(root,'db'),workspace,port:0}),base=`http://127.0.0.1:${app.server.port}`
const post=(path:string,body:unknown)=>originalFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
const seen=new Set<string>(),decisions:Promise<void>[]=[]
app.core.listeners.add(()=>{
 const p=app.core.storage.session<Session>(sessionId)?.permissionRequest;if(!p||seen.has(p.id))return;seen.add(p.id)
 const action={tool:p.tool,args:normalize(p.args)};approvals.push(action)
 if(!fixture){console.log(JSON.stringify({permissionUrl:`${base}/api/sessions/${sessionId}/permissions/${p.id}`,tool:p.tool,args:p.args}));return}
 decisions.push((async()=>{try{assert.deepEqual(action,fixture.approvals[approvalIndex++]);assert.equal((await post(`/api/sessions/${sessionId}/permissions/${p.id}`,{allow:true})).status,200)}catch(error){failures.push(String(error));app.core.stop(sessionId)}})())
})
const timer=setTimeout(()=>{failures.push('scenario deadline');app.core.stop(sessionId)},180000)
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 assert.equal((await post(`/api/sessions/${sessionId}/send`,{requestId:crypto.randomUUID(),text:prompt,attachments:[{id,name:'sample.pdf',mime:'application/pdf',base64:pdf.toString('base64')}],context:{workspace:'Ailya',agent:'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'default'}})).status,202)
 await Promise.all([...app.core.active.values()].map(r=>r.done));await Promise.all(decisions);await Promise.all(captures)
 assert.deepEqual(failures,[])
 const reply=app.core.storage.session<Session>(sessionId)!.messages.at(-1)!
 assert.equal(reply.error,undefined);assert(!reply.stopped);assert(reply.text.includes('ORCHID-42'));assert(/Friday|周五|星期五/i.test(reply.text))
 const events=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'").map(r=>JSON.parse(r.data))
 const exported=events.filter(e=>e.toolName==='export_attachment'&&!e.isError);assert.equal(exported.length,1)
 const path=JSON.parse(exported[0].result.content[0].text).path;assert(readFileSync(path).equals(pdf))
 assert(events.some(e=>e.toolName==='powershell'&&!e.isError&&JSON.stringify(e.result).includes('ORCHID-42')))
 assert.equal(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status,'completed')
 const files:Record<string,string>={}
 for(const entry of readdirSync(workspace,{recursive:true,withFileTypes:true}))if(entry.isFile()){const path=join(entry.parentPath,entry.name);files[relative(workspace,path).replaceAll('\\','/')]=readFileSync(path).toString('base64')}
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.equal(approvalIndex,fixture.approvals.length);assert.deepEqual(files,fixture.files);assert.equal(normalize(reply.text),fixture.answer)}
 else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:5,prompt,calls,approvals,files,answer:normalize(reply.text)},null,2))}
 const evidence={mode,candidate,requests:fixture?.calls.length??calls.length,tools:events.map(e=>({name:e.toolName,isError:e.isError})),files:Object.keys(files),answer:normalize(reply.text)}
 mkdirSync(resolve('artifacts/attachment-fallback'),{recursive:true});writeFileSync(resolve(`artifacts/attachment-fallback/${mode}.json`),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
}finally{clearTimeout(timer);await app.close();globalThis.fetch=originalFetch;rmSync(root,{recursive:true,force:true})}
