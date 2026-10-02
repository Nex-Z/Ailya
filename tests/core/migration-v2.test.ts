import {test,expect} from 'bun:test'
import {Database} from 'bun:sqlite'
import {readFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Storage} from '../../core/storage'
import {Core} from '../../core/core'
import type {Session} from '../../core/contracts'

test('v2 upgrade preserves attachments and policy and produces a readable pre-v3 backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-v3-')),path=join(root,'db.sqlite'),old=new Database(path)
 for(const name of ['0001','0002'])old.exec(readFileSync(new URL(`../../core/migrations/${name}.sql`,import.meta.url),'utf8'))
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);INSERT INTO schema_migrations VALUES(1),(2)')
 old.run('INSERT INTO sessions VALUES(?,?,?)',['s','{"id":"s"}',1]);old.run('INSERT INTO core_settings VALUES(?,?)',['policy','old-policy'])
 old.run('INSERT INTO attachments VALUES(?,?,?,?,?,?,?,?,?)',['a','s','m','proof.txt','text/plain',5,'hash',Buffer.from('proof'),1]);old.close()
 const upgraded=new Storage(path)
 try{expect(upgraded.get<{value:string}>('SELECT value FROM core_settings')!.value).toBe('old-policy');expect(Buffer.from(upgraded.get<{bytes:Uint8Array}>('SELECT bytes FROM attachments')!.bytes).toString()).toBe('proof')
  const backup=new Database(join(root,readdirSync(root).find(n=>n.includes('before-v3'))!),{readonly:true});try{expect(backup.query('SELECT max(version) n FROM schema_migrations').get()).toEqual({n:2});expect(backup.query('SELECT name FROM attachments').get()).toEqual({name:'proof.txt'})}finally{backup.close()}
 }finally{upgraded.close();rmSync(root,{recursive:true,force:true})}
})
test('v1 database upgrades in place retaining messages, providers and vectors',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-migration-')),path=join(root,'db.sqlite')
 const old=new Database(path)
 old.exec(readFileSync(new URL('../../core/migrations/0001.sql',import.meta.url),'utf8'));old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);INSERT INTO schema_migrations VALUES(1)')
 old.run('INSERT INTO sessions VALUES(?,?,?)',['s',JSON.stringify({id:'s',messages:[{text:'old message'}]}),1]);old.run('INSERT INTO providers VALUES(?,?,?)',['p','{"id":"p"}','encrypted-reference'])
 old.run('INSERT INTO vector_sources VALUES(?,?,?,?,?,?,?,?)',['v','scope','model','1',2,'old text','oldhash',new Uint8Array(new Float32Array([1,0]).buffer)]);old.close(true)
 const db=new Storage(path)
 try{expect(db.session<{messages:{text:string}[]}>('s')!.messages[0].text).toBe('old message');expect(db.get<{secret:string}>('SELECT secret FROM providers')!.secret).toBe('encrypted-reference');expect(db.search('scope','model','1',[1,0])).toHaveLength(1);expect(db.get<{n:number}>('SELECT max(version) n FROM schema_migrations')!.n).toBe(7)}finally{db.close();rmSync(root,{recursive:true,force:true})}
})
test('restart invalidates pending approval, clears UI request and does not execute old operation',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-permission-restart-')),path=join(root,'db.sqlite'),db=new Storage(path)
 const request={id:crypto.randomUUID(),tool:'write',toolCallId:'call',taskId:'t',args:{path:'must-not-write.txt',content:'no'},action:'write file',createdAt:1}
 const session:Session={id:'s',title:'pending',group:'今天',context:{workspace:root,agent:'Ailya',model:'model',permission:'default'},messages:[{id:'m',role:'assistant',text:'',executing:true}],permissionRequest:request}
 db.saveSession(session);db.db.run('INSERT INTO tasks(id,session_id,request_id,status,started_at,data) VALUES(?,?,?,?,?,?)',['t','s','r','running',1,'{"messageId":"m"}'])
 db.db.run('INSERT INTO permission_requests(id,session_id,task_id,tool_call_id,tool,args,action,state,created_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[request.id,'s','t','call','write',JSON.stringify(request.args),'write file','pending',1,null]);db.close()
 const core=new Core(path,root)
 try{expect(core.storage.session<Session>('s')!.permissionRequest).toBeUndefined();expect(core.storage.get<{state:string}>('SELECT state FROM permission_requests')!.state).toBe('cancelled');expect(()=>core.decidePermission('s',request.id,true)).toThrow('失效')}finally{await core.close();rmSync(root,{recursive:true,force:true})}
})
