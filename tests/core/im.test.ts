import {imFixture,until} from './im-fixture'
import {test,expect} from 'bun:test'
import {IM} from '../../core/im'
import {WeixinApi,weixinBase} from '../../core/weixin-api'
import {withCore,sse,call} from './helpers'
import type {Session} from '../../core/contracts'
import {readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
test('Weixin inbox deduplicates, isolates senders and accounts; real Core permission authorizes file write',async()=>{
 let calls=0
 await withCore(async(app,_base,workspace)=>{
  app.core.storage.db.run("DELETE FROM providers WHERE id<>'test'")
  const f=await imFixture(app)
  try{
   const id=await f.bind();f.push('1','write receipt');f.push('1','write receipt');f.push('bad','unauthorized','stranger')
   await until(()=>app.core.storage.list<Session>().some(s=>!!s.permissionRequest))
   const s=app.core.storage.list<Session>()[0],p=s.permissionRequest!;expect(existsSync(join(workspace,'im.txt'))).toBe(false)
   expect(app.core.storage.all('SELECT * FROM im_inbox')).toHaveLength(1)
   await f.bind('token2','other','bot2');f.push('2','/允许 '+p.id,'other','token2');await until(()=>f.sent.some(s=>s.token==='token2'))
   expect(existsSync(join(workspace,'im.txt'))).toBe(false)
   f.push('3','/允许 '+p.id);await until(()=>existsSync(join(workspace,'im.txt'))&&f.sent.some(s=>s.msg.item_list.some(i=>i.text_item.text.includes('DONE'))))
   expect(readFileSync(join(workspace,'im.txt'),'utf8')).toBe('IM_RECEIPT');expect(calls).toBe(2)
   expect(f.sent.filter(x=>x.token==='token1').every(x=>x.msg.to_user_id==='owner'&&x.msg.context_token==='context:owner')).toBe(true)
   const row=app.core.storage.get<{secret:string;cursor:string}>('SELECT secret,cursor FROM im_accounts WHERE id=?',id)!
   expect(row.secret).not.toContain('token1');expect(JSON.stringify(app.core.im.list())).not.toContain('token1');expect(row.cursor).toBe('cursor:token1')
  }finally{await f.close()}
 },()=>++calls===1?call('write',{path:'im.txt',content:'IM_RECEIPT'}):sse({content:'DONE'}))
},20000)
test('Weixin questions resume original task; duplicate answer and uncertain sends do not repeat work',async()=>{
 let calls=0
 await withCore(async(app)=>{
  app.core.storage.db.run("DELETE FROM providers WHERE id<>'test'");const f=await imFixture(app)
  try{
   await f.bind();f.push('1','ask me')
   await until(()=>app.core.storage.list<Session>().some(s=>!!s.questionRequest));const s=app.core.storage.list<Session>()[0],q=s.questionRequest!,task=q.taskId
   const answer='/回答 '+q.id+' '+JSON.stringify({time:{selected:[],text:'明天九点'}})
   f.push('2',answer);f.push('2',answer);await until(()=>app.core.storage.session<Session>(s.id)?.messages.at(-1)?.text==='RESUMED')
   expect(app.core.storage.all('SELECT id FROM tasks')).toEqual([{id:task}]);expect(calls).toBe(2)
   await until(()=>f.sent.some(x=>x.msg.item_list[0].text_item.text==='RESUMED'))
   f.uncertain();f.push('3','/帮助');await until(()=>!!app.core.storage.get("SELECT 1 FROM im_outbox WHERE state='uncertain'"));const count=f.sent.length
   await app.core.im.close();app.core.im=new IM(app.core,new WeixinApi(f.fetcher));await Bun.sleep(800);expect(f.sent.length).toBe(count)
  }finally{await f.close()}
 },()=>++calls===1?call('ask_questions',{questions:[{id:'time',title:'几点？',kind:'text'}]}):sse({content:'RESUMED'}))
},20000)
test('Weixin stop while awaiting permission blocks filesystem effects; disable and restore do not replay old work',async()=>{
 await withCore(async(app,base,workspace)=>{
  app.core.storage.db.run("DELETE FROM providers WHERE id<>'test'");const f=await imFixture(app)
  try{
   const id=await f.bind();f.push('1','write');await until(()=>!!app.core.storage.list<Session>()[0]?.permissionRequest)
   for(let i=0;i<60;i++)f.push('queued-'+i,'later write')
   f.push('2','/停止');await until(()=>app.core.active.size===0);expect(existsSync(join(workspace,'im.txt'))).toBe(false)
   expect(app.core.storage.all('SELECT id FROM tasks')).toHaveLength(1);expect(app.core.storage.all("SELECT * FROM im_inbox WHERE state='pending'")).toHaveLength(0)
   const session=app.core.storage.list<Session>()[0];expect(session.messages.at(-1)?.stopped).toBe(true)
   const backup=app.core.dataPath+'.im-backup';app.core.storage.backup(backup)
   const preview=await (await fetch(base+'/api/backups/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:backup})})).json()
   expect(preview.version).toBe(12);expect(preview.id).toBeTruthy()
   const a=app.core.im.list().find(x=>x.id===id)!;await app.core.im.save({id,platform:'微信',account:a.account,scope:a.scope,enabled:false});expect(app.core.im.list().find(x=>x.id===id)?.enabled).toBe(false)
   await f.close()
   const restored=await fetch(base+'/api/backups/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:preview.id,confirm:true})});expect(restored.status).toBe(200)
   expect(app.core.im.list()[0].enabled).toBe(false);expect(app.core.storage.all("SELECT * FROM im_outbox WHERE state IN ('pending','sending')")).toHaveLength(0);expect(app.core.storage.list<Session>()[0].messages.at(-1)?.stopped).toBe(true)
  }finally{await f.close()}
 },()=>call('write',{path:'im.txt',content:'SHOULD_NOT_WRITE'}))
},20000)
test('Weixin rejects foreign credential hosts and preserves uint64 wire IDs',async()=>{
 expect(()=>weixinBase('https://weixin.qq.com.evil.test')).toThrow();expect(()=>weixinBase('http://ilinkai.weixin.qq.com')).toThrow()
 const api=new WeixinApi((async()=>new Response('{"ret":0,"msgs":[{"message_id":18446744073709551615,"from_user_id":"owner","message_type":1}]}')) as unknown as typeof fetch)
 const result=await api.updates('https://ilinkai.weixin.qq.com','token','',new AbortController().signal)
 expect(result.msgs[0].message_id).toBe('18446744073709551615')
})
