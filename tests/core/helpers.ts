import {startServer} from '../../core/server'
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import type {Session} from '../../core/contracts'
export const packet=(delta:unknown,finish:string|null=null)=>`data: ${JSON.stringify({id:'script',object:'chat.completion.chunk',created:1,model:'test',choices:[{index:0,delta,finish_reason:finish}]})}\n\n`
export const sse=(delta:unknown,finish='stop')=>new Response(packet({role:'assistant',...delta as object})+packet({},finish)+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}})
export const call=(name:string,args:unknown,id='call1')=>sse({tool_calls:[{index:0,id,type:'function',function:{name,arguments:JSON.stringify(args)}}]},'tool_calls')
export const input=(text='hello')=>({requestId:crypto.randomUUID(),text,context:{workspace:'Ailya',agent:'Ailya',model:'["test","test"]',permission:'default'}})
export const post=(url:string,data:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
export type App=ReturnType<typeof startServer>
export const settle=(app:App)=>Promise.all([...app.core.active.values()].map(x=>x.done))
export function waitSession(app:App,id:string,predicate:(session:Session|undefined)=>boolean){
 return new Promise<Session>((resolve,reject)=>{
  const cleanup=()=>{clearTimeout(timer);app.core.listeners.delete(check)}
  const check=()=>{const s=app.core.storage.session<Session>(id);if(predicate(s)){cleanup();resolve(s!)}}
  const timer=setTimeout(()=>{cleanup();reject(Error('Timed out waiting for Core state'))},5000)
  app.core.listeners.add(check);check()
 })
}
export async function withCore(run:(app:App,url:string,workspace:string,root:string)=>Promise<void>,handler:(req:Request)=>Response|Promise<Response>){
 const root=mkdtempSync(join(tmpdir(),'ailya-phase2-')),workspace=join(root,'workspace');mkdirSync(workspace)
 const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:handler})
 const app=startServer({dataPath:join(root,'db.sqlite'),workspace,port:0})
 app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
 try{await run(app,`http://127.0.0.1:${app.server.port}`,workspace,root)}finally{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
}
