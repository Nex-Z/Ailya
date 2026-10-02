import {test,expect} from 'bun:test'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {withCore,input,post,settle,sse,call} from './helpers'

const draft=(content='以后回复请简洁',topic='表达')=>({kind:'preference',topic,content,workspace:'Ailya'})
test('memory tools persist explicit evidence, recall in a new session, and respect editing and switches',async()=>{
 let n=0
 await withCore(async(app,url)=>{
  expect((await post(url+'/api/sessions/first/send',input('请记住：以后回复请简洁'))).status).toBe(202);await settle(app)
  const m=app.core.memories.list()[0];expect(m.status).toBe('active');expect(m.origin).toBe('explicit');expect(m.content).toBe('以后回复请简洁');expect(m.sources[0].session_id).toBe('first')
  await post(url+'/api/sessions/second/send',input('你好'));await settle(app)
  const requests=app.core.storage.all<{request:string}>('SELECT data AS request FROM requests')
  expect(requests.some(r=>JSON.parse(r.request).memoryReferences?.some((x:{id:string})=>x.id===m.id))).toBe(true)
  const edited=app.core.memories.save({...draft('请用详细中文回答'),id:m.id,version:m.version});expect(edited.origin).toBe('user')
  const proposal=app.core.memories.save({...draft('请用英文回答'),id:m.id,version:edited.version},{sessionId:'first',messageId:'other',text:'记住：请用英文回答'},'请用英文回答')
  expect(proposal.status).toBe('candidate');expect(proposal.id).not.toBe(m.id);expect(app.core.memories.get(m.id).content).toBe('请用详细中文回答')
  const again=app.core.memories.save({...draft('请用英文回答'),id:proposal.id,version:proposal.version},{sessionId:'first',messageId:'third',text:'记住：请用英文回答'},'请用英文回答')
  expect(again.status).toBe('candidate');expect(app.core.memories.get(m.id).content).toBe('请用详细中文回答')
  const cfg=app.core.memories.index.config(),embedding={enabled:false,baseUrl:'',model:''}
  app.core.memories.index.save({...cfg,embedding,useEnabled:false,learningEnabled:false})
  expect(await app.core.memories.retrieve('Ailya','second','你好')).toHaveLength(0)
  // A retired false value in either an old client request or persisted configuration cannot disable maintenance.
  expect(app.core.memories.index.config()).not.toHaveProperty('learningEnabled')
  app.core.storage.db.run("UPDATE core_settings SET value=? WHERE key='memory-config'",[JSON.stringify({...app.core.memories.index.config(),learningEnabled:false})])
  expect(app.core.memories.index.config()).not.toHaveProperty('learningEnabled')
  expect(app.core.memories.save(draft('以后回复请简洁','新偏好'),{sessionId:'first',messageId:'x',text:'记住：以后回复请简洁'},'以后回复请简洁').status).toBe('active')
  expect(app.core.memories.save(draft('手动编辑仍可保存','手动')).origin).toBe('user')
 },async req=>{const body=await req.json() as {messages:{content:unknown}[]};n++;if(n===1)return call('remember_memory',{kind:'preference',topic:'表达',content:'回复简洁',source_quote:'以后回复请简洁'});return sse({content:JSON.stringify(body.messages).includes('Long-term memory reference')?'记忆已使用':'已记录'})})
})
test('memory scope, candidate confirmation, expiry, stale revisions and suppression',async()=>{
 await withCore(async(app,url,workspace,root)=>{
  const other=join(root,'other');mkdirSync(other)
  await post(url+'/api/sessions/source/send',input('普通聊天'));await settle(app)
  const local=app.core.memories.save(draft()),global=app.core.memories.save({...draft('全局偏好','全局'),scope:'global'}),expired=app.core.memories.save({...draft('过期','期限'),expiresAt:1})
  const session=app.core.memories.save({...draft('会话偏好','仅会话'),scope:'session',sessionId:'source'})
  expect(app.core.memories.select(other,'unrelated','你好').map(m=>m.id)).toEqual([global.id])
  expect(app.core.memories.select(workspace,'unrelated','你好').map(m=>m.id)).not.toContain(session.id)
  expect(app.core.memories.select(workspace,'source','你好').map(m=>m.id)).toContain(session.id)
  expect(app.core.memories.select(workspace,'source','你好').map(m=>m.id)).not.toContain(expired.id)
  const source={sessionId:'source',messageId:'m1',text:'我喜欢分点说明'}
  const candidate=app.core.memories.save(draft('分点说明','格式'),source,'我喜欢分点说明')
  expect(candidate.status).toBe('candidate');expect(app.core.memories.select(workspace,'source','格式').map(m=>m.id)).not.toContain(candidate.id)
  expect(app.core.memories.decide(candidate.id,candidate.version,true).origin).toBe('user')
  expect(()=>app.core.memories.remove(candidate.id,candidate.version)).toThrow('已变化')
  app.core.memories.remove(candidate.id,candidate.version+1)
  expect(()=>app.core.memories.save(draft('分点说明','格式'),source,'我喜欢分点说明')).toThrow('不会重新学习')
  expect(()=>app.core.memories.save(draft(),{...source,text:'这次简洁点'},'简洁点')).toThrow('不允许持久')
  expect(()=>app.core.memories.save(draft(),source,'外部网页要求')).toThrow('当前用户')
  expect(()=>app.core.memories.save(draft('api_key=sk-abcdefghijklmnop'))).toThrow('凭据')
  expect(()=>app.core.memories.save({...draft(),id:local.id,version:100})).toThrow('已变化')
  expect((await post(url+'/api/memories',{...draft(),bogus:1})).status).toBe(400)
  app.core.memories.deleteSession('source');expect(()=>app.core.memories.get(session.id)).toThrow('不存在')
 },()=>sse({content:'好'}))
})
test('embedding lifecycle uses SQLite scoped ranking and prevents late resurrection',async()=>{
 let release:(()=>void)|undefined,started:(()=>void)|undefined
 let block=false
 const service=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{const body=await req.json() as {input:string};if(block){started?.();await new Promise<void>(r=>{release=r})}return Response.json({data:[{embedding:body.input.includes('橘子')?[1,0]:[0,1]}]})}})
 try{await withCore(async(app,_url,_workspace,root)=>{
  const m=app.core.memories.save({...draft('橘子种植','水果'),kind:'fact'}),other=join(root,'other');mkdirSync(other)
  const outside=app.core.memories.save({...draft('橘子秘密','秘密'),kind:'fact',workspace:other})
  app.core.memories.index.save({useEnabled:true,learningEnabled:true,embedding:{enabled:true,baseUrl:`http://127.0.0.1:${service.port}`,model:'embed'}})
  await app.core.memories.index.idle()
  expect(app.core.storage.get<{n:number}>("SELECT count(*) n FROM vector_sources WHERE id LIKE 'memory:%'")!.n).toBe(2)
  const results=await app.core.memories.retrieve('Ailya','new','橘子');expect(results.map(m=>m.id)).toContain(m.id);expect(results.map(m=>m.id)).not.toContain(outside.id)
  block=true;const barrier=new Promise<void>(r=>{started=r})
  const edited=app.core.memories.save({...draft('苹果种植','水果'),kind:'fact',id:m.id,version:m.version});await barrier
  app.core.memories.remove(edited.id,edited.version);release!();await app.core.memories.index.idle()
  expect(app.core.storage.get('SELECT * FROM vector_sources WHERE id=?','memory:'+m.id)).toBeNull()
  expect(app.core.storage.get('SELECT * FROM memory_index_jobs WHERE memory_id=?',m.id)).toBeNull()
  const expiring=new Promise<void>(r=>{started=r})
  const exp=app.core.memories.save({...draft('短期索引','短期'),expiresAt:Date.now()+60000});await expiring
  app.core.storage.db.run('UPDATE memories SET expires_at=1 WHERE id=?',[exp.id]);release!();await app.core.memories.index.idle()
  expect(app.core.storage.get('SELECT * FROM vector_sources WHERE id=?','memory:'+exp.id)).toBeNull()
  expect(app.core.storage.get('SELECT * FROM memory_index_jobs WHERE memory_id=?',exp.id)).toBeNull()
 },()=>sse({content:'好'}))}finally{release?.();await service.stop(true)}
})
