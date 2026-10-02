import {z} from 'zod'
import type {Storage} from './storage'
import type {PermissionRequest} from './contracts'
export const policySchema=z.object({allowlist:z.string().max(16000)}).strict().superRefine((v,ctx)=>{
 const patterns=v.allowlist.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
 if(patterns.length>50)ctx.addIssue({code:'custom',message:'最多 50 条白名单规则'})
 for(const pattern of patterns){try{if(pattern.length>512)throw Error();new RegExp(pattern)}catch{ctx.addIssue({code:'custom',message:'白名单正则无效或过长'})}}
})
export class Permissions {
 waiters=new Map<string,{sessionId:string;resolve:(allowed:boolean)=>void}>()
 constructor(private storage:Storage){storage.db.run("UPDATE permission_requests SET state='cancelled',resolved_at=? WHERE state='pending'",[Date.now()])}
 policy(){return {allowlist:this.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='allowlist'")?.value??''}}
 save(input:unknown){const config=policySchema.parse(input);this.storage.db.run("INSERT INTO core_settings VALUES('allowlist',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[config.allowlist]);return config}
 async matches(action:string,signal?:AbortSignal){
  const patterns=this.policy().allowlist.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)
  if(!patterns.length)return false
  return new Promise<boolean>(resolve=>{
   const worker=new Worker(new URL('./allowlist-worker.ts',import.meta.url).href)
   const finish=(result:boolean)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();resolve(result)}
   const abort=()=>finish(false),timer=setTimeout(()=>finish(false),200)
   worker.onmessage=event=>finish(event.data===true);worker.onerror=()=>finish(false)
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){finish(false);return}
   worker.postMessage({patterns,action})
  })
 }
 async request(sessionId:string,taskId:string,toolCallId:string,tool:string,args:Record<string,unknown>,action:string,signal:AbortSignal|undefined,show:(request:PermissionRequest|undefined)=>void){
  signal?.throwIfAborted()
  const automatic=await this.matches(action,signal);signal?.throwIfAborted()
  const request:PermissionRequest={id:crypto.randomUUID(),tool,toolCallId,taskId,args,action,createdAt:Date.now()}
  this.storage.db.run('INSERT INTO permission_requests(id,session_id,task_id,tool_call_id,tool,args,action,state,created_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[request.id,sessionId,taskId,toolCallId,tool,JSON.stringify(args),action,automatic?'automatic':'pending',request.createdAt,automatic?Date.now():null])
  if(automatic)return
  let abort:()=>void=()=>{}
  const answer=new Promise<boolean>(resolve=>{
   this.waiters.set(request.id,{sessionId,resolve})
   abort=()=>{this.storage.db.run("UPDATE permission_requests SET state='cancelled',resolved_at=? WHERE id=? AND state='pending'",[Date.now(),request.id]);resolve(false)}
   signal?.addEventListener('abort',abort,{once:true})
  })
  show(request)
  try{const allowed=await answer;signal?.throwIfAborted();if(!allowed)throw Error('用户拒绝了工具执行')}finally{signal?.removeEventListener('abort',abort);this.waiters.delete(request.id);show(undefined)}
 }
 decide(sessionId:string,id:string,allowed:boolean){
  const row=this.storage.get<{session_id:string;state:string}>('SELECT session_id,state FROM permission_requests WHERE id=?',id)
  if(!row||row.session_id!==sessionId)throw Error('授权请求不存在')
  const state=allowed?'allowed':'denied'
  if(row.state===state)return {ok:true}
  if(row.state!=='pending')throw Error('授权请求已失效')
  const waiter=this.waiters.get(id)
  if(!waiter||waiter.sessionId!==sessionId)throw Error('执行已结束，授权请求已失效')
  const updated=this.storage.db.run("UPDATE permission_requests SET state=?,resolved_at=? WHERE id=? AND state='pending'",[state,Date.now(),id])
  if(updated.changes!==1)throw Error('授权请求已处理')
  waiter.resolve(allowed);return {ok:true}
 }
}
