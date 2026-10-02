import type {AttachmentRow} from './attachments'
import {pickWorkspace} from './workspace-picker'
import {Workspaces} from './workspaces'
import { Hono } from 'hono'
import { z } from 'zod'
import {answersSchema} from './question-contracts'
import { Core } from './core'
import type { ServerWebSocket } from 'bun'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
const idSchema=z.string().min(1).max(100).regex(/^[\w-]+$/)
export function startServer(options:{dataPath:string;workspace?:string;port?:number;origins?:string[]}) {
 const core=new Core(options.dataPath,options.workspace)
 const workspaces=new Workspaces(core.storage,core.workspace)
 const app=new Hono()
 const sockets=new Set<ServerWebSocket<{cursor:number}>>()
 const allowed=new Set(options.origins??['http://127.0.0.1:5173','http://localhost:5173'])
 app.use('*',async(c,next)=>{
  const url=new URL(c.req.url),origin=c.req.header('Origin'),host=c.req.header('Host')?.split(':')[0]
  if(!['127.0.0.1','localhost'].includes(host??'')||(origin&&!allowed.has(origin)&&origin!==url.origin))return c.json({error:'来源未授权'},403)
  if(!['GET','HEAD'].includes(c.req.method)&&!c.req.header('Content-Type')?.startsWith('application/json'))return c.json({error:'需要 JSON 请求'},415)
  await next()
 })
 app.onError((error,c)=>c.json({error:error instanceof z.ZodError?'请求格式不正确':error.message},400))
 app.use('/api/sessions/:id/*',async(c,next)=>{
  if(c.req.method!=='GET'&&core.storage.session<{parentSessionId?:string}>(c.req.param('id')!)?.parentSessionId)return c.json({error:'子 Agent 会话只读，请从主会话操作'},403)
  await next()
 })
 app.get('/api/health',c=>c.json({ok:true,version:6,vector:core.storage.get('SELECT vec_version() version')}))
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
  const body=z.object({allow:z.boolean()}).strict().parse(await c.req.json())
  return c.json(core.decidePermission(idSchema.parse(c.req.param('id')),z.string().uuid().parse(c.req.param('permissionId')),body.allow))
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
 app.post('/api/sessions/:id/stop',c=>{core.stop(idSchema.parse(c.req.param('id')));return c.json({ok:true})})
 app.delete('/api/sessions/:id',c=>{
  const id=idSchema.parse(c.req.param('id'));if(core.storage.session<{parentSessionId?:string}>(id)?.parentSessionId)throw Error('子 Agent 会话只读')
  const ids=[...core.storage.all<{child_session_id:string}>('SELECT child_session_id FROM group_runs WHERE parent_session_id=?',id).map(r=>r.child_session_id),id]
  if(ids.some(id=>core.active.has(id)))throw Error('请先停止会话')
  core.storage.db.transaction(()=>{for(const id of ids){core.storage.db.run('DELETE FROM requests WHERE task_id IN (SELECT id FROM tasks WHERE session_id=?)',[id]);for(const table of ['events','transcripts','tasks'])core.storage.db.run(`DELETE FROM ${table} WHERE session_id=?`,[id]);core.storage.db.run('DELETE FROM sessions WHERE id=?',[id])}})();return c.json({ok:true})
 })
 const pump=(ws:ServerWebSocket<{cursor:number}>)=>{
  const rows=core.storage.all<{seq:number;kind:string;data:string}>('SELECT seq,kind,data FROM events WHERE seq>? ORDER BY seq LIMIT 1000',ws.data.cursor)
  for(const row of rows){if(!row.kind.startsWith('pi.')){const session=JSON.parse(row.data);if(!session.parentSessionId)ws.send(JSON.stringify({seq:row.seq,session}))}ws.data.cursor=row.seq}
  if(rows.length===1000)queueMicrotask(()=>{if(sockets.has(ws))pump(ws)})
 }
 const server=Bun.serve<{cursor:number}>({hostname:'127.0.0.1',port:options.port??4317,idleTimeout:60,maxRequestBodySize:24*1024*1024,
  fetch(req,server){
   const url=new URL(req.url)
   if(url.pathname==='/api/workspaces/pick')server.timeout(req,0)
   if(url.pathname==='/api/events'){
    const origin=req.headers.get('Origin'),host=req.headers.get('Host')?.split(':')[0]
    if(!['127.0.0.1','localhost'].includes(host??'')||(origin&&!allowed.has(origin)&&origin!==url.origin))return new Response('Forbidden',{status:403})
    const result=z.coerce.number().int().min(0).safeParse(url.searchParams.get('after')??0)
    if(!result.success)return new Response('Invalid cursor',{status:400})
    if(server.upgrade(req,{data:{cursor:result.data}}))return
    return new Response('Upgrade required',{status:426})
   }
   return app.fetch(req)
  },websocket:{open(ws){sockets.add(ws);pump(ws)},message(){},close(ws){sockets.delete(ws)}}})
 core.listeners.add(()=>{for(const ws of sockets)pump(ws)})
 return {core,server,async close(){for(const ws of sockets)ws.close();await core.close();await server.stop(true)}}
}
if(import.meta.main){
 const app=startServer({dataPath:resolve(process.env.AILYA_DATA_DIR??resolve(process.env.LOCALAPPDATA??resolve(homedir(),'.local','share'),'Ailya','data'),'ailya.sqlite'),workspace:process.env.AILYA_WORKSPACE,port:Number(process.env.AILYA_PORT??4317)})
 console.log(`Ailya Core http://127.0.0.1:${app.server.port}`)
 for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>process.exit(0))})
}



