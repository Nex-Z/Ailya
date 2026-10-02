import {test,expect} from 'bun:test'
import {Database} from 'bun:sqlite'
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Permissions} from '../../core/permissions'
import {Storage} from '../../core/storage'
import {withCore,call,sse,input,post,waitSession,settle} from './helpers'

test('session approval executes repeated real shell calls and later tasks, but not changed args or another session',async()=>{
 const command="Add-Content -LiteralPath proof.txt -Value 'approved'",args={command,timeout:10}
 const responses=[()=>call('powershell',args,'first'),()=>call('powershell',args,'second'),()=>sse({content:'done'}),()=>call('powershell',args,'third'),()=>sse({content:'done'}),()=>call('powershell',{...args,timeout:11},'changed'),()=>sse({content:'done'}),()=>call('powershell',args,'other'),()=>sse({content:'done'})];let index=0
 await withCore(async(app,url,workspace)=>{
  await post(url+'/api/sessions/one/send',input())
  const p=(await waitSession(app,'one',s=>!!s?.permissionRequest)).permissionRequest!,endpoint=url+'/api/sessions/one/permissions/'+p.id
  expect((await post(endpoint,{allow:false,scope:'session'})).status).toBe(400)
  expect((await post(endpoint,{allow:true,scope:'global'})).status).toBe(400)
  expect((await post(url+'/api/sessions/other/permissions/'+p.id,{allow:true,scope:'session'})).status).toBe(400)
  expect((await post(endpoint,{allow:true,scope:'session'})).status).toBe(200)
  expect((await post(endpoint,{allow:true,scope:'session'})).status).toBe(200)
  expect((await post(endpoint,{allow:true})).status).toBe(400)
  await settle(app)
  expect(readFileSync(join(workspace,'proof.txt'),'utf8').trim().split(/\r?\n/)).toEqual(['approved','approved'])
  await post(url+'/api/sessions/one/send',input('again'));await settle(app)
  expect(readFileSync(join(workspace,'proof.txt'),'utf8').trim().split(/\r?\n/)).toHaveLength(3)
  expect(app.core.storage.all('SELECT state,scope FROM permission_requests ORDER BY created_at')).toEqual([{state:'allowed',scope:'session'},{state:'automatic',scope:'session'},{state:'automatic',scope:'session'}])
  await post(url+'/api/sessions/one/send',input('different timeout'))
  const changed=(await waitSession(app,'one',s=>!!s?.permissionRequest)).permissionRequest!
  expect((await post(url+'/api/sessions/one/permissions/'+changed.id,{allow:true})).status).toBe(200);await settle(app)
  expect((await post(url+'/api/sessions/one/permissions/'+changed.id,{allow:true,scope:'session'})).status).toBe(400)
  await post(url+'/api/sessions/other/send',input())
  const other=(await waitSession(app,'other',s=>!!s?.permissionRequest)).permissionRequest!
  expect((await post(url+'/api/sessions/other/permissions/'+other.id,{allow:true})).status).toBe(200);await settle(app)
  expect(index).toBe(responses.length)
  expect(app.core.storage.all('SELECT * FROM session_permission_grants')).toHaveLength(1)
  expect(readFileSync(join(workspace,'proof.txt'),'utf8').trim().split(/\r?\n/)).toHaveLength(5)
  expect((await fetch(url+'/api/sessions/one',{method:'DELETE',headers:{'Content-Type':'application/json'}})).status).toBe(200)
  expect(app.core.storage.all('SELECT * FROM session_permission_grants')).toHaveLength(0)
 },()=>responses[index++]?.()??new Response('Unexpected model request',{status:400}))
})

