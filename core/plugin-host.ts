import {spawn,execFile,type ChildProcess} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
export class PluginHost{
 private child:ChildProcess
 private sequence=0
 private pending=new Map<number,{resolve:(value:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>;off:()=>void}>()
 private ending=false
 private closed?:Promise<void>
 constructor(cwd:string){
  const env=Object.fromEntries(Object.entries(process.env).filter(([key,value])=>value!==undefined&&/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|COMSPEC|LANG|LC_ALL|APPDATA|LOCALAPPDATA)$/i.test(key)))
  this.child=spawn(process.execPath,[fileURLToPath(new URL('./plugin-worker.ts',import.meta.url))],{cwd,env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']})
  this.child.on('message',(raw:unknown)=>{const m=raw as {id:number;ok:boolean;value:unknown;error:string};const pending=this.pending.get(m.id);if(!pending)return;clearTimeout(pending.timer);pending.off();this.pending.delete(m.id);if(m.ok)pending.resolve(m.value);else pending.reject(Error(m.error||'插件执行失败'))})
  this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>this.fail(Error('插件进程已退出')))
 }
 private fail(error:Error){this.ending=true;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.off();pending.reject(error)}this.pending.clear()}
 request<T>(body:unknown,signal?:AbortSignal,timeout=60000):Promise<T>{
  signal?.throwIfAborted();if(this.ending)throw Error('插件进程已关闭')
  return new Promise<T>((resolve,reject)=>{
   const id=++this.sequence,abort=()=>{const pending=this.pending.get(id);if(pending){clearTimeout(pending.timer);pending.off();this.pending.delete(id)}void this.close().then(()=>reject(Error(signal?.aborted?'插件调用已停止；已完成的外部操作不会回滚':'插件执行超时；已完成的外部操作不会回滚')))}
   const timer=setTimeout(abort,timeout),off=()=>signal?.removeEventListener('abort',abort)
   this.pending.set(id,{resolve:v=>resolve(v as T),reject,timer,off});signal?.addEventListener('abort',abort,{once:true})
   this.child.send({id,body},error=>{if(error)this.fail(error)})
  })
 }
 close(){return this.closed??=this.terminate()}
 private async terminate(){
  this.ending=true
  const pid=this.child.pid
  if(pid&&this.child.exitCode===null){
   if(process.platform==='win32')await new Promise<void>(resolve=>execFile(join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:5000},()=>resolve()))
   else this.child.kill('SIGKILL')
  }
  this.fail(Error('插件进程已关闭；已完成的外部操作不会回滚'))
 }
}
