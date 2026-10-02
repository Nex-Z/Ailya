import {test,expect} from 'bun:test'
import {withCore,input,post,settle,sse,call,waitSession,packet} from './helpers'
import {readFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Core} from '../../core/core'
import {Storage} from '../../core/storage'
import type {Session} from '../../core/contracts'

function setup(core:Core){
 core.catalog.save('agents',{id:'lead',name:'Lead',model:'默认模型',skills:[],tools:[],prompt:'Coordinate the team.'})
 core.catalog.save('agents',{id:'worker',name:'Worker',model:'默认模型',skills:[],tools:['文件'],prompt:'WORKER_MARKER'})
 core.catalog.save('groups',{id:'team',name:'Team',coordinator:'lead',members:['worker']})
 const data=input('create group.txt');data.context.agent='Team';return data
}
test('restart marks both tasks interrupted and repairs persisted running member status',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-group-restart-')),path=join(root,'db');const db=new Storage(path)
 const context={workspace:root,agent:'Team',model:'默认模型',permission:'default' as const}
 db.saveSession({id:'parent',title:'parent',context,group:'今天',messages:[{id:'parent-message',role:'assistant',text:'',executing:true,parts:[{type:'tool-call',toolCallId:'delegate',toolName:'delegate_agent',args:{executionStatus:'running'},argsText:'{}'}]}]})
 db.saveSession({id:'child',parentSessionId:'parent',title:'child',context,group:'今天',messages:[{id:'child-message',role:'assistant',text:'partial child result',executing:true}]})
 for(const id of ['parent','child'])db.db.run('INSERT INTO tasks(id,session_id,request_id,status,started_at,data) VALUES(?,?,?,?,?,?)',[id+'-task',id,id+'-request','running',Date.now(),JSON.stringify({messageId:id+'-message'})])
 db.db.run('INSERT INTO group_runs VALUES(?,?,?,?,?,?)',['child','child-task','parent','parent-task','delegate','worker']);db.close()
 const core=new Core(path,root)
 try{
  expect(core.active.size).toBe(0)
  expect(core.storage.all<{status:string}>('SELECT status FROM tasks').map(t=>t.status)).toEqual(['interrupted','interrupted'])
  const p=core.storage.session<Session>('parent')!.messages[0].parts![0];expect(p.type==='tool-call'&&p.args.executionStatus).toBe('error')
  expect(core.storage.session<Session>('child')!.messages[0].text).toBe('partial child result')
 }finally{await core.close();rmSync(root,{recursive:true,force:true})}
})
test('group delegates a real file operation, routes permission to parent and keeps children read-only',async()=>{
 let parent=0,worker=0
 await withCore(async(app,url,workspace)=>{
  const data=setup(app.core)
  const provider=app.core.providers().find(p=>p.id==='test')!;app.core.saveProvider({...provider,hasKey:undefined,models:['test','worker-model']})
  const workerConfig=app.core.catalog.list().agents.find(a=>a.id==='worker')!;app.core.catalog.save('agents',{...workerConfig,model:'["test","worker-model"]'})
  expect((await post(url+'/api/sessions/group/send',data)).status).toBe(202)
  const waiting=await waitSession(app,'group',s=>!!s?.permissionRequest)
  const link=app.core.storage.get<{child_session_id:string;child_task_id:string;parent_task_id:string}>('SELECT * FROM group_runs')!
  expect(link.child_task_id).not.toBe(link.parent_task_id)
  expect(waiting.permissionRequest!.taskId).toBe(link.child_task_id)
  expect((await post(url+'/api/sessions/'+link.child_session_id+'/send',input())).status).toBe(403)
  expect((await post(url+'/api/sessions/'+link.child_session_id+'/stop',{})).status).toBe(403)
  expect((await (await fetch(url+'/api/snapshot')).json()).sessions).toHaveLength(1)
  expect((await post(url+'/api/sessions/group/permissions/'+waiting.permissionRequest!.id,{allow:true})).status).toBe(200)
  await settle(app)
  expect(readFileSync(join(workspace,'group.txt'),'utf8')).toBe('group proof')
  const result=app.core.storage.session<Session>('group')!.messages.at(-1)!
  expect(result.text).toBe('TEAM_DONE');expect(result.fileChanges?.[0].path).toContain('group.txt')
  const tool=result.parts?.find(p=>p.type==='tool-call')
  expect(tool?.type==='tool-call'&&tool.args.executionStatus).toBe('completed')
  expect(app.core.storage.all<{status:string}>('SELECT status FROM tasks').every(t=>t.status==='completed')).toBe(true)
  expect((await post(url+'/api/sessions/group/send',data)).status).toBe(202)
  expect(app.core.storage.all('SELECT * FROM group_runs')).toHaveLength(1)
  app.core.catalog.remove('groups','team')
  expect((await post(url+'/api/sessions/group/send',{...data,requestId:crypto.randomUUID()})).status).toBe(400)
  expect((await fetch(url+'/api/sessions/group',{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'})).ok).toBe(true)
  expect(app.core.storage.list()).toHaveLength(0);expect(app.core.storage.all('SELECT * FROM group_runs')).toHaveLength(0)
 },async req=>{
  const body=await req.json();const isWorker=JSON.stringify(body.messages).includes('WORKER_MARKER')
  expect(body.model).toBe(isWorker?'worker-model':'test')
  return isWorker?(++worker===1?call('write',{path:'group.txt',content:'group proof'},'write-1'):sse({content:'WORKER_DONE'})):(++parent===1?call('delegate_agent',{agent:'worker',task:'Create group.txt with group proof'},'delegate-1'):sse({content:'TEAM_DONE'}))
 })
})
test('a coordinator cannot delegate to an Agent outside its configured members',async()=>{
 let calls=0
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/group/send',setup(app.core));await settle(app)
  expect(app.core.storage.all('SELECT * FROM group_runs')).toHaveLength(0)
  const part=app.core.storage.session<Session>('group')!.messages.at(-1)!.parts!.find(p=>p.type==='tool-call')!
  expect(part.type==='tool-call'&&part.isError).toBe(true)
 },()=>++calls===1?call('delegate_agent',{agent:'outsider',task:'Do something'}):sse({content:'Cannot delegate to outsider.'}))
})
test('configured coordinator model does not mutate the original idempotency request',async()=>{
 let calls=0
 await withCore(async(app,url)=>{
  const data=setup(app.core),provider=app.core.providers().find(p=>p.id==='test')!
  app.core.saveProvider({...provider,models:['test','coordinator-model']})
  app.core.catalog.save('agents',{...app.core.catalog.list().agents.find(a=>a.id==='lead')!,model:'["test","coordinator-model"]'})
  expect((await post(url+'/api/sessions/group/send',data)).status).toBe(202);await settle(app)
  expect((await post(url+'/api/sessions/group/send',data)).status).toBe(202)
  expect(calls).toBe(1)
 },async req=>{expect((await req.json()).model).toBe('coordinator-model');calls++;return sse({content:'done'})})
})
test('member model failure is persisted and reported as a failed delegation',async()=>{
 let parent=0
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/group/send',setup(app.core));await settle(app)
  const part=app.core.storage.session<Session>('group')!.messages.at(-1)!.parts!.find(p=>p.type==='tool-call')!
  expect(part.type==='tool-call'&&part.isError).toBe(true)
  expect(part.type==='tool-call'&&part.args.executionStatus).toBe('error')
  const link=app.core.storage.get<{child_task_id:string}>('SELECT child_task_id FROM group_runs')!
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks WHERE id=?',link.child_task_id)!.status).toBe('failed')
 },async req=>JSON.stringify((await req.json()).messages).includes('WORKER_MARKER')?new Response('model unavailable',{status:400}):++parent===1?call('delegate_agent',{agent:'worker',task:'work'}):sse({content:'Member failed; no success claimed.'}))
})
test('stop reaches an actively streaming child without rolling back a completed write',async()=>{
 let worker=0,controller:ReadableStreamDefaultController<Uint8Array>|undefined
 await withCore(async(app,url,workspace)=>{
  const data=setup(app.core);data.context.permission='full'
  await post(url+'/api/sessions/group/send',data)
  await waitSession(app,'group',s=>!!s?.messages.at(-1)?.parts?.some(p=>p.type==='tool-call'&&String(p.args.progress).includes('still working')))
  await post(url+'/api/sessions/group/stop',{});await settle(app)
  expect(readFileSync(join(workspace,'group.txt'),'utf8')).toBe('keep me')
  expect(app.core.active.size).toBe(0)
  expect(app.core.storage.all<{status:string}>('SELECT status FROM tasks').map(t=>t.status)).toEqual(['stopped','stopped'])
  try{controller?.close()}catch{/* aborted */}
 },async req=>{
  if(!JSON.stringify((await req.json()).messages).includes('WORKER_MARKER'))return call('delegate_agent',{agent:'worker',task:'write'},'delegate-1')
  if(++worker===1)return call('write',{path:'group.txt',content:'keep me'})
  return new Response(new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(packet({role:'assistant',content:'still working'})))}}),{headers:{'Content-Type':'text/event-stream'}})
 })
})
test('stopping a group cancels pending child permission and preserves no-write boundary',async()=>{
 await withCore(async(app,url,workspace)=>{
  await post(url+'/api/sessions/group/send',setup(app.core))
  const waiting=await waitSession(app,'group',s=>!!s?.permissionRequest)
  await post(url+'/api/sessions/group/stop',{});await settle(app)
  expect(existsSync(join(workspace,'group.txt'))).toBe(false)
  expect((await post(url+'/api/sessions/group/permissions/'+waiting.permissionRequest!.id,{allow:true})).status).toBe(400)
  expect(app.core.storage.all<{status:string}>('SELECT status FROM tasks').map(t=>t.status)).toEqual(['stopped','stopped'])
 },async req=>JSON.stringify((await req.json()).messages).includes('WORKER_MARKER')?call('write',{path:'group.txt',content:'late'}):call('delegate_agent',{agent:'worker',task:'write'},'delegate-1'))
})
