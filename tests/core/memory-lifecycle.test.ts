import {test,expect} from 'bun:test'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Storage} from '../../core/storage'
import {Memories} from '../../core/memory'
import {withCore,sse,input,post,settle} from './helpers'
test('v8 migration preserves summaries and vectors; restart and backup restoration replay deletion ledger',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-memory-v9-')),path=join(root,'db'),workspace=join(root,'workspace');mkdirSync(workspace)
 const old=new Database(path)
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
 for(let v=1;v<=8;v++){old.exec(readFileSync(new URL(`../../core/migrations/000${v}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[v])}
 old.run('INSERT INTO sessions VALUES(?,?,?)',['source',JSON.stringify({id:'source',title:'保留旧会话',context:{workspace},messages:[]}),1])
 old.run('INSERT INTO transcripts VALUES(?,?)',['source','[]']);old.run('INSERT INTO context_summaries VALUES(?,?,?,?,?,?,?,?,?)',['summary','source',1,'hash','profile','old summary',10,2,1]);old.run('INSERT INTO vector_sources VALUES(?,?,?,?,?,?,?,?)',['v','scope','model','rev',2,'old vector','hash',new Uint8Array(new Float32Array([1,0]).buffer)]);old.close()
 let storage=new Storage(path),memories=new Memories(storage,workspace,()=>{})
 try{
  expect(storage.get<{v:number}>('SELECT max(version) v FROM schema_migrations')?.v).toBe(9)
  expect(storage.get<{summary:string}>('SELECT summary FROM context_summaries')?.summary).toBe('old summary');expect(storage.search('scope','model','rev',[1,0])).toHaveLength(1)
  const backupName=readdirSync(root).find(p=>p.includes('before-v9-'))!,pre=new Database(join(root,backupName),{readonly:true});try{expect(pre.query('SELECT max(version) v FROM schema_migrations').get()).toEqual({v:8})}finally{pre.close()}
  const m=memories.save({kind:'preference',topic:'语言',content:'使用中文',workspace})
  storage.backup(join(root,'before-delete'));memories.remove(m.id,m.version);const ledger=memories.deletionLedger()
  await memories.index.close();storage.close();storage=new Storage(path);memories=new Memories(storage,workspace,()=>{})
  expect(memories.list()).toHaveLength(0);expect(memories.deletionLedger()).toEqual(ledger)
  const restored=new Storage(join(root,'before-delete')),restoredMemory=new Memories(restored,workspace,()=>{})
  try{expect(restoredMemory.list()).toHaveLength(1);restoredMemory.applyDeletionLedger(ledger);expect(restoredMemory.list()).toHaveLength(0);expect(restored.search('scope','model','rev',[1,0])).toHaveLength(1)}finally{await restoredMemory.index.close();restored.close()}
 }finally{await memories.index.close();storage.close();rmSync(root,{recursive:true,force:true})}
})
test('memory deletion invalidates used summaries and source-derived memories, retains user-edited records',async()=>{
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/source/send',input('记住：使用中文'));await settle(app)
  const m=app.core.memories.save({kind:'preference',topic:'语言',content:'使用中文'},{sessionId:'source',messageId:'u',text:'记住：使用中文'},'使用中文')
  await post(url+'/api/sessions/used/send',input('hello'));await settle(app)
  app.core.storage.db.run('INSERT INTO context_summaries VALUES(?,?,?,?,?,?,?,?,?)',['summary','used',1,'hash','p','derived old fact',10,2,1])
  const updated=app.core.memories.save({id:m.id,version:m.version,kind:'preference',topic:'语言',content:'中文详细版'})
  expect(app.core.storage.get('SELECT * FROM context_summaries WHERE session_id=?','used')).toBeNull()
  await fetch(url+'/api/sessions/source',{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'})
  expect(app.core.memories.get(updated.id).origin).toBe('user');expect(app.core.memories.list()[0].sources).toHaveLength(0)
 },()=>sse({content:'OK'}))
})
test('embedding failures are visible, configuration rotates indexes, pending jobs recover on restart',async()=>{
 let fail=true,dim=2
 const service=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>fail?new Response('offline',{status:503}):Response.json({data:[{embedding:Array(dim).fill(0.5)}]})})
 const root=mkdtempSync(join(tmpdir(),'ailya-memory-index-')),path=join(root,'db')
 let storage=new Storage(path),memories=new Memories(storage,root,()=>{})
 try{
  const m=memories.save({kind:'preference',topic:'语言',content:'使用中文',workspace:root})
  const cfg={useEnabled:true,learningEnabled:true,embedding:{enabled:true,baseUrl:`http://127.0.0.1:${service.port}`,model:'first'}}
  memories.index.save(cfg);await memories.index.idle();expect(memories.index.status().errors[0].error).toContain('503')
  expect((await memories.retrieve(root,'new','你好')).map(r=>r.id)).toContain(m.id)
  fail=false;memories.index.rebuild();await memories.index.idle();expect(storage.get<{dimensions:number}>('SELECT dimensions FROM vector_sources')?.dimensions).toBe(2)
  dim=3;memories.index.save({...cfg,embedding:{...cfg.embedding,model:'second'}});await memories.index.idle();expect(storage.get<{model:string;dimensions:number}>('SELECT model,dimensions FROM vector_sources')).toEqual({model:'second',dimensions:3})
  storage.db.run("UPDATE memory_index_jobs SET status='running'");await memories.index.close();storage.close()
  storage=new Storage(path);memories=new Memories(storage,root,()=>{});await memories.index.idle();expect(memories.index.status().counts).toEqual([{status:'ready',n:1}])
 }finally{await memories.index.close();storage.close();await service.stop(true);rmSync(root,{recursive:true,force:true})}
})
