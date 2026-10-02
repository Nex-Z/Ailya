import {test,expect} from 'bun:test'
import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import {withCore,call,sse,input,post,waitSession,settle} from './helpers'
import type {Session} from '../../core/contracts'
test('permission persists across reconnect, binds session and executes exactly once after approval',async()=>{
 let calls=0
 await withCore(async(app,url,workspace)=>{
  await post(url+'/api/sessions/one/send',input())
  const session=await waitSession(app,'one',s=>!!s?.permissionRequest),id=session.permissionRequest!.id
  expect(existsSync(join(workspace,'approved.txt'))).toBe(false)
  const snapshot=await(await fetch(url+'/api/snapshot')).json();expect(snapshot.sessions[0].permissionRequest.id).toBe(id)
  expect((await post(url+'/api/sessions/other/permissions/'+id,{allow:true})).status).toBe(400)
  expect((await post(url+'/api/sessions/one/permissions/'+id,{allow:true})).status).toBe(200)
  expect((await post(url+'/api/sessions/one/permissions/'+id,{allow:true})).status).toBe(200)
  await settle(app)
  expect(readFileSync(join(workspace,'approved.txt'),'utf8')).toBe('approved')
  expect(app.core.storage.get<{n:number}>("SELECT count(*) n FROM events WHERE kind='file_changed'")!.n).toBe(1)
  expect(app.core.storage.session<Session>('one')!.permissionRequest).toBeUndefined()
  expect(app.core.storage.get<{state:string}>('SELECT state FROM permission_requests')!.state).toBe('allowed')
 },()=>++calls===1?call('write',{path:'approved.txt',content:'approved'}):sse({content:'done'}))
})
test('stop while awaiting permission rejects late approval and performs no write',async()=>{
 await withCore(async(app,url,workspace)=>{
  await post(url+'/api/sessions/one/send',input())
  const session=await waitSession(app,'one',s=>!!s?.permissionRequest)
  await post(url+'/api/sessions/one/stop',{});await settle(app)
  expect((await post(url+'/api/sessions/one/permissions/'+session.permissionRequest!.id,{allow:true})).status).toBe(400)
  expect(existsSync(join(workspace,'late.txt'))).toBe(false)
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')!.status).toBe('stopped')
  expect(app.core.storage.get<{state:string}>('SELECT state FROM permission_requests')!.state).toBe('cancelled')
 },()=>call('write',{path:'late.txt',content:'never'}))
})
test('Core allowlist is persisted and automatic approval is audited; invalid policy rejected',async()=>{
 let calls=0
 await withCore(async(app,url,workspace)=>{
  expect((await post(url+'/api/policy',{allowlist:'['})).status).toBe(400)
  expect((await post(url+'/api/policy',{allowlist:'^write .*?/allowed\\.txt$'})).status).toBe(200)
  expect(app.core.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='allowlist'")!.value).toContain('allowed')
  await post(url+'/api/sessions/one/send',input());await settle(app)
  expect(readFileSync(join(workspace,'allowed.txt'),'utf8')).toBe('yes')
  expect(app.core.storage.get<{state:string}>('SELECT state FROM permission_requests')!.state).toBe('automatic')
  app.core.permissions.save({allowlist:'(a+)+$'})
  const started=Date.now();expect(await app.core.permissions.matches('a'.repeat(500)+'!')).toBe(false);expect(Date.now()-started).toBeLessThan(3000)
 },()=>++calls===1?call('write',{path:'allowed.txt',content:'yes'}):sse({content:'done'}))
})
