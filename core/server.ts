import type {AttachmentRow} from './attachments'
import {pickWorkspace} from './workspace-picker'
import {Workspaces} from './workspaces'
import { Hono } from 'hono'
import {IM} from './im'
import {Backups,replaceDatabase} from './backups'
import {copyFileSync,existsSync,realpathSync,statSync} from 'node:fs'
import {pluginInput} from './plugins'
import { z } from 'zod'
import {answersSchema} from './question-contracts'
import { Core } from './core'
import {permissionDecisionSchema} from './permissions'
import type { ServerWebSocket } from 'bun'
import { resolve,dirname,relative,isAbsolute,join } from 'node:path'
import { homedir } from 'node:os'
const idSchema=z.string().min(1).max(100).regex(/^[\w-]+$/)
export function startServer(options:{dataPath:string;workspace?:string;port?:number;origins?:string[];staticDir?:string;onShutdown?:()=>void}) {
 let core=new Core(resolve(options.dataPath),options.workspace)
 let workspaces=new Workspaces(core.storage,core.workspace)
 const backups=new Backups(()=>core),instanceId=crypto.randomUUID()
 let maintenance=false,inflight=0,available=true
 const app=new Hono()
 const sockets=new Set<ServerWebSocket<{cursor:number}>>()
 const allowed=new Set(options.origins??['http://127.0.0.1:5173','http://localhost:5173'])
 app.use('*',async(c,next)=>{
  const url=new URL(c.req.url),origin=c.req.header('Origin'),host=c.req.header('Host')?.split(':')[0]
  if(!['127.0.0.1','localhost'].includes(host??'')||(origin&&!allowed.has(origin)&&origin!==url.origin))return c.json({error:'来源未授权'},403)
  if(!['GET','HEAD'].includes(c.req.method)&&!c.req.header('Content-Type')?.startsWith('application/json'))return c.json({error:'需要 JSON 请求'},415)
  if(maintenance)return c.json({error:'Core 正在恢复或关闭，请稍后重试'},503)
  inflight++;try{await next()}finally{inflight--}
 })
 app.onError((error,c)=>c.json({error:error instanceof z.ZodError?'请求格式不正确':error.message},400))
 app.use('/api/sessions/:id/*',async(c,next)=>{
  if(c.req.method!=='GET'&&core.storage.session<{parentSessionId?:string}>(c.req.param('id')!)?.parentSessionId)return c.json({error:'子 Agent 会话只读，请从主会话操作'},403)
  await next()
 })
 app.get('/api/health',c=>c.json({ok:true,service:'ailya-core',instanceId,pid:process.pid,dataPath:core.dataPath,workspace:core.workspace,web:!!options.staticDir,version:12,vector:core.storage.get('SELECT vec_version() version')}))
 app.get('/api/im',c=>c.json(core.im.list()))
 app.post('/api/im',async c=>c.json(await core.im.save(await c.req.json())))
 app.delete('/api/im/:id',async c=>{await core.im.remove(z.string().uuid().parse(c.req.param('id')));return c.json({ok:true})})
 app.post('/api/im/:id/login',async c=>{z.object({}).strict().parse(await c.req.json());return c.json(await core.im.login(z.string().uuid().parse(c.req.param('id'))))})
 app.post('/api/im/:id/verify',async c=>{const {code}=z.object({code:z.string()}).strict().parse(await c.req.json());core.im.verify(z.string().uuid().parse(c.req.param('id')),code);return c.json({ok:true})})
 app.get('/api/speech/config',c=>c.json(core.speech.config()))
 app.post('/api/speech/config',async c=>c.json(core.speech.save(await c.req.json())))
 app.post('/api/speech/transcribe',async c=>{const raw=await c.req.text();if(raw.length>8_001_000)throw Error('录音过大');return c.json(await core.speech.transcribe(JSON.parse(raw),c.req.raw.signal))})
 app.get('/api/backups',c=>c.json({directory:backups.root,items:backups.list()}))
 app.post('/api/backups',async c=>{z.object({}).strict().parse(await c.req.json());return c.json(backups.create())})
 app.get('/api/backups/:name/download',c=>new Response(Bun.file(backups.path(c.req.param('name'))),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${c.req.param('name')}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}))
 app.post('/api/backups/preview',async c=>{const {path}=z.object({path:z.string().min(1).max(4096)}).strict().parse(await c.req.json());return c.json(backups.preview(path))})
 app.delete('/api/backups/preview/:id',c=>{backups.discard(z.string().uuid().parse(c.req.param('id')));return c.json({ok:true})})
 app.post('/api/backups/restore',async c=>{
  const {id}=z.object({id:z.string().uuid(),confirm:z.literal(true)}).strict().parse(await c.req.json())
  if(inflight!==1)throw Error('其他请求尚未结束，请稍后重试')
  maintenance=true;const previous=core;let closed=false;previous.scheduler.close();await previous.im.close()
  try{return c.json(await backups.restore(id,async(path,rollback)=>{
   const dataPath=previous.dataPath,workspace=previous.workspace,lease=previous.releaseLock
   await previous.close(false);closed=true;available=false
   try{replaceDatabase(path,dataPath);core=new Core(dataPath,workspace,lease)}
   catch(error){const rollbackCopy=join(dirname(dataPath),`rollback-${crypto.randomUUID()}.sqlite`);copyFileSync(rollback,rollbackCopy);replaceDatabase(rollbackCopy,dataPath);core=new Core(dataPath,workspace,lease);available=true;throw Error('恢复失败，已还原恢复前数据：'+(error instanceof Error?error.message:'未知错误'))}
   finally{if(available||core!==previous){available=true;workspaces=new Workspaces(core.storage,core.workspace);core.listeners.add(broadcast);for(const ws of sockets)ws.close(1012,'Database restored')}}
  }))}finally{if(!closed){previous.scheduler.start();previous.im=new IM(previous)}if(available)maintenance=false}
 })
 app.post('/api/runtime/shutdown',async c=>{
  z.object({instanceId:z.literal(instanceId)}).strict().parse(await c.req.json())
  if(!options.onShutdown)throw Error('当前启动方式不支持关闭服务')
  if(inflight!==1||core.active.size||core.plugins.jobs.size||core.compaction.jobs.size)throw Error('请等待正在执行的任务完成后再关闭')
  maintenance=true;setTimeout(()=>void close().then(options.onShutdown),50);return c.json({ok:true},202)
 })
 app.get('/api/plugins',c=>c.json(core.plugins.list()))
 app.post('/api/plugins/import-prototype',async c=>c.json(core.plugins.importPrototype(await c.req.json())))
 app.post('/api/plugins',async c=>{const {trusted:_trusted,...input}=pluginInput.extend({trusted:z.literal(true)}).strict().parse(await c.req.json());return c.json(core.plugins.start(input),202)})
 app.post('/api/plugins/:id/action',async c=>{
  const {action}=z.object({action:z.enum(['update','reload']),trusted:z.literal(true)}).strict().parse(await c.req.json()),id=z.string().uuid().parse(c.req.param('id')),p=core.plugins.get(id)
  if(!p)throw Error('插件不存在');return c.json(core.plugins.start({id:p.id,kind:p.kind,source:p.source,enabled:!!p.enabled},action),202)
 })
 app.post('/api/plugins/:id/enabled',async c=>{const {enabled}=z.object({enabled:z.boolean()}).strict().parse(await c.req.json());core.plugins.setEnabled(z.string().uuid().parse(c.req.param('id')),enabled);return c.json({ok:true})})
 app.delete('/api/plugins/:id',c=>{core.plugins.remove(z.string().uuid().parse(c.req.param('id')));return c.json({ok:true})})
 app.get('/api/memories',c=>c.json({items:core.memories.list(),...core.memories.index.status()}))
 app.post('/api/memories',async c=>c.json(core.memories.save(await c.req.json())))
 app.post('/api/memories/config',async c=>c.json(core.memories.index.save(await c.req.json())))
 app.post('/api/memories/reindex',async c=>{z.object({}).strict().parse(await c.req.json());return c.json(core.memories.index.rebuild())})
 app.post('/api/memories/:id/decision',async c=>{const input=z.object({version:z.number().int().positive(),accept:z.boolean()}).strict().parse(await c.req.json());return c.json(core.memories.decide(z.string().uuid().parse(c.req.param('id')),input.version,input.accept))})
 app.delete('/api/memories/:id',async c=>{const input=z.object({version:z.number().int().positive()}).strict().parse(await c.req.json());core.memories.remove(z.string().uuid().parse(c.req.param('id')),input.version);return c.json({ok:true})})
 app.post('/api/sessions/:id/questions/:questionId/draft',async c=>{
  const body=z.object({answers:answersSchema,revision:z.number().int().min(0)}).strict().parse(await c.req.json())
  return c.json(core.draftQuestion(idSchema.parse(c.req.param('id')),z.string().uuid().parse(c.req.param('questionId')),body.answers,body.revision))
 })
 app.post('/api/sessions/:id/questions/:questionId/answer',async c=>{
  const body=z.object({answers:answersSchema}).strict().parse(await c.req.json())
  return c.json(await core.answerQuestion(idSchema.parse(c.req.param('id')),z.string().uuid().parse(c.req.param('questionId')),body.answers))
 })
 app.post('/api/sessions/:id/questions/:questionId/refuse',async c=>{
  z.object({}).strict().parse(await c.req.json());core.questions.refuse(idSchema.parse(c.req.param('id')),z.string().uuid().parse(c.req.param('questionId')));return c.json({ok:true})
 })
 app.post('/api/model-selection',async c=>{const input=z.object({model:z.string().min(1).max(500),sessionId:idSchema.optional()}).strict().parse(await c.req.json());return c.json(core.selectModel(input.model,input.sessionId))})
 app.get('/api/resources',c=>c.json(core.resources.list()))
 app.get('/api/catalog',c=>c.json(core.catalog.list()))
 app.post('/api/catalog/import-prototype',async c=>c.json(core.catalog.import(await c.req.json())))
 app.post('/api/catalog/:kind',async c=>c.json(core.catalog.save(z.enum(['agents','groups']).parse(c.req.param('kind')),await c.req.json())))
 app.delete('/api/catalog/:kind/:id',c=>c.json(core.catalog.remove(z.enum(['agents','groups']).parse(c.req.param('kind')),z.string().min(1).max(100).parse(c.req.param('id')))))
 app.post('/api/resources',async c=>c.json(core.resources.save(await c.req.json())))
 app.post('/api/skills/discover',async c=>{const input=z.object({path:z.string().min(1).max(4096)}).strict().parse(await c.req.json());return c.json(core.resources.skills.discover(input.path))})
 app.post('/api/skills/import',async c=>{const input=z.object({path:z.string().min(1).max(4096),enabled:z.boolean().default(false)}).strict().parse(await c.req.json());return c.json(core.resources.importSkill(input.path,input.enabled))})
 app.post('/api/resources/import-prototype',async c=>c.json(core.resources.importPrototype(await c.req.json())))
 app.delete('/api/resources/:id',c=>{core.resources.remove(z.string().uuid().parse(c.req.param('id')));return c.json({ok:true})})
 app.get('/api/search/config',c=>c.json(core.webSearch.config()))
 app.post('/api/search/config',async c=>c.json(core.webSearch.save(await c.req.json())))
 app.post('/api/search/test',async c=>{const input=z.object({query:z.string().min(1).max(1000)}).strict().parse(await c.req.json());return c.json(await core.webSearch.search(input.query,3))})
 app.get('/api/snapshot',c=>c.json({sessions:core.storage.list<{parentSessionId?:string}>().filter(s=>!s.parentSessionId),providers:core.providers(),preferredModel:core.preferredModel(),cursor:core.storage.get<{seq:number}>('SELECT coalesce(max(seq),0) seq FROM events')!.seq}))
 app.get('/api/usage',c=>{
  const days=z.coerce.number().int().min(1).max(30).parse(c.req.query('days')??7),since=Date.now()-days*86400000
  const events=core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.message_end' AND created_at>=?",since)
  const usage={input:0,output:0,cache:0}
  for(const row of events){const m=JSON.parse(row.data).message;if(m?.role==='assistant'&&m.usage){usage.input+=m.usage.input??0;usage.output+=m.usage.output??0;usage.cache+=(m.usage.cacheRead??0)+(m.usage.cacheWrite??0)}}
  for(const row of core.storage.all<{response:string}>('SELECT response FROM context_requests JOIN context_jobs ON context_requests.job_id=context_jobs.id WHERE context_jobs.created_at>=? AND response IS NOT NULL',since)){const u=JSON.parse(row.response).usage;if(u){usage.input+=u.input??0;usage.output+=u.output??0;usage.cache+=(u.cacheRead??0)+(u.cacheWrite??0)}}
  return c.json(usage)
 })
 app.get('/api/policy',c=>c.json(core.permissions.policy()))
 app.get('/api/reasoning',c=>{const {options,value}=core.reasoningProfile(z.string().min(1).max(500).parse(c.req.query('model')));return c.json({options,value})})
 app.post('/api/reasoning',async c=>{const input=z.object({model:z.string().min(1).max(500),level:z.enum(['default','off','on','low','high','max']),sessionId:idSchema.optional()}).strict().parse(await c.req.json());return c.json(core.selectReasoning(input.model,input.level,input.sessionId))})
 app.get('/api/workspaces',c=>c.json(workspaces.list()))
 app.post('/api/workspaces/select',async c=>{const input=z.object({path:z.string().min(1).max(4096)}).strict().parse(await c.req.json());return c.json(workspaces.remember(input.path))})
 app.post('/api/workspaces/pick',async c=>{
  z.object({}).strict().parse(await c.req.json())
  const path=await pickWorkspace();return c.json(path?workspaces.remember(path):{path:null})
 })
 app.post('/api/policy',async c=>c.json(core.permissions.save(await c.req.json())))
 app.post('/api/sessions/:id/permissions/:permissionId',async c=>{
  const body=permissionDecisionSchema.parse(await c.req.json())
  return c.json(core.decidePermission(idSchema.parse(c.req.param('id')),z.string().uuid().parse(c.req.param('permissionId')),body.allow,body.scope))
 })
 app.get('/api/sessions/:id/attachments/:attachmentId',c=>{
  const row=core.storage.get<AttachmentRow>('SELECT * FROM attachments WHERE session_id=? AND id=?',idSchema.parse(c.req.param('id')),z.string().uuid().parse(c.req.param('attachmentId')))
  if(!row)return c.json({error:'附件不存在'},404)
  return new Response(new Uint8Array(row.bytes),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(row.name)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}})
 })
 app.get('/api/providers',c=>c.json(core.providers()))
 app.post('/api/providers',async c=>c.json(core.saveProvider(await c.req.json())))
 app.post('/api/providers/models',async c=>c.json(await core.models(await c.req.json())))
 app.delete('/api/providers/:id',c=>{const id=idSchema.parse(c.req.param('id'));core.storage.db.run('DELETE FROM providers WHERE id=?',[id]);return c.json({ok:true})})
 app.post('/api/sessions/:id/send',async c=>c.json({taskId:core.send(idSchema.parse(c.req.param('id')),await c.req.json())},202))
 app.post('/api/sessions/:id/compact',async c=>{z.object({}).strict().parse(await c.req.json());return c.json(core.compact(idSchema.parse(c.req.param('id'))),202)})
 app.get('/api/sessions/:id/context-usage',c=>c.json(core.contextUsage(idSchema.parse(c.req.param('id')),z.string().min(1).max(500).parse(c.req.query('model')))))
 app.post('/api/sessions/:id/compact/cancel',async c=>{z.object({}).strict().parse(await c.req.json());core.compaction.cancel(idSchema.parse(c.req.param('id')));return c.json({ok:true})})
 app.post('/api/sessions/:id/stop',c=>{core.stop(idSchema.parse(c.req.param('id')));return c.json({ok:true})})
 app.delete('/api/sessions/:id',c=>{
  const id=idSchema.parse(c.req.param('id'));if(core.storage.session<{parentSessionId?:string}>(id)?.parentSessionId)throw Error('子 Agent 会话只读')
  const ids=[...core.storage.all<{child_session_id:string}>('SELECT child_session_id FROM group_runs WHERE parent_session_id=?',id).map(r=>r.child_session_id),id]
  if(ids.some(id=>core.active.has(id)))throw Error('请先停止会话')
  for(const id of ids){core.compaction.cancel(id);core.memories.deleteSession(id)}
  core.storage.db.transaction(()=>{for(const id of ids){core.storage.db.run('DELETE FROM requests WHERE task_id IN (SELECT id FROM tasks WHERE session_id=?)',[id]);for(const table of ['events','transcripts','tasks'])core.storage.db.run(`DELETE FROM ${table} WHERE session_id=?`,[id]);core.storage.db.run('DELETE FROM sessions WHERE id=?',[id])}core.plugins.collect()})();return c.json({ok:true})
 })
 const pump=(ws:ServerWebSocket<{cursor:number}>)=>{
  const rows=core.storage.all<{seq:number;kind:string;data:string}>('SELECT seq,kind,data FROM events WHERE seq>? ORDER BY seq LIMIT 1000',ws.data.cursor)
  for(const row of rows){if(!row.kind.startsWith('pi.')){const session=JSON.parse(row.data);if(!session.parentSessionId)ws.send(JSON.stringify({seq:row.seq,session}))}ws.data.cursor=row.seq}
  if(rows.length===1000)queueMicrotask(()=>{if(sockets.has(ws))pump(ws)})
 }
 if(options.staticDir)app.get('*',async c=>{
  if(c.req.path.startsWith('/api/'))return c.json({error:'接口不存在'},404)
  const root=realpathSync(options.staticDir!),path=resolve(root,'.'+decodeURIComponent(c.req.path)),rel=relative(root,path)
  if(rel.startsWith('..')||isAbsolute(rel))return c.notFound()
  const file=existsSync(path)&&statSync(path).isFile()?realpathSync(path):join(root,'index.html'),actual=relative(root,file)
  if(actual.startsWith('..')||isAbsolute(actual))return c.notFound()
  return new Response(Bun.file(file),{headers:{'Cache-Control':file.endsWith('index.html')?'no-store':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}})
 })
 let server:ReturnType<typeof Bun.serve<{cursor:number}>>
 try{server=Bun.serve<{cursor:number}>({hostname:'127.0.0.1',port:options.port??4317,idleTimeout:60,maxRequestBodySize:24*1024*1024,
  fetch(req,server){
   const url=new URL(req.url)
   if(url.pathname==='/api/workspaces/pick')server.timeout(req,0)
   if(url.pathname==='/api/events'){
    if(maintenance)return new Response('Maintenance',{status:503})
    const origin=req.headers.get('Origin'),host=req.headers.get('Host')?.split(':')[0]
    if(!['127.0.0.1','localhost'].includes(host??'')||(origin&&!allowed.has(origin)&&origin!==url.origin))return new Response('Forbidden',{status:403})
    const result=z.coerce.number().int().min(0).safeParse(url.searchParams.get('after')??0)
    if(!result.success)return new Response('Invalid cursor',{status:400})
    if(server.upgrade(req,{data:{cursor:result.data}}))return
    return new Response('Upgrade required',{status:426})
   }
   return app.fetch(req)
  },websocket:{open(ws){sockets.add(ws);pump(ws)},message(){},close(ws){sockets.delete(ws)}}})}catch(error){backups.close();void core.close();throw error}
 function broadcast(){for(const ws of sockets)pump(ws)}
 core.listeners.add(broadcast)
 let closing:Promise<void>|undefined
 function close(){return closing??=shutdown()}
 async function shutdown(){maintenance=true;for(const ws of sockets)ws.close();backups.close();await core.close();await server.stop(true)}
 return {get core(){return core},server,close}
}
if(import.meta.main){
 const staticDir=resolve(import.meta.dir,'../dist')
 const app=startServer({dataPath:resolve(process.env.AILYA_DATA_DIR??resolve(process.env.LOCALAPPDATA??resolve(homedir(),'.local','share'),'Ailya','data'),'ailya.sqlite'),workspace:process.env.AILYA_WORKSPACE,port:Number(process.env.AILYA_PORT??4317),staticDir:existsSync(join(staticDir,'index.html'))?staticDir:undefined,onShutdown:()=>process.exit(0)})
 console.log(`Ailya Core http://127.0.0.1:${app.server.port}`)
 for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0))})
}