test('stopped request cannot create a session grant or execute a write',async()=>{
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/one/send',input())
  const p=(await waitSession(app,'one',s=>!!s?.permissionRequest)).permissionRequest!
  await post(url+'/api/sessions/one/stop',{});await settle(app)
  expect((await post(url+'/api/sessions/one/permissions/'+p.id,{allow:true,scope:'session'})).status).toBe(400)
  expect(app.core.storage.all('SELECT * FROM session_permission_grants')).toHaveLength(0)
  expect(app.core.storage.all("SELECT * FROM events WHERE kind='file_changed'")).toHaveLength(0)
 },()=>call('write',{path:'stopped.txt',content:'never'}))
})

test('v6 migration preserves data and old once decisions; grants survive restart/backup with exact structured matching',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-session-grant-')),path=join(root,'db'),old=new Database(path)
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
 for(let v=1;v<=6;v++){old.exec(readFileSync(new URL(`../../core/migrations/000${v}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[v])}
 old.run('INSERT INTO sessions VALUES(?,?,?)',['s','{"id":"s","title":"preserved"}',1])
 old.run('INSERT INTO tasks(id,session_id,request_id,status,started_at,data) VALUES(?,?,?,?,?,?)',['task','s','r','completed',1,'{}'])
 old.run('INSERT INTO permission_requests VALUES(?,?,?,?,?,?,?,?,?,?)',['old','s','task','old','write','{}','old','allowed',1,2])
 old.run('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?)',['a','s','m','proof.txt','text/plain',5,'hash',Buffer.from('proof'),1])
 old.run('INSERT INTO vector_sources VALUES(?,?,?,?,?,?,?,?)',['v','scope','model','1',2,'preserved','hash',new Uint8Array(new Float32Array([1,0]).buffer)])
 old.close();let db=new Storage(path)
 try{
  expect(db.session<{title:string}>('s')?.title).toBe('preserved')
  expect(db.get<{state:string;scope:string}>('SELECT state,scope FROM permission_requests WHERE id=?','old')).toEqual({state:'allowed',scope:'once'})
  expect(db.get<{n:number}>('SELECT max(version) n FROM schema_migrations')?.n).toBe(10)
  expect(db.search('scope','model','1',[1,0])).toHaveLength(1)
  expect(Buffer.from(db.get<{bytes:Uint8Array}>('SELECT bytes FROM attachments')!.bytes).toString()).toBe('proof')
  const backup=new Database(join(root,readdirSync(root).find(n=>n.startsWith('db.before-v7-'))!),{readonly:true})
  try{expect(backup.query('SELECT max(version) v FROM schema_migrations').get()).toEqual({v:6});expect(backup.query('SELECT state FROM permission_requests').get()).toEqual({state:'allowed'})}finally{backup.close()}
  let permissions=new Permissions(db)
  await permissions.request('s','task','grant','mcp_call',{name:'tool',arguments:{b:2,a:1}},'action',undefined,p=>{if(p)permissions.decide('s',p.id,true,'session')})
  db.backup(join(root,'approved-backup'));db.close();db=new Storage(path);permissions=new Permissions(db)
  let shown=0
  const show=(p:Parameters<Parameters<Permissions['request']>[7]>[0])=>{if(p){shown++;permissions.decide('s',p.id,false)}}
  await permissions.request('s','task','same','mcp_call',{arguments:{a:1,b:2},name:'tool'},'action',undefined,show)
  expect(shown).toBe(0)
  for(const [tool,args,action] of [['other',{name:'tool',arguments:{a:1,b:2}},'action'],['mcp_call',{name:'changed',arguments:{a:1,b:2}},'action'],['mcp_call',{name:'tool',arguments:{a:1,b:2}},'different']] as const){
   await expect(permissions.request('s','task',crypto.randomUUID(),tool,args,action,undefined,show)).rejects.toThrow('拒绝')
  }
  expect(shown).toBe(3)
  const restored=new Storage(join(root,'approved-backup'))
  try{expect(restored.all('SELECT * FROM session_permission_grants')).toEqual(db.all('SELECT * FROM session_permission_grants'));expect(restored.search('scope','model','1',[1,0])).toHaveLength(1)}finally{restored.close()}
 }finally{db.close();rmSync(root,{recursive:true,force:true})}
})
