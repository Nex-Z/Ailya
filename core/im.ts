import {z} from 'zod'
import QRCode from 'qrcode'
import type {Core} from './core'
import type {Session} from './contracts'
import {encryptSecret,decryptSecret} from './secrets'
import {WeixinApi,WEIXIN_BASE,WeixinError,weixinBase,type WeixinUpdate} from './weixin-api'
export const imConfig=z.object({id:z.string().uuid(),platform:z.literal('微信'),enabled:z.boolean(),scope:z.enum(['仅允许指定用户','仅允许私聊']),account:z.string().max(4000)}).strict()
type Config=z.infer<typeof imConfig>
type Account={id:string;config:string;secret:string|null;bot_id:string|null;owner_id:string|null;base_url:string;cursor:string;status:string;error:string|null}
type Conversation={account_id:string;peer:string;session_id:string|null;context_token:string}
type Inbox={account_id:string;message_id:string;peer:string;text:string;context_token:string;request_id:string;state:string}
type Outbox={id:string;account_id:string;peer:string;context_token:string;source_key:string;text:string;state:string}
type Login={controller:AbortController;done:Promise<void>;qr?:string;image?:string;status:string;verify:string;expires:number;error?:string}
const delay=(ms:number,signal:AbortSignal)=>new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve()},timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});if(signal.aborted)finish()})
export class IM{
 private loops=new Map<string,{controller:AbortController;done:Promise<void>}>()
 private logins=new Map<string,Login>()
 private timer:ReturnType<typeof setInterval>
 private controller=new AbortController()
 private pumping:Promise<void>|undefined
 private closed=false
 private paused=new Set<string>()
 private mutations=new Set<string>()
 private dirty=true
 private onChange=()=>{this.dirty=true}
 private get db(){return this.core.storage}
 constructor(private core:Core,private api=new WeixinApi()){
  this.db.db.run("UPDATE im_outbox SET state='uncertain',error='上次发送被中断，送达状态未知，未自动重发' WHERE state='sending'")
  this.db.db.run("UPDATE im_inbox SET state='interrupted' WHERE state='processing'")
  this.timer=setInterval(()=>this.tick(),300);this.timer.unref()
  core.listeners.add(this.onChange)
  for(const a of this.accounts())if(JSON.parse(a.config).enabled&&a.secret)this.connect(a.id)
 }
 private accounts(){return this.db.all<Account>('SELECT * FROM im_accounts ORDER BY updated_at')}
 private get(id:string){const a=this.db.get<Account>('SELECT * FROM im_accounts WHERE id=?',id);if(!a)throw Error('IM 账号不存在');return a}
 list(){return this.accounts().map(a=>({...JSON.parse(a.config) as Config,botId:a.bot_id,ownerId:a.owner_id,status:a.status,error:a.error,deliveryIssues:this.db.get<{n:number}>("SELECT count(*) n FROM im_outbox WHERE account_id=? AND state IN ('failed','uncertain')",a.id)!.n,login:this.loginView(a.id)}))}
 private loginView(id:string){const l=this.logins.get(id);return l?{image:l.image,status:l.status,error:l.error,expires:l.expires}:undefined}
 private async change<T>(id:string,fn:()=>Promise<T>){if(this.closed)throw Error('IM 正在关闭');if(this.mutations.has(id))throw Error('此账号正在更新，请稍后重试');this.mutations.add(id);try{return await fn()}finally{this.mutations.delete(id)}}
 private async cancelLogin(id:string){const l=this.logins.get(id);l?.controller.abort();await l?.done;this.logins.delete(id)}
 async save(input:unknown){
  const config=imConfig.parse(input),old=this.db.get<Account>('SELECT * FROM im_accounts WHERE id=?',config.id)
  return this.change(config.id,async()=>{
  this.dirty=true
  await this.cancelLogin(config.id)
  if(old)await this.disconnect(config.id,true)
  this.db.db.run('INSERT INTO im_accounts(id,config,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at',[config.id,JSON.stringify(config),Date.now()])
  if(config.enabled&&this.get(config.id).secret)this.connect(config.id)
  else this.db.db.run('UPDATE im_accounts SET status=? WHERE id=?',[this.get(config.id).secret?'disabled':'unbound',config.id])
  return this.list()
  })
 }
 async remove(id:string){return this.change(id,async()=>{this.get(id);await this.cancelLogin(id);await this.disconnect(id,true);this.db.db.run('DELETE FROM im_accounts WHERE id=?',[id])})}
 async login(id:string){
  return this.change(id,async()=>{
  this.get(id);await this.cancelLogin(id)
  await this.disconnect(id,true)
  this.db.db.run("UPDATE im_accounts SET config=json_set(config,'$.enabled',json('false')),status='unbound',error=NULL WHERE id=?",[id])
  const controller=new AbortController(),login:Login={controller,done:Promise.resolve(),status:'loading',verify:'',expires:Date.now()+240000};this.logins.set(id,login)
  login.done=this.runLogin(id,login);return this.loginView(id)
  })
 }
 verify(id:string,code:string){const l=this.logins.get(id);if(!l||l.status!=='need_verifycode')throw Error('当前不需要验证码');l.verify=z.string().regex(/^\d{4,12}$/).parse(code)}
 private async runLogin(id:string,l:Login){
  try{
   const qr=await this.api.qr(l.controller.signal);l.qr=qr.qrcode;l.image=await QRCode.toDataURL(qr.qrcode_img_content,{width:240,margin:2});l.status='wait';let base=WEIXIN_BASE
   while(!l.controller.signal.aborted&&Date.now()<l.expires){
    const result=await this.api.status(base,l.qr,l.verify,l.controller.signal);l.controller.signal.throwIfAborted();l.status=result.status
    if(result.status==='confirmed'){
     const token=z.string().min(1).max(10000).parse(result.bot_token),bot=z.string().min(1).max(500).parse(result.ilink_bot_id),owner=z.string().min(1).max(500).parse(result.ilink_user_id),a=this.get(id),config=JSON.parse(a.config) as Config
     if(this.db.get('SELECT id FROM im_accounts WHERE bot_id=? AND id<>?',bot,id))throw Error('该微信已绑定到另一个账号配置')
     config.enabled=true;if(!config.account.trim())config.account=owner
     this.db.db.transaction(()=>{
      if(a.bot_id&&a.bot_id!==bot){this.db.db.run('DELETE FROM im_conversations WHERE account_id=?',[id]);this.db.db.run('DELETE FROM im_inbox WHERE account_id=?',[id]);this.db.db.run('DELETE FROM im_outbox WHERE account_id=?',[id])}
      this.db.db.run('UPDATE im_accounts SET config=?,secret=?,bot_id=?,owner_id=?,base_url=?,cursor=?,status=\'connected\',error=NULL WHERE id=?',[JSON.stringify(config),encryptSecret(token),bot,owner,weixinBase(result.baseurl??WEIXIN_BASE),a.bot_id===bot?a.cursor:'',id])
     })();delete l.image;this.connect(id);return
    }
    if(result.status==='scaned_but_redirect'&&result.redirect_host){base=weixinBase('https://'+result.redirect_host.replace(/^https:\/\//,''))}
    if(['expired','verify_code_blocked','binded_redirect'].includes(result.status))return
    await delay(1000,l.controller.signal)
   }
   l.status='expired';delete l.image
  }catch(e){if(!l.controller.signal.aborted){l.status='error';l.error=e instanceof z.ZodError?'微信登录响应无效':e instanceof Error?e.message:'微信登录失败'}}
 }
 private allowed(a:Account,peer:string){const c=JSON.parse(a.config) as Config;return c.enabled&&(c.scope==='仅允许私聊'||c.account.split(/[\s,，]+/).includes(peer))}
 private connect(id:string){if(this.closed||this.loops.has(id))return;this.paused.delete(id);const controller=new AbortController();const loop={controller,done:Promise.resolve()};this.loops.set(id,loop);loop.done=this.poll(id,controller.signal).finally(()=>{if(this.loops.get(id)===loop)this.loops.delete(id)})}
 private async poll(id:string,signal:AbortSignal){
  while(!signal.aborted){try{
   const a=this.get(id),token=decryptSecret(a.secret!);const result=await this.api.updates(a.base_url,token,a.cursor,signal);signal.throwIfAborted()
   this.db.db.transaction(()=>{for(const m of result.msgs)this.ingest(a,m);this.db.db.run("UPDATE im_accounts SET cursor=?,status='connected',error=NULL WHERE id=?",[result.get_updates_buf||a.cursor,id])})();await delay(250,signal)
  }catch(e){if(signal.aborted)return;this.db.db.run("UPDATE im_accounts SET status='error',error=? WHERE id=?",[e instanceof z.ZodError?'微信消息格式不受支持':e instanceof Error?e.message:'微信连接失败',id]);if(e instanceof WeixinError&&e.code===-14)return;await delay(5000,signal)}}
 }
 private ingest(a:Account,m:WeixinUpdate){
  if(m.group_id||m.message_type!==1||m.message_state!==undefined&&m.message_state!==2||!m.context_token||!this.allowed(a,m.from_user_id))return
  const text=(m.item_list??[]).map(i=>i.type===1?i.text_item?.text:i.type===3?i.voice_item?.text:undefined).filter(Boolean).join('\n')
  this.db.db.run('INSERT OR IGNORE INTO im_inbox(account_id,message_id,peer,text,context_token,request_id,created_at) VALUES(?,?,?,?,?,?,?)',[a.id,String(m.message_id),m.from_user_id,text.slice(0,50000),m.context_token,crypto.randomUUID(),Date.now()])
 }
 private queue(aid:string,peer:string,context:string,key:string,text:string){
  // Stable IDs + no automatic resend after an uncertain network outcome.
  if(this.db.get('SELECT 1 FROM im_outbox WHERE account_id=? AND peer=? AND source_key=?',aid,peer,key+':0'))return
  const chunks=Array.from(text).reduce<string[]>((out,c,i)=>{const n=Math.floor(i/1800);out[n]=(out[n]??'')+c;return out},[])
  for(const [i,chunk] of chunks.entries())this.db.db.run('INSERT OR IGNORE INTO im_outbox VALUES(?,?,?,?,?,?,\'pending\',NULL,?)',[crypto.randomUUID(),aid,peer,context,key+':'+i,chunk,Date.now()])
 }
 private tick(){if(this.closed||this.pumping)return;this.pumping=this.pump().catch(()=>{if(!this.closed)this.db.db.run("UPDATE im_accounts SET error='IM 消息处理失败，请检查配置并重新启用' WHERE secret IS NOT NULL")}).finally(()=>{this.pumping=undefined})}
 private async pump(){
  this.collect()
  for(const item of this.db.all<Inbox>("SELECT * FROM im_inbox WHERE state='pending' ORDER BY CASE WHEN substr(text,1,1)='/' THEN 0 ELSE 1 END,created_at,rowid LIMIT 50")){if(this.closed)return;await this.consume(item)}
  this.collect()
  for(const item of this.db.all<Outbox>("SELECT * FROM im_outbox WHERE state='pending' ORDER BY created_at LIMIT 20")){
   if(this.closed)return;const a=this.get(item.account_id);if(this.paused.has(a.id)||!this.allowed(a,item.peer)||!a.secret)continue
   this.db.db.run("UPDATE im_outbox SET state='sending' WHERE id=?",[item.id])
   try{await this.api.send(a.base_url,decryptSecret(a.secret),item.peer,item.context_token,item.id,item.text,this.controller.signal);this.db.db.run("UPDATE im_outbox SET state='sent',error=NULL WHERE id=?",[item.id])}
   catch(e){this.db.db.run("UPDATE im_outbox SET state=?,error=? WHERE id=?",[e instanceof WeixinError?'failed':'uncertain',e instanceof Error?e.message:'发送失败',item.id])}
  }
 }
 private async consume(item:Inbox){
  if(this.paused.has(item.account_id))return
  if(!this.db.get("SELECT 1 FROM im_inbox WHERE account_id=? AND message_id=? AND state='pending'",item.account_id,item.message_id))return
  const a=this.get(item.account_id);if(!this.allowed(a,item.peer)){this.db.db.run("UPDATE im_inbox SET state='ignored' WHERE account_id=? AND message_id=?",[a.id,item.message_id]);return}
  let c=this.db.get<Conversation>('SELECT * FROM im_conversations WHERE account_id=? AND peer=?',a.id,item.peer)
  const command=item.text.trim(),isCommand=command.startsWith('/')
  if(!isCommand&&c?.session_id&&this.core.active.has(c.session_id))return
  this.db.db.run("UPDATE im_inbox SET state='processing' WHERE account_id=? AND message_id=?",[a.id,item.message_id])
  this.db.db.run('INSERT INTO im_conversations VALUES(?,?,NULL,?) ON CONFLICT(account_id,peer) DO UPDATE SET context_token=excluded.context_token',[a.id,item.peer,item.context_token])
  const reply=(text:string)=>this.queue(a.id,item.peer,item.context_token,'in:'+item.message_id,text)
  const cancelQueued=()=>this.db.db.run("UPDATE im_inbox SET state='cancelled' WHERE account_id=? AND peer=? AND state='pending' AND rowid<(SELECT rowid FROM im_inbox WHERE account_id=? AND message_id=?)",[a.id,item.peer,a.id,item.message_id])
  try{
   if(!item.text){reply('目前支持文字消息，请发送文字。');return}
   if(command==='/帮助'||command==='/help'){reply('/新会话：开始新的对话\n/停止：停止当前任务\n/允许 <请求ID>：仅允许这一次\n/会话允许 <请求ID>：记住本会话相同操作\n/拒绝 <请求ID>：拒绝并停止\n/回答 <问题批次ID> <答案JSON>：完整回答并续跑\n/拒答 <问题批次ID>：拒答并停止');return}
   if(command==='/新会话'||command==='/new'){
    cancelQueued()
    if(c?.session_id)this.core.stop(c.session_id)
    this.db.db.run('UPDATE im_conversations SET session_id=NULL WHERE account_id=? AND peer=?',[a.id,item.peer]);reply('已开始新会话。');return
   }
   if(isCommand){
    if(!c?.session_id)throw Error('当前没有会话')
    const session=this.db.session<Session>(c.session_id);if(!session)throw Error('会话已删除')
    if(command==='/停止'||command==='/stop'){cancelQueued();this.core.stop(c.session_id);reply('已停止；已完成的操作不会回滚。');return}
    const match=command.match(/^\/(允许|会话允许|拒绝|拒答|回答)\s+([\w-]+)(?:\s+([\s\S]+))?$/)
    if(!match)throw Error('命令无效，发送 /帮助 查看用法')
    const [,action,id,value]=match
    if(['允许','会话允许','拒绝'].includes(action)){
     if(session.permissionRequest?.id!==id)throw Error('授权请求已失效或不属于当前会话')
     this.core.decidePermission(c.session_id,id,action!=='拒绝',action==='会话允许'?'session':'once');reply(action==='拒绝'?'已拒绝并停止。':'已授权，继续执行。')
    }else{
     if(session.questionRequest?.id!==id)throw Error('问题已失效或不属于当前会话')
     if(action==='拒答'){this.core.questions.refuse(c.session_id,id);reply('已拒答并停止。')}
     else{if(!value)throw Error('请提供完整答案 JSON');let answers:unknown;try{answers=JSON.parse(value)}catch{throw Error('答案 JSON 格式不正确')};await this.core.answerQuestion(c.session_id,id,answers);reply('已收到回答，继续执行。')}
    }
    return
   }
   if(!c?.session_id){
    const id=crypto.randomUUID(),session:Session={id,title:'微信 · '+item.text.slice(0,25),context:{workspace:this.core.workspace,agent:'Ailya',model:this.core.preferredModel(),permission:'default'},messages:[],group:'今天'}
    this.db.db.transaction(()=>{this.db.saveSession(session);this.db.db.run('UPDATE im_conversations SET session_id=? WHERE account_id=? AND peer=?',[id,a.id,item.peer])})();c={account_id:a.id,peer:item.peer,session_id:id,context_token:item.context_token}
   }
   const session=this.db.session<Session>(c.session_id!)!
   this.core.send(session.id,{requestId:item.request_id,text:item.text,context:{...session.context,permission:'default'}})
  }catch(e){reply(e instanceof z.ZodError?'输入格式不正确':e instanceof Error?e.message:'消息处理失败')}
  finally{this.db.db.run("UPDATE im_inbox SET state='handled' WHERE account_id=? AND message_id=?",[a.id,item.message_id])}
 }
 private collect(){
  if(!this.dirty)return;this.dirty=false
  for(const c of this.db.all<Conversation>('SELECT * FROM im_conversations WHERE session_id IS NOT NULL')){
   if(this.paused.has(c.account_id))continue
   const a=this.get(c.account_id);if(!this.allowed(a,c.peer))continue
   const s=this.db.session<Session>(c.session_id!);if(!s)continue
   const emit=(key:string,text:string)=>this.queue(a.id,c.peer,c.context_token,key,text)
   const p=s.permissionRequest
   if(p)emit('permission:'+p.id,`需要授权：${p.tool}\n${p.action}\n\n/允许 ${p.id}\n/会话允许 ${p.id}\n/拒绝 ${p.id}`)
   const q=s.questionRequest
   if(q&&['pending','timed_out','interrupted'].includes(q.status)){
    const example=Object.fromEntries(q.questions.map(item=>[item.id,{selected:[],text:item.kind==='text'||item.kind==='mixed'?'填写回答':''}]))
    emit('question:'+q.id,`${q.agent} 需要回答：\n${q.questions.map(item=>`${item.id}：${item.title}${item.options?'\n选项：'+item.options.join(' / '):''}`).join('\n\n')}\n\n30 秒后停止等待，之后完整回答仍可续跑。将选择项填入 selected，文字填入 text：\n/回答 ${q.id} ${JSON.stringify(example)}\n/拒答 ${q.id}`)
   }
   // Every completed message has an immutable delivery key. Question timeout is not a final answer.
   for(const m of s.messages.filter(m=>m.role==='assistant'&&!m.executing)){
    if(q&&q.taskId&&['pending','timed_out','interrupted'].includes(q.status)&&m===s.messages.at(-1))continue
    emit('reply:'+m.id+(m.stopped?':stopped':''),[m.text,m.error?'执行失败：'+m.error:'',m.stopped?'任务已停止。':''].filter(Boolean).join('\n')||'任务已结束。')
   }
  }
 }
 private async disconnect(id:string,cancel:boolean){
  this.paused.add(id)
  const loop=this.loops.get(id);loop?.controller.abort();await loop?.done
  // Finish the currently owned pump before editing account state or removing rows.
  await this.pumping
  if(cancel){for(const c of this.db.all<Conversation>('SELECT * FROM im_conversations WHERE account_id=?',id))if(c.session_id)this.core.stop(c.session_id);this.db.db.run("UPDATE im_inbox SET state='cancelled' WHERE account_id=? AND state='pending'",[id]);this.db.db.run("UPDATE im_outbox SET state='cancelled' WHERE account_id=? AND state='pending'",[id])}
 }
 async close(){this.closed=true;this.core.listeners.delete(this.onChange);clearInterval(this.timer);this.controller.abort();for(const l of this.loops.values())l.controller.abort();for(const l of this.logins.values())l.controller.abort();await Promise.all([...this.loops.values(),...this.logins.values()].map(l=>l.done));await this.pumping}
}
