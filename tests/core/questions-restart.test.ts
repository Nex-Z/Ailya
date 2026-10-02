import {test,expect} from 'bun:test'
import {startServer} from '../../core/server'
import {Storage} from '../../core/storage'
import {Database} from 'bun:sqlite'
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {input,post,call,sse,waitSession} from './helpers'
import type {Session} from '../../core/contracts'
test('restart preserves questions, deadline, drafts, transcript and backup; answer resumes original task with no repeated write',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-question-restart-')),path=join(root,'db')
 let calls=0
 const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{
  const body=await req.json();calls++
  if(calls===1)return call('write',{path:'once.txt',content:'retained'},'once')
  if(calls===2)return call('ask_questions',{questions:[{id:'q',title:'继续内容',kind:'text'}]},'question')
  expect(JSON.stringify(body.messages)).toContain('恢复后继续');return sse({content:'RESTORED'})
 }})
 let app=startServer({dataPath:path,workspace:root,port:0})
 try{
  app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
  const data=input();data.context.permission='full'
  await post(`http://127.0.0.1:${app.server.port}/api/sessions/restart/send`,data)
  const q=(await waitSession(app,'restart',s=>!!s?.questionRequest)).questionRequest!
  const answers={q:{selected:[],text:'恢复后继续'}}
  app.core.draftQuestion('restart',q.id,answers,0)
  const task=app.core.storage.get<{id:string;started_at:number}>('SELECT id,started_at FROM tasks')!
  app.core.storage.vector({id:'v',scope:'s',model:'m',revision:'1',content:'keep',embedding:[1,0]})
  app.core.storage.backup(join(root,'backup'))
  await app.close()
  app=startServer({dataPath:path,workspace:root,port:0})
  const restored=app.core.storage.session<Session>('restart')!.questionRequest!
  expect(restored.status).toBe('interrupted');expect(restored.deadlineAt).toBe(q.deadlineAt);expect(restored.drafts).toEqual(answers)
  const backup=new Storage(join(root,'backup'))
  try{expect(backup.get<{data:string}>('SELECT data FROM question_batches')!.data).toContain('恢复后继续');expect(backup.search('s','m','1',[1,0])).toHaveLength(1)}finally{backup.close()}
  await app.core.answerQuestion('restart',q.id,answers)
  await waitSession(app,'restart',s=>s?.messages.at(-1)?.text==='RESTORED'&&!s.messages.at(-1)?.executing)
  expect(calls).toBe(3);expect(readFileSync(join(root,'once.txt'),'utf8')).toBe('retained')
  expect(app.core.storage.get<{id:string;started_at:number}>('SELECT id,started_at FROM tasks')).toEqual(task)
  expect(app.core.storage.all("SELECT * FROM events WHERE kind='file_changed'")).toHaveLength(1)
 }finally{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
})
test('v5 to v6 migration preserves history and creates a readable v5 backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-question-migrate-')),path=join(root,'db'),old=new Database(path)
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
 for(let v=1;v<=5;v++){old.exec(readFileSync(new URL(`../../core/migrations/000${v}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[v])}
 old.run('INSERT INTO sessions VALUES(?,?,?)',['history','{"id":"history","text":"preserved"}',1]);old.close()
 const storage=new Storage(path)
 try{
  expect(storage.session<{text:string}>('history')?.text).toBe('preserved')
  expect(storage.get<{v:number}>('SELECT max(version) v FROM schema_migrations')?.v).toBe(11)
  const backup=new Database(join(root,readdirSync(root).find(n=>n.startsWith('db.before-v6-'))!),{readonly:true})
  try{expect(backup.query('SELECT max(version) v FROM schema_migrations').get()).toEqual({v:5});expect(backup.query('SELECT id FROM sessions').get()).toEqual({id:'history'})}finally{backup.close()}
 }finally{storage.close();rmSync(root,{recursive:true,force:true})}
})
test('Group question survives Core restart and continues both original task identities',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-question-group-restart-')),path=join(root,'db');let parent=0,child=0
 const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{
  const body=await req.json()
  if(JSON.stringify(body.messages).includes('WORKER'))return ++child===1?call('ask_questions',{questions:[{id:'q',title:'继续吗',kind:'text'}]},'ask-child'):sse({content:'CHILD_OK'})
  return ++parent===1?call('delegate_agent',{agent:'worker',task:'work'},'delegate'):sse({content:'PARENT_OK'})
 }})
 let app=startServer({dataPath:path,workspace:root,port:0})
 try{
  app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
  app.core.catalog.save('agents',{id:'lead',name:'Lead',model:'默认模型',skills:[],tools:[],prompt:'LEAD'})
  app.core.catalog.save('agents',{id:'worker',name:'Worker',model:'默认模型',skills:[],tools:[],prompt:'WORKER'})
  app.core.catalog.save('groups',{id:'team',name:'Team',coordinator:'lead',members:['worker']})
  const data=input();data.context.agent='Team';app.core.send('group',data)
  const q=(await waitSession(app,'group',s=>!!s?.questionRequest)).questionRequest!
  const tasks=app.core.storage.all<{id:string;started_at:number}>('SELECT id,started_at FROM tasks ORDER BY id')
  await app.close();app=startServer({dataPath:path,workspace:root,port:0})
  expect(app.core.storage.session<Session>('group')?.questionRequest?.id).toBe(q.id)
  await app.core.answerQuestion('group',q.id,{q:{selected:[],text:'继续'}})
  await waitSession(app,'group',s=>s?.messages.at(-1)?.text==='PARENT_OK'&&!s.messages.at(-1)?.executing)
  expect(parent).toBe(2);expect(child).toBe(2)
  expect(app.core.storage.all<{id:string;started_at:number}>('SELECT id,started_at FROM tasks ORDER BY id')).toEqual(tasks)
  expect(app.core.storage.all<{status:string}>('SELECT status FROM tasks').every(t=>t.status==='completed')).toBe(true)
 }finally{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
})
