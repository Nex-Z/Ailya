import {test,expect} from 'bun:test'
import {fileTools} from '../../core/tools'
import {Storage} from '../../core/storage'
import {Core} from '../../core/core'
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import type {FileChange,Session} from '../../core/contracts'
test('file boundary, real diff and abort before mutation',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-tools-'));const controller=new AbortController();const changes:FileChange[]=[]
 try{
  const tools=fileTools(root,'full',()=>controller.signal,x=>changes.push(x)),write=tools[1]
  await write.execute('one',{path:'file.txt',content:'a\nb\n'},controller.signal)
  await write.execute('two',{path:'file.txt',content:'a\nc\n'},controller.signal)
  expect(readFileSync(join(root,'file.txt'),'utf8')).toBe('a\nc\n');expect(changes[1].added).toBe(1);expect(changes[1].deleted).toBe(1)
  await tools[2].execute('precise',{path:'file.txt',edits:[{oldText:'c',newText:'d'}]},controller.signal)
  expect(readFileSync(join(root,'file.txt'),'utf8')).toBe('a\nd\n');expect(changes[2].added).toBe(1);expect(changes[2].deleted).toBe(1)
  await expect(write.execute('escape',{path:'../escape.txt',content:'no'},controller.signal)).rejects.toThrow('工作空间')
  await expect(tools[0].execute('read',{path:'~/.ssh/id_rsa'},controller.signal)).rejects.toThrow('工作空间')
  controller.abort();await expect(write.execute('late',{path:'late.txt',content:'no'},controller.signal)).rejects.toThrow()
  expect(existsSync(join(root,'late.txt'))).toBe(false)
 }finally{rmSync(root,{recursive:true,force:true})}
})
test('restart preserves history and marks interrupted run without repeating execution',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-restart-')),path=join(root,'db.sqlite');const db=new Storage(path)
 const session:Session={id:'s',title:'task',context:{workspace:root,model:'default',agent:'Ailya',permission:'full'},messages:[{id:'m',role:'assistant',text:'partial',executing:true}],group:'今天'}
 db.saveSession(session);db.db.run('INSERT INTO tasks(id,session_id,request_id,status,started_at,data) VALUES(?,?,?,?,?,?)',['t','s','r','running',100,JSON.stringify({messageId:'m'})]);db.close()
 const core=new Core(path,root)
 try{expect(core.storage.session<Session>('s')!.messages[0].text).toBe('partial');expect(core.storage.session<Session>('s')!.messages[0].error).toContain('重启');expect(core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('interrupted');expect(core.active.size).toBe(0)}finally{await core.close();rmSync(root,{recursive:true,force:true})}
})

test('second Core cannot take over a live database',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-lock-')),path=join(root,'db.sqlite');const core=new Core(path,root)
 try{expect(()=>new Core(path,root)).toThrow('已有 Core')}finally{await core.close();rmSync(root,{recursive:true,force:true})}
})

