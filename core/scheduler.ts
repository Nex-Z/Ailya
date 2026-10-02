import type {Resources,Resource} from './resources'
import {nextRun} from './resources'
import type {Storage} from './storage'

export class Scheduler{
 private timer:ReturnType<typeof setInterval>|undefined
 constructor(private storage:Storage,private resources:Resources,private launch:(sessionId:string,r:Resource,requestId:string)=>string,private clock=Date.now){
  storage.db.run("UPDATE schedule_runs SET status='interrupted',error='Core 重启，未重跑' WHERE status='starting'")
  this.reconcile();this.tick(true)
 }
 start(){this.timer=setInterval(()=>{try{this.tick()}catch(e){console.error('Scheduler:',e instanceof Error?e.message:'failed')}},1000)}
 close(){if(this.timer)clearInterval(this.timer);this.timer=undefined}
 reconcile(){
  for(const row of this.storage.all<{id:string;session_id:string|null}>("SELECT id,session_id FROM schedule_runs WHERE status='running'")){
   const task=this.storage.get<{status:string}>('SELECT status FROM tasks WHERE session_id=? ORDER BY started_at DESC LIMIT 1',row.session_id)
   if(!task)this.storage.db.run("UPDATE schedule_runs SET status='interrupted',error='执行记录不存在，未重跑' WHERE id=?",[row.id])
   if(task&&!['running','stopping'].includes(task.status))this.storage.db.run('UPDATE schedule_runs SET status=? WHERE id=?',[task.status,row.id])
  }
 }
 tick(restarting=false){
  this.reconcile();const now=this.clock()
  for(const row of this.storage.all<{id:string;next_run:number}>("SELECT id,next_run FROM resources WHERE kind='task' AND enabled=1 AND next_run<=?",now)){
   const r=this.resources.get(row.id)!;const missed=restarting||now-row.next_run>60000,id=crypto.randomUUID()
   const claimed=this.storage.db.transaction(()=>{
    const current=this.storage.get<{next_run:number|null}>('SELECT next_run FROM resources WHERE id=? AND enabled=1',row.id)
    if(current?.next_run!==row.next_run)return false
    this.storage.db.run('INSERT INTO schedule_runs(id,resource_id,name,due_at,status,error) VALUES(?,?,?,?,?,?)',[id,r.id,r.name,row.next_run,missed?'missed':'starting',missed?'Core 离线或超过执行窗口，未补跑':null])
    this.storage.db.run('UPDATE resources SET next_run=? WHERE id=?',[r.frequency==='once'?null:nextRun(r,now),r.id]);return true
   })()
   if(!claimed||missed)continue
   const sessionId=crypto.randomUUID()
   try{this.launch(sessionId,r,id);this.storage.db.run("UPDATE schedule_runs SET status='running',session_id=? WHERE id=?",[sessionId,id])}catch(e){this.storage.db.run("UPDATE schedule_runs SET status='failed',error=? WHERE id=?",[e instanceof Error?e.message:'启动失败',id])}
  }
 }
}
