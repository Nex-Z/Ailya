import {Type} from 'typebox'
import type {AgentTool} from '@earendil-works/pi-agent-core'
import type {Storage} from './storage'
import {answerText,questionBatchSchema,validateAnswers,type QuestionRequest,type Answers} from './question-contracts'
export type QuestionRow={id:string;session_id:string;task_id:string;owner_session_id:string;tool_call_id:string;data:string}
const open=(q:QuestionRequest)=>['pending','timed_out','interrupted'].includes(q.status)
export class Questions{
 private waiting=new Map<string,{resolve:(text:string)=>void;reject:(error:Error)=>void;cleanup:()=>void}>()
 constructor(private storage:Storage,private changed:(row:QuestionRow,q:QuestionRequest)=>void,private halt:(owner:string)=>void){}
 get(id:string){const row=this.storage.get<QuestionRow>('SELECT * FROM question_batches WHERE id=?',id);if(!row)throw Error('问题批次不存在');return {row,q:JSON.parse(row.data) as QuestionRequest}}
 forOwner(id:string){return this.storage.all<QuestionRow>('SELECT * FROM question_batches WHERE owner_session_id=?',id).filter(r=>open(JSON.parse(r.data)))}
 private save(row:QuestionRow,q:QuestionRequest){this.storage.db.transaction(()=>{this.storage.db.run('UPDATE question_batches SET data=? WHERE id=?',[JSON.stringify(q),row.id]);this.changed(row,q)})()}
 recover(){for(const row of this.storage.all<QuestionRow>('SELECT * FROM question_batches')){const q=JSON.parse(row.data) as QuestionRequest;if(q.status==='pending'){q.status=Date.now()>=q.deadlineAt?'timed_out':'interrupted';this.save(row,q)}}}
 expire(id:string,now=Date.now()){
  const {row,q}=this.get(id);if(q.status!=='pending'||now<q.deadlineAt)return
  q.status='timed_out';this.save(row,q);this.halt(row.owner_session_id)
 }
 cancel(owner:string,status:'cancelled'|'refused'='cancelled'){
  for(const row of this.forOwner(owner)){const q=JSON.parse(row.data) as QuestionRequest;q.status=status;this.save(row,q)}
 }
 draft(owner:string,id:string,input:unknown,revision:number){
  const {row,q}=this.get(id);if(row.owner_session_id!==owner||!open(q))throw Error('问题已失效')
  if(q.revision!==revision)throw Error('回答已在其他窗口修改，请刷新后重试')
  q.drafts=validateAnswers(q,input,false);q.revision++;this.save(row,q);return q
 }
 answer(owner:string,id:string,input:unknown){
  const {row,q}=this.get(id);if(row.owner_session_id!==owner)throw Error('问题不属于该会话')
  const answers=validateAnswers(q,input,true)
  if(q.status==='answered'){
   if(answerText(q,answers)!==answerText(q,q.drafts))throw Error('问题已经提交，不能改写回答')
   return {row,q,duplicate:true,live:false}
  }
  if(!open(q))throw Error('问题已失效')
  const waiter=this.waiting.get(id),live=q.status==='pending'&&!!waiter
  q.drafts=answers;q.status='answered';q.revision++;this.save(row,q)
  if(live){waiter.cleanup();waiter.resolve(answerText(q,answers))}
  return {row,q,duplicate:false,live}
 }
 refuse(owner:string,id:string){const {row,q}=this.get(id);if(row.owner_session_id!==owner)throw Error('问题不属于该会话');if(q.status==='refused')return;if(!open(q))throw Error('问题已失效');q.status='refused';this.save(row,q);this.halt(owner)}
 tool(sessionId:string,taskId:string,owner:string,agent:string,startedAt:number,checkpoint:()=>void):AgentTool{
  const parameters=Type.Object({questions:Type.Array(Type.Object({id:Type.String(),title:Type.String(),kind:Type.Union(['choice','multiple','text','mixed'].map(v=>Type.Literal(v))),options:Type.Optional(Type.Array(Type.String())),recommendedOptions:Type.Optional(Type.Array(Type.String()))}),{minItems:1,maxItems:8})})
  return {name:'ask_questions',label:'询问用户',description:'Ask the user a batch of questions and wait for all answers. choice is single select, multiple is multi select, text is free text, mixed is single select plus optional text (free text alone is allowed). Recommendations never select an answer. A batch shares a 30 second deadline; execution stops on timeout and resumes only after answers. Never repeat completed operations on continuation. Call this tool alone in its assistant turn.',parameters,execute:async(callId,args,signal)=>{
   signal?.throwIfAborted();const {questions}=questionBatchSchema.parse(args)
   if(this.forOwner(owner).length)throw Error('主会话已有未回答问题')
   const id=crypto.randomUUID(),createdAt=Date.now(),q:QuestionRequest={id,taskId,toolCallId:callId,agent,questions,createdAt,deadlineAt:createdAt+30000,startedAt,status:'pending',drafts:{},revision:0}
   const row:QuestionRow={id,session_id:sessionId,task_id:taskId,owner_session_id:owner,tool_call_id:callId,data:JSON.stringify(q)}
   checkpoint()
   this.storage.db.run('INSERT INTO question_batches VALUES(?,?,?,?,?,?)',[id,sessionId,taskId,owner,callId,row.data])
   const text=await new Promise<string>((resolve,reject)=>{
    const timer=setTimeout(()=>this.expire(id),Math.max(0,q.deadlineAt-Date.now()))
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.waiting.delete(id)}
    const abort=()=>{cleanup();reject(Error('提问执行已停止；已完成操作未回滚'))}
    this.waiting.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',abort,{once:true})
    this.changed(row,q);if(signal?.aborted)abort()
   })
   return {content:[{type:'text',text}],details:{questionBatchId:id}}
  }}
 }
}
export type {Answers}
