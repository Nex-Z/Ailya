import {test,expect} from 'bun:test'
import {Database} from 'bun:sqlite'
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Storage} from '../../core/storage'
import {startServer} from '../../core/server'
import {input,post,call,sse,waitSession} from './helpers'
import type {Session} from '../../core/contracts'
const document=(body:string)=>`---\nname: resume-proof\ndescription: A test of task version retention.\n---\n${body}`
test('v9 upgrade retains memory, history and vector data with readable pre-v10 backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-skill-v10-')),path=join(root,'db'),old=new Database(path)
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
 for(let v=1;v<=9;v++){old.exec(readFileSync(new URL(`../../core/migrations/000${v}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[v])}
 old.run('INSERT INTO sessions VALUES(?,?,?)',['history','{"id":"history","title":"keep"}',1])
 old.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',['memory','fact','topic','keep','global','','active','user',1,'hash',null,1,1])
 old.run('INSERT INTO vector_sources VALUES(?,?,?,?,?,?,?,?)',['v','scope','model','rev',2,'old vector','hash',new Uint8Array(new Float32Array([1,0]).buffer)]);old.close()
 const storage=new Storage(path)
 try{
  expect(storage.session<{title:string}>('history')!.title).toBe('keep');expect(storage.get<{content:string}>('SELECT content FROM memories')!.content).toBe('keep');expect(storage.search('scope','model','rev',[1,0])).toHaveLength(1)
  expect(storage.get<{v:number}>('SELECT max(version) v FROM schema_migrations')).toEqual({v:12})
  const backup=new Database(join(root,readdirSync(root).find(n=>n.startsWith('db.before-v10-'))!),{readonly:true})
  try{expect(backup.query('SELECT max(version) v FROM schema_migrations').get()).toEqual({v:9});expect(backup.query('SELECT content FROM memories').get()).toEqual({content:'keep'})}finally{backup.close()}
 }finally{storage.close();rmSync(root,{recursive:true,force:true})}
})
test('question restart and backup preserve task skill version; removal blocks load and deleting session clears snapshots',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-skill-resume-')),path=join(root,'db');let count=0
 const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{
  const body=await req.json();count++
  if(count===1)return call('ask_questions',{questions:[{id:'q',title:'继续吗',kind:'text'}]},'q')
  if(count===2)return call('load_skill',{skill:'resume-proof'},'load')
  expect(JSON.stringify(body.messages)).toContain('PINNED-ORIGINAL');expect(JSON.stringify(body.messages)).not.toContain('NEW-INSTRUCTIONS');return sse({content:'RESTORED'})
 }})
 let app=startServer({dataPath:path,workspace:root,port:0})
 try{
  app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
  const r=app.core.resources.save({id:crypto.randomUUID(),kind:'skill',name:'Resume',enabled:true,instructions:document('PINNED-ORIGINAL')})
  await post(`http://127.0.0.1:${app.server.port}/api/sessions/resume/send`,input('Use resume-proof after asking'))
  const q=(await waitSession(app,'resume',s=>!!s?.questionRequest)).questionRequest!,taskId=app.core.resources.skills.snapshots(app.core.storage.get<{id:string}>('SELECT id FROM tasks')!.id)[0]
  app.core.resources.save({...r,instructions:document('NEW-INSTRUCTIONS')});app.core.storage.backup(join(root,'backup'));await app.close()
  app=startServer({dataPath:path,workspace:root,port:0})
  await app.core.answerQuestion('resume',q.id,{q:{selected:[],text:'继续'}})
  await waitSession(app,'resume',s=>s?.messages.at(-1)?.text==='RESTORED'&&!s.messages.at(-1)?.executing)
  expect(count).toBe(3);expect(app.core.storage.session<Session>('resume')?.questionRequest).toBeUndefined()
  const task=app.core.storage.get<{id:string}>('SELECT id FROM tasks')!.id
  expect(app.core.resources.skills.snapshots(task)[0].hash).toBe(taskId.hash)
  const backup=new Storage(join(root,'backup'));try{expect(new TextDecoder().decode(backup.get<{bytes:Uint8Array}>('SELECT bytes FROM task_skill_files')!.bytes)).toContain('PINNED-ORIGINAL')}finally{backup.close()}
  app.core.resources.remove(r.id);expect(app.core.storage.all('SELECT * FROM skill_files')).toHaveLength(0);expect(app.core.storage.all('SELECT * FROM task_skill_files')).toHaveLength(1)
  expect(()=>app.core.resources.skills.expand(task,'/skill:resume-proof',app.core.resources.skills.snapshots(task))).toThrow('已停用或删除')
  await fetch(`http://127.0.0.1:${app.server.port}/api/sessions/resume`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'})
  expect(app.core.storage.all('SELECT * FROM task_skill_files')).toHaveLength(0)
 }finally{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
})
