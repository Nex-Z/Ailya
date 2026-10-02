import {Type} from 'typebox'
import type {AgentTool} from '@earendil-works/pi-agent-core'
import type {Resources} from './resources'
import type {Authorize} from './tools'
export function scheduleTools(resources:Resources,workspace:string,model:string,sessionId:string,permission:string,authorize:Authorize){
 const schema=Type.Object({action:Type.Union([Type.Literal('list'),Type.Literal('create'),Type.Literal('update'),Type.Literal('delete')]),id:Type.Optional(Type.String()),name:Type.Optional(Type.String()),instructions:Type.Optional(Type.String()),frequency:Type.Optional(Type.Union([Type.Literal('once'),Type.Literal('daily'),Type.Literal('weekly')])),date:Type.Optional(Type.String()),time:Type.Optional(Type.String()),timezone:Type.Optional(Type.String()),weekday:Type.Optional(Type.String()),enabled:Type.Optional(Type.Boolean())})
 const tool:AgentTool<typeof schema>={name:'schedule_task',label:'定时任务',description:'List, create, update or delete real Core scheduled tasks. time is HH:mm, date YYYY-MM-DD for once, weekday 0(Sunday)-6, timezone IANA. Each run creates an independent Ailya session using the current workspace/model and default permissions. Core must stay running. Offline missed runs are recorded, never caught up. Before resolving relative dates like tomorrow, list tasks to obtain the current time and local timezone. Writes require authorization; confirm ambiguous date/time with the user.',parameters:schema,async execute(id,args,signal){
  if(args.action==='list')return {content:[{type:'text',text:JSON.stringify({now:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,tasks:resources.list().filter(r=>r.kind==='task')})}],details:{}}
  const existing=args.id?resources.get(args.id):undefined
  if(args.action!=='create'&&(!existing||existing.kind!=='task'))throw Error('定时任务不存在')
  if(permission!=='full')await authorize(id,'schedule_task',args,`schedule_${args.action} ${args.id??args.name??''}`,signal)
  signal?.throwIfAborted()
  if(args.action==='delete'){resources.remove(args.id!);return {content:[{type:'text',text:'已删除定时任务'}],details:{}}}
  const {action:_,id:resourceId,...fields}=args
  const entry=resources.save({...existing,...fields,id:args.action==='create'?crypto.randomUUID():resourceId,kind:'task',workspace:existing?.workspace??workspace,model:existing?.model??model,permission:existing?.permission??'default',agent:'Ailya',sourceSession:existing?.sourceSession??sessionId,enabled:args.enabled??existing?.enabled??true})
  return {content:[{type:'text',text:JSON.stringify(entry)}],details:{}}
 }}
 return tool
}
