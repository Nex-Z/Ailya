import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {strict as assert} from 'node:assert'
import {packet} from '../../tests/core/helpers'
const root=mkdtempSync(join(tmpdir(),'ailya-runtime-')),workspace=join(root,'workspace');mkdirSync(workspace)
const reserved=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response('reserved')}),port=reserved.port!;await reserved.stop(true)
const env={...process.env,AILYA_DATA_DIR:join(root,'data'),AILYA_WORKSPACE:workspace,AILYA_PORT:String(port)},url=`http://127.0.0.1:${port}`
const run=async(action:string)=>{const proc=Bun.spawn([process.execPath,'scripts/runtime.ts',action],{env,stdout:'pipe',stderr:'pipe'});const [code,out,err]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);return {code,out,err}}
const post=(path:string,data:unknown)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(packet({role:'assistant',content:'RUNNING'})))}}),{headers:{'Content-Type':'text/event-stream'}})})
try{
 const started=await run('start');assert.equal(started.code,0,started.err);const first=await(await fetch(url+'/api/health')).json();assert(first.web);assert.equal(first.service,'ailya-core');assert((await(await fetch(url)).text()).includes('/assets/'))
 assert.equal((await run('start')).code,0);assert.equal((await(await fetch(url+'/api/health')).json()).pid,first.pid)
 await post('/api/providers',{id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
 assert.equal((await post('/api/sessions/busy/send',{requestId:crypto.randomUUID(),text:'stay busy',context:{workspace:'Ailya',agent:'Ailya',model:'["test","test"]',permission:'default'}})).status,202)
 assert.notEqual((await run('stop')).code,0);await post('/api/sessions/busy/stop',{})
 for(let i=0;i<100;i++){const snapshot=await(await fetch(url+'/api/snapshot')).json();if(!snapshot.sessions[0]?.messages.at(-1)?.executing)break;await Bun.sleep(50)}
 assert.equal((await run('stop')).code,0);assert((await run('status')).out.includes('"running":false'))
 const restarted=await run('start');assert.equal(restarted.code,0,restarted.err);const second=await(await fetch(url+'/api/health')).json();assert.notEqual(first.pid,second.pid);const snapshot=await(await fetch(url+'/api/snapshot')).json();assert.equal(snapshot.sessions.length,1);assert(snapshot.sessions[0].messages.at(-1).stopped)
 assert.equal((await run('stop')).code,0)
 const foreign=Bun.serve({hostname:'127.0.0.1',port,fetch:()=>Response.json({service:'another-service'})});try{assert.notEqual((await run('stop')).code,0);assert.equal((await fetch(url)).status,200)}finally{await foreign.stop(true)}
 console.log(JSON.stringify({start:true,staticWeb:true,idempotent:true,busyStopRejected:true,stop:true,restartData:true,foreignPortProtected:true}))
}finally{await run('stop');await provider.stop(true);rmSync(root,{recursive:true,force:true})}
