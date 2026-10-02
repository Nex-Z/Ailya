import {startServer} from '../../core/server'
import {decryptSecret} from '../../core/secrets'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {z} from 'zod'
import type {Session} from '../../core/contracts'

const schema=z.object({version:z.literal(1),prompt:z.string(),calls:z.array(z.object({request:z.unknown(),response:z.string()})).min(1),files:z.record(z.string(),z.string()),answer:z.string()}).strict()
const mode=process.argv[2]??'replay'
assert(['record','replay'].includes(mode))
const candidate=resolve(process.argv[3]??'artifacts/session-candidates/pelican.json')
const fixture=mode==='replay'?schema.parse(JSON.parse(readFileSync(candidate,'utf8'))):undefined
const root=mkdtempSync(join(tmpdir(),'ailya-pelican-')),workspace=join(root,'workspace');mkdirSync(workspace)
const prompt=fixture?.prompt??'帮我做一个鹈鹕骑车的html'
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
 if(url.origin!=='https://api.deepseek.com')return originalFetch(input,init)
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
 const p=app.core.storage.session<Session>('pelican')?.permissionRequest
 if(!p||seen.has(p.id))return;seen.add(p.id)
 approvals.push((async()=>{
  try{
   assert(['write','edit'].includes(p.tool))
   const path=String(p.args.path);assert(/^[\w-]+\.html$/.test(path),'Only isolated HTML files may be changed')
   if(p.tool==='write')assert(!existsSync(join(workspace,path)),'Do not overwrite an existing file in this scenario')
   assert.equal((await post('/api/sessions/pelican/permissions/'+p.id,{allow:true})).status,200)
  }catch(e){failures.push(String(e));await post('/api/sessions/pelican/stop',{})}
 })())
})
const timeout=setTimeout(()=>{failures.push('scenario deadline');app.core.stop('pelican')},240000)
try{
 app.core.saveProvider({id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-v4-pro'],apiKey:key})
 const sent=await post('/api/sessions/pelican/send',{requestId:crypto.randomUUID(),text:prompt,context:{workspace:'Ailya',agent:'Ailya',model:'["deepseek","deepseek-v4-pro"]',permission:'default'}})
 assert.equal(sent.status,202,await sent.text())
 await Promise.all([...app.core.active.values()].map(r=>r.done));await Promise.all(approvals);await Promise.all(captures)
 assert.deepEqual(failures,[])
 const reply=app.core.storage.session<Session>('pelican')!.messages.at(-1)!
 assert.equal(reply.error,undefined);assert.equal(reply.stopped,undefined);assert(reply.text.trim())
 const names=readdirSync(workspace);assert(names.length>0);assert(names.every(n=>/^[\w-]+\.html$/.test(n)))
 const files=Object.fromEntries(names.map(n=>[n,readFileSync(join(workspace,n),'utf8')]))
 for(const html of Object.values(files)){assert(/<html[\s>]/i.test(html));assert(/<\/html>/i.test(html));assert(/svg|canvas|<style[\s>]/i.test(html))}
 assert(seen.size>0);assert.equal(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status,'completed')
 if(fixture){assert.equal(ordinal,fixture.calls.length);assert.deepEqual(files,fixture.files);assert.equal(reply.text,fixture.answer)}
 else{mkdirSync(resolve('artifacts/session-candidates'),{recursive:true});writeFileSync(candidate,JSON.stringify({version:1,prompt,calls,files,answer:reply.text},null,2))}
 const evidence={mode,workspace,candidate,requests:fixture?.calls.length??calls.length,files:names,durationMs:reply.durationMs,snapshots:app.core.storage.get("SELECT count(*) n FROM events WHERE kind='session'"),usage:app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.message_end'").map(r=>JSON.parse(r.data).message).filter(m=>m.role==='assistant').map(m=>({stopReason:m.stopReason,usage:m.usage}))}
 mkdirSync(resolve('artifacts/pelican'),{recursive:true});writeFileSync(resolve(`artifacts/pelican/${mode}.json`),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence))
}finally{clearTimeout(timeout);await app.close();globalThis.fetch=originalFetch}
