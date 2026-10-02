import {test,expect} from 'bun:test'
import {Database} from 'bun:sqlite'
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {withCore,input,post,settle,sse,call,waitSession} from './helpers'
import type {Session} from '../../core/contracts'

test('backup preview and confirmed restore preserve relations, attachments and vectors, retaining latest memory deletions',async()=>{
 await withCore(async(app,base,workspace)=>{
  const attachmentId=crypto.randomUUID();await post(base+'/api/sessions/kept/send',{...input('kept'),attachments:[{id:attachmentId,name:'proof.txt',mime:'text/plain',base64:Buffer.from('ATTACHMENT').toString('base64')}]});await settle(app)
  const memory=app.core.memories.save({kind:'preference',topic:'language',content:'中文',workspace});app.core.storage.vector({id:'memory:'+memory.id,scope:'s',model:'m',revision:'1',content:memory.content,embedding:[1,0]});app.core.storage.vector({id:'kept-vector',scope:'s',model:'m',revision:'1',content:'kept',embedding:[0,1]})
  writeFileSync(join(workspace,'external.txt'),'BEFORE')
  app.core.resources.save({id:crypto.randomUUID(),kind:'mcp',name:'encrypted fixture',command:'node --version',enabled:false})
  const created=await (await post(base+'/api/backups',{})).json();expect(created.path).toBeTruthy();expect(existsSync(created.path)).toBe(true)
  expect(new Uint8Array(await (await fetch(base+'/api/backups/'+created.name+'/download')).arrayBuffer())).toEqual(new Uint8Array(readFileSync(created.path)))
  app.core.memories.remove(memory.id,memory.version);await post(base+'/api/sessions/later/send',input('later'));await settle(app);writeFileSync(join(workspace,'external.txt'),'AFTER')
  const preview=await (await post(base+'/api/backups/preview',{path:created.path})).json();expect(preview.counts.sessions).toBe(1)
  expect((await post(base+'/api/backups/restore',{id:preview.id})).status).toBe(400)
  const response=await post(base+'/api/backups/restore',{id:preview.id,confirm:true}),restored=await response.json();expect(response.status,JSON.stringify(restored)).toBe(200);expect(existsSync(restored.rollback.path)).toBe(true)
  expect(app.core.storage.session('later')).toBeUndefined();expect(app.core.storage.session<Session>('kept')!.messages).toHaveLength(2);expect(app.core.memories.list()).toHaveLength(0)
  expect(app.core.storage.search('s','m','1',[0,1])).toEqual([{id:'kept-vector',content:'kept',distance:0}]);expect(await (await fetch(base+'/api/sessions/kept/attachments/'+attachmentId)).text()).toBe('ATTACHMENT');expect(readFileSync(join(workspace,'external.txt'),'utf8')).toBe('AFTER')
  expect(app.core.storage.all('PRAGMA foreign_key_check')).toEqual([]);expect((await post(base+'/api/backups/restore',{id:preview.id,confirm:true})).status).toBe(400)
  expect(app.core.resources.list()[0].command).toBe('node --version')
  await post(base+'/api/sessions/after/send',input('after restore'));await settle(app);expect(app.core.storage.session<Session>('after')!.messages.at(-1)!.text).toBe('OK')
 },()=>sse({content:'OK'}))
},20000)

test('invalid, altered and foreign SQLite files are rejected without changing the running database',async()=>{
 await withCore(async(app,base,_workspace,root)=>{
  const bad=join(root,'bad.sqlite');writeFileSync(bad,'not sqlite');expect((await post(base+'/api/backups/preview',{path:bad})).status).toBe(400)
  const backup=await (await post(base+'/api/backups',{})).json();const db=new Database(backup.path);db.exec('CREATE TABLE unexpected(id TEXT)');db.close();expect((await post(base+'/api/backups/preview',{path:backup.path})).status).toBe(400)
  const foreign=await(await post(base+'/api/backups',{})).json(),foreignDb=new Database(foreign.path);foreignDb.run('INSERT INTO resources VALUES(?,?,?,?,?,?,?)',[crypto.randomUUID(),'mcp','unreadable','invalid encrypted data',0,null,Date.now()]);foreignDb.close();const unavailable=await post(base+'/api/backups/preview',{path:foreign.path});expect(unavailable.status).toBe(400);expect((await unavailable.json()).error).toContain('MCP 配置无法')
  expect((await post(base+'/api/backups/preview',{path:app.core.dataPath})).status).toBe(400);expect((await fetch(base+'/api/health')).status).toBe(200);expect(app.core.storage.list()).toHaveLength(0)
 },()=>sse({content:'OK'}))
})

test('startup failure after replacement rolls back automatically and keeps the original Core usable',async()=>{
 await withCore(async(app,base)=>{
  await post(base+'/api/sessions/original/send',input('original'));await settle(app)
  const backup=await (await post(base+'/api/backups',{})).json(),db=new Database(backup.path)
  db.run('INSERT INTO resources VALUES(?,?,?,?,?,?,?)',[crypto.randomUUID(),'task','invalid schedule',JSON.stringify({kind:'task',enabled:true,time:'bad',frequency:'daily'}),1,Date.now()-100000,Date.now()]);db.close()
  const preview=await (await post(base+'/api/backups/preview',{path:backup.path})).json();expect(preview.id).toBeTruthy()
  const response=await post(base+'/api/backups/restore',{id:preview.id,confirm:true});expect(response.status).toBe(400);expect((await response.json()).error).toContain('已还原恢复前数据')
  expect((await fetch(base+'/api/health')).status).toBe(200);expect(app.core.storage.session<Session>('original')!.title).toBe('original');expect(app.core.resources.list()).toHaveLength(0)
  await post(base+'/api/sessions/after/send',input('after'));await settle(app);expect(app.core.storage.session<Session>('after')!.messages.at(-1)!.text).toBe('OK')
 },()=>sse({content:'OK'}))
},15000)

test('busy restore is refused, original source edits cannot change a preview, and v10 backup upgrades safely',async()=>{
 await withCore(async(app,base,_workspace,root)=>{
  const backup=await(await post(base+'/api/backups',{})).json(),preview=await(await post(base+'/api/backups/preview',{path:backup.path})).json()
  writeFileSync(backup.path,'source changed after preview')
  await post(base+'/api/sessions/wait/send',input('wait'));await waitSession(app,'wait',s=>!!s?.questionRequest)
  expect((await post(base+'/api/backups/restore',{id:preview.id,confirm:true})).status).toBe(400);expect(app.core.storage.session('wait')).toBeTruthy()
  await post(base+'/api/sessions/wait/stop',{});await settle(app)
  expect((await post(base+'/api/backups/restore',{id:preview.id,confirm:true})).status).toBe(200);expect(app.core.storage.list()).toHaveLength(0)
  const old=join(root,readdirSync(root).find(n=>n.startsWith('db.sqlite.before-v11-'))!),upgrade=await(await post(base+'/api/backups/preview',{path:old})).json();expect(upgrade.sourceVersion).toBe(10);expect(upgrade.version).toBe(11)
  expect((await post(base+'/api/backups/restore',{id:upgrade.id,confirm:true})).status).toBe(200);expect(app.core.storage.get<{v:number}>('SELECT max(version) v FROM schema_migrations')!.v).toBe(11)
 },()=>call('ask_questions',{questions:[{id:'q',kind:'text',title:'等待'}]}))
},15000)
