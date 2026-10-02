import {test,expect} from 'bun:test'
import {mkdirSync,writeFileSync,readFileSync,existsSync,symlinkSync,unlinkSync} from 'node:fs'
import {join} from 'node:path'
import {withCore,input,post,settle,sse,call,waitSession} from './helpers'
import type {Session} from '../../core/contracts'
export function pluginFixture(root:string,marker='PLUGIN-73'){
 const dir=join(root,'plugin-source');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'package.json'),JSON.stringify({name:'ailya-test-plugin',version:'1.0.0',pi:{extensions:['index.ts']}}))
 writeFileSync(join(dir,'index.ts'),`import {writeFileSync} from 'node:fs';import {join} from 'node:path';export default function(pi){pi.registerTool({name:'receipt',label:'Receipt',description:'Write a plugin receipt into the workspace.',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false},async execute(id,args,signal,update,ctx){writeFileSync(join(ctx.cwd,args.path),${JSON.stringify(marker)});return {content:[{type:'text',text:'WROTE RECEIPT'}],details:{pid:process.pid}}}})}`)
 return dir
}
export async function install(app:Parameters<Parameters<typeof withCore>[0]>[0],base:string,path:string,id=crypto.randomUUID()){
 const response=await post(base+'/api/plugins',{id,kind:'本地路径',source:path,enabled:true,trusted:true});expect(response.status).toBe(202);await app.core.plugins.jobs.get(id)
 const row=app.core.plugins.get(id)!;expect(row.error).toBeNull();expect(row.active_version).toBeTruthy();return row
}
test('local plugin installs through Pi, tools execute in owned process, persist real diffs and keep versions on failed updates',async()=>{
 let pluginId='',n=0
 await withCore(async(app,base,workspace,root)=>{
  const path=pluginFixture(root),p=await install(app,base,path);pluginId=p.id
  expect(app.core.plugins.list()[0].tools[0].name).toBe('receipt')
  await post(base+'/api/sessions/plugin/send',{...input('Write a receipt using the plugin'),context:{...input().context,permission:'full'}});await settle(app)
  expect(readFileSync(join(workspace,'receipt.txt'),'utf8')).toBe('PLUGIN-73');expect(app.core.storage.session<Session>('plugin')!.messages.at(-1)!.fileChanges?.some(f=>f.path.endsWith('receipt.txt')&&f.added===1)).toBe(true)
  const version=p.active_version;writeFileSync(join(path,'index.ts'),"export default pi=>{pi.on('session_start',()=>{})}")
  await post(base+`/api/plugins/${p.id}/action`,{action:'update',trusted:true});await app.core.plugins.jobs.get(p.id)
  expect(app.core.plugins.get(p.id)!.error).toContain('暂不兼容');expect(app.core.plugins.get(p.id)!.active_version).toBe(version)
  await post(base+`/api/plugins/${p.id}/action`,{action:'reload',trusted:true});await app.core.plugins.jobs.get(p.id);expect(app.core.plugins.get(p.id)!.error).toBeNull()
  expect(app.core.storage.all('SELECT * FROM task_plugins')).toHaveLength(1)
  await fetch(base+'/api/plugins/'+p.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'});expect(app.core.plugins.list()).toHaveLength(0);expect(existsSync(path)).toBe(true);expect(app.core.storage.all('SELECT * FROM plugin_versions')).toHaveLength(1)
 },()=>++n===1?call('plugin_list_tools',{}):n===2?call('plugin_call_tool',{pluginId,name:'receipt',arguments:{path:'receipt.txt'}}):sse({content:'DONE'}))
},20000)

test('disabling during approval blocks execution; invalid arguments fail before tool body and cached file reload needs no source',async()=>{
 let pluginId='',n=0,invalid=false
 await withCore(async(app,base,workspace,root)=>{
  const dir=pluginFixture(root),path=join(dir,'index.ts'),p=await install(app,base,path);pluginId=p.id
  await post(base+'/api/sessions/disabled/send',input('run plugin'));const s=await waitSession(app,'disabled',s=>!!s?.permissionRequest)
  app.core.plugins.setEnabled(pluginId,false);await post(base+`/api/sessions/disabled/permissions/${s.permissionRequest!.id}`,{allow:true});await settle(app);expect(existsSync(join(workspace,'receipt.txt'))).toBe(false)
  app.core.plugins.setEnabled(pluginId,true);invalid=true;n=0
  await post(base+'/api/sessions/invalid/send',{...input('run invalid'),context:{...input().context,permission:'full'}});await settle(app);expect(existsSync(join(workspace,'receipt.txt'))).toBe(false)
  const events=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'").map(r=>JSON.parse(r.data));expect(events.filter(e=>e.toolName==='plugin_call_tool'&&e.isError)).toHaveLength(2)
  unlinkSync(path);expect((await post(base+`/api/plugins/${pluginId}/action`,{action:'reload',trusted:true})).status).toBe(202);await app.core.plugins.jobs.get(pluginId);expect(app.core.plugins.get(pluginId)!.error).toBeNull()
 },()=>++n===1?call('plugin_call_tool',{pluginId,name:'receipt',arguments:invalid?{}:{path:'receipt.txt'}}):sse({content:'DONE'}))
},20000)
test('trust confirmation, default authorization and Agent tool limits prevent plugin execution',async()=>{
 let pluginId='',mode='call'
 await withCore(async(app,base,workspace,root)=>{
  const path=pluginFixture(root);expect((await post(base+'/api/plugins',{id:crypto.randomUUID(),kind:'本地路径',source:path,enabled:true})).status).toBe(400)
  const p=await install(app,base,path);pluginId=p.id
  await post(base+'/api/sessions/denied/send',input('run plugin'));const s=await waitSession(app,'denied',s=>!!s?.permissionRequest)
  expect(existsSync(join(workspace,'receipt.txt'))).toBe(false);await post(base+`/api/sessions/denied/permissions/${s.permissionRequest!.id}`,{allow:false});await settle(app);expect(existsSync(join(workspace,'receipt.txt'))).toBe(false)
  app.core.catalog.save('agents',{id:'restricted',name:'Restricted',model:'默认模型',skills:[],tools:[],prompt:'no plugin'});mode='restricted'
  await post(base+'/api/sessions/restricted/send',{...input('hello'),context:{...input().context,agent:'Restricted'}});await settle(app)
  expect(app.core.storage.all('SELECT * FROM task_plugins')).toHaveLength(1)
  const escape=join(root,'outside');mkdirSync(escape);symlinkSync(escape,join(path,'escape'),'junction');await post(base+`/api/plugins/${p.id}/action`,{action:'update',trusted:true});await app.core.plugins.jobs.get(p.id);expect(app.core.plugins.get(p.id)!.error).toContain('符号链接')
 },async req=>{const body=await req.json();if(mode==='restricted'){expect(body.tools.some((t:{function:{name:string}})=>t.function.name==='plugin_call_tool')).toBe(false);return sse({content:'OK'})}return call('plugin_call_tool',{pluginId,name:'receipt',arguments:{path:'receipt.txt'}})})
},20000)
test('stop kills a plugin process and its delayed child before any late file write',async()=>{
 let pluginId=''
 await withCore(async(app,base,workspace,root)=>{
  const path=pluginFixture(root)
  writeFileSync(join(path,'index.ts'),`import {writeFileSync} from 'node:fs';import {join} from 'node:path';import {spawn} from 'node:child_process';export default pi=>pi.registerTool({name:'slow',label:'Slow',description:'Slow fixture',parameters:{type:'object',properties:{}},async execute(id,args,signal,update,ctx){spawn(process.execPath,['-e',"setTimeout(()=>require('node:fs').writeFileSync('late.txt','BAD'),1800)"],{cwd:ctx.cwd,windowsHide:true,stdio:'ignore'});writeFileSync(join(ctx.cwd,'started.txt'),'STARTED');await new Promise(r=>setTimeout(r,30000));return {content:[{type:'text',text:'done'}],details:{}}}})`)
  pluginId=(await install(app,base,path)).id
  await post(base+'/api/sessions/stop/send',{...input('slow plugin'),context:{...input().context,permission:'full'}})
  for(let i=0;i<400&&!existsSync(join(workspace,'started.txt'));i++)await Bun.sleep(20)
  if(!existsSync(join(workspace,'started.txt')))console.log(JSON.stringify(app.core.storage.session('stop')));expect(existsSync(join(workspace,'started.txt'))).toBe(true);await post(base+'/api/sessions/stop/stop',{});await settle(app);await Bun.sleep(2100)
  expect(existsSync(join(workspace,'late.txt'))).toBe(false);expect(app.core.storage.session<Session>('stop')!.messages.at(-1)!.stopped).toBe(true)
 },()=>call('plugin_call_tool',{pluginId,name:'slow',arguments:{}}))
},20000)
