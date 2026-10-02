import {z} from 'zod'
import type {Storage} from './storage'
import {encryptSecret,decryptSecret} from './secrets'
import {memoryConfig,hasCredential,type MemoryConfig,type MemoryRow} from './memory-contracts'
type Config=Omit<MemoryConfig,'embedding'|'learningEnabled'>&{embedding:{enabled:boolean;baseUrl:string;model:string;revision:string;hasKey:boolean}}
type Job={memory_id:string;version:number;revision:string}
const defaults:Config={useEnabled:true,embedding:{enabled:false,baseUrl:'',model:'',revision:'none',hasKey:false}}
export class MemoryIndex {
 private controller=new AbortController()
 private pending?:Promise<void>
 private closed=false
 constructor(private storage:Storage,private changed:()=>void,start=true){storage.db.run("UPDATE memory_index_jobs SET status='pending' WHERE status='running'");if(start)this.start()}
 config():Config{const row=this.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='memory-config'");const saved=row?JSON.parse(row.value):defaults;return {useEnabled:saved.useEnabled,embedding:saved.embedding}}
 save(raw:unknown){
  const input=memoryConfig.parse(raw),previous=this.config(),e=input.embedding
  if(e.enabled){const url=new URL(e.baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!e.model.trim())throw Error('Embedding 地址或模型不正确')}
  const reindex=e.enabled!==previous.embedding.enabled||e.baseUrl!==previous.embedding.baseUrl||e.model!==previous.embedding.model||e.apiKey!==undefined
  this.controller.abort();this.controller=new AbortController()
  const secret=this.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='memory-key'")?.value
  const key=e.apiKey===undefined?(e.baseUrl.trim().replace(/\/$/,'')===previous.embedding.baseUrl?secret:''):e.apiKey?encryptSecret(e.apiKey):''
  const next:Config={useEnabled:input.useEnabled,embedding:{enabled:e.enabled,baseUrl:e.baseUrl.trim().replace(/\/$/,''),model:e.model.trim(),revision:reindex?crypto.randomUUID():previous.embedding.revision,hasKey:!!key}}
  this.storage.db.transaction(()=>{
   this.storage.db.run("INSERT INTO core_settings VALUES('memory-config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify(next)])
   this.storage.db.run("INSERT INTO core_settings VALUES('memory-key',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[key??''])
   if(reindex){this.storage.db.run("DELETE FROM vector_sources WHERE id LIKE 'memory:%'");this.storage.db.run('DELETE FROM memory_index_jobs');for(const m of this.storage.all<MemoryRow>("SELECT * FROM memories WHERE status='active'"))this.enqueue(m,false)}
  })()
  this.changed();this.start();return next
 }
 status(){return {config:this.config(),counts:this.storage.all<{status:string;n:number}>('SELECT status,count(*) n FROM memory_index_jobs GROUP BY status'),errors:this.storage.all<{memory_id:string;error:string}>("SELECT memory_id,error FROM memory_index_jobs WHERE status='failed' LIMIT 5"),mode:this.config().embedding.enabled?'semantic-with-keyword-fallback':'keyword'}}
 remove(id:string){this.storage.db.run('DELETE FROM vector_sources WHERE id=?',['memory:'+id]);this.storage.db.run('DELETE FROM memory_index_jobs WHERE memory_id=?',[id])}
 enqueue(m:MemoryRow,start=true){
  if(!this.config().embedding.enabled||m.status!=='active'||m.expires_at!==null&&m.expires_at<=Date.now())return
  this.storage.db.run("INSERT OR REPLACE INTO memory_index_jobs VALUES(?,?,?,'pending',NULL,?)",[m.id,m.version,this.config().embedding.revision,Date.now()]);if(start)this.start()
 }
 rebuild(){const c=this.config();this.save({useEnabled:c.useEnabled,embedding:{enabled:c.embedding.enabled,baseUrl:c.embedding.baseUrl,model:c.embedding.model}});this.controller.abort();this.controller=new AbortController();this.storage.db.run("DELETE FROM vector_sources WHERE id LIKE 'memory:%'");for(const m of this.storage.all<MemoryRow>("SELECT * FROM memories WHERE status='active'"))this.enqueue(m,false);this.start();return this.status()}
 private start(){if(this.closed||this.pending||!this.config().embedding.enabled)return;this.pending=Promise.resolve().then(()=>this.drain()).finally(()=>{this.pending=undefined;if(!this.closed&&this.storage.get("SELECT 1 FROM memory_index_jobs WHERE status='pending'")&&this.config().embedding.enabled)this.start()})}
 async idle(){while(this.pending)await this.pending}
 private async embed(text:string,signal:AbortSignal){
  if(hasCredential(text))throw Error('凭据不能发送给 embedding 服务')
  const config=this.config().embedding;if(!config.enabled)throw Error('语义检索未启用')
  const encrypted=this.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='memory-key'")?.value
  const key=encrypted?decryptSecret(encrypted):undefined
  const response=await fetch(config.baseUrl.replace(/\/$/,'')+'/embeddings',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify({model:config.model,input:text}),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])})
  if(!response.ok)throw Error(`Embedding 请求失败（HTTP ${response.status}）`)
  const reader=response.body?.getReader();if(!reader)throw Error('Embedding 返回空响应')
  let size=0;const chunks:Uint8Array[]=[]
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024*1024)throw Error('Embedding 响应过大');chunks.push(part.value)}}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const body=z.object({data:z.array(z.object({embedding:z.array(z.number().finite()).min(1).max(8192)})).length(1)}).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  return body.data[0].embedding
 }
 private async drain(){
  while(!this.closed&&this.config().embedding.enabled){
   const job=this.storage.get<Job>("SELECT * FROM memory_index_jobs WHERE status='pending' ORDER BY updated_at LIMIT 1");if(!job)return
   const m=this.storage.get<MemoryRow>('SELECT * FROM memories WHERE id=?',job.memory_id),config=this.config().embedding,signal=this.controller.signal
   if(!m||m.version!==job.version||m.status!=='active'||config.revision!==job.revision||m.expires_at!==null&&m.expires_at<=Date.now()){this.remove(job.memory_id);continue}
   this.storage.db.run("UPDATE memory_index_jobs SET status='running' WHERE memory_id=?",[m.id])
   try{
    const embedding=await this.embed(m.content,signal);signal.throwIfAborted()
    const latest=this.storage.get<MemoryRow>('SELECT * FROM memories WHERE id=?',m.id)
    if(!latest||latest.version!==m.version||latest.content_hash!==m.content_hash||latest.status!=='active'||this.config().embedding.revision!==config.revision)continue
    if(latest.expires_at!==null&&latest.expires_at<=Date.now()){this.remove(m.id);continue}
    const wrong=this.storage.get("SELECT 1 FROM vector_sources WHERE id LIKE 'memory:%' AND model=? AND revision=? AND dimensions<>?",config.model,config.revision,embedding.length)
    if(wrong)throw Error('Embedding 维度变化，请重建索引')
    this.storage.db.transaction(()=>{this.storage.vector({id:'memory:'+m.id,scope:m.scope+':'+m.scope_id,model:config.model,revision:config.revision,content:m.content,embedding});this.storage.db.run("UPDATE memory_index_jobs SET status='ready',error=NULL,updated_at=? WHERE memory_id=? AND version=? AND revision=?",[Date.now(),m.id,m.version,config.revision])})()
   }catch(error){
    // Never recreate a deleted job or overwrite a newer version after a late response.
    this.storage.db.run('UPDATE memory_index_jobs SET status=?,error=?,updated_at=? WHERE memory_id=? AND version=? AND revision=?',[signal.aborted?'pending':'failed',signal.aborted?null:error instanceof Error?error.message:'索引失败',Date.now(),m.id,m.version,config.revision])
    if(signal.aborted)return
   }
  }
 }
 async search(query:string,eligible:MemoryRow[],signal?:AbortSignal){
  const config=this.config().embedding,result=new Map<string,number>()
  if(!config.enabled||!eligible.length||hasCredential(query))return result
  try{
   const embedding=await this.embed(query.slice(0,4000),AbortSignal.any([this.controller.signal,...(signal?[signal]:[])]))
   if(!this.config().useEnabled||this.config().embedding.revision!==config.revision)return result
   // Restrict the candidate set before distance ordering; include current content/version hashes.
   const ids=eligible.map(m=>m.id)
   const rows=this.storage.db.query(`SELECT m.id,vec_distance_L2(v.embedding,?) distance FROM vector_sources v JOIN memories m ON v.id='memory:'||m.id WHERE m.id IN (SELECT value FROM json_each(?)) AND m.status='active' AND (m.expires_at IS NULL OR m.expires_at>?) AND v.content=m.content AND v.model=? AND v.revision=? AND v.dimensions=? ORDER BY distance LIMIT 8`).all(new Uint8Array(new Float32Array(embedding).buffer),JSON.stringify(ids),Date.now(),config.model,config.revision,embedding.length) as {id:string;distance:number}[]
   for(const row of rows)result.set(row.id,row.distance)
  }catch{signal?.throwIfAborted() /* Explicit fallback is displayed in settings. */}
  return result
 }
 async close(){this.closed=true;this.controller.abort();await this.pending}
}
