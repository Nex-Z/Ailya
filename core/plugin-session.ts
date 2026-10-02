import {Type} from 'typebox'
import {mkdtempSync} from 'node:fs'
import {join} from 'node:path'
import type {AgentTool,AgentToolResult} from '@earendil-works/pi-agent-core'
import type {Authorize} from './tools'
import type {FileChange} from './contracts'
import {Plugins,type PluginVersion,type PluginTool} from './plugins'
import {PluginHost} from './plugin-host'
import {writePluginFiles,removePluginCache} from './plugin-files'
import {snapshot,diffSnapshots} from './local-tools'
export class PluginSession{
 private hosts=new Map<string,{host:PluginHost;root:string}>()
 private closed=false
 constructor(private plugins:Plugins,private selected:PluginVersion[],private workspace:string,private permission:string,private authorize:Authorize,private changed:(c:FileChange)=>void){}
 private find(id:string){const version=this.selected.find(p=>p.plugin_id===id);if(!version)throw Error('插件未分配给当前任务');this.plugins.permitted(version);return version}
 private async load(version:PluginVersion,signal?:AbortSignal){
  if(this.closed)throw Error('插件会话已关闭');signal?.throwIfAborted();const old=this.hosts.get(version.id);if(old)return old.host
  const root=mkdtempSync(join(this.plugins.cache,'task-')),host=new PluginHost(this.workspace);this.hosts.set(version.id,{host,root})
  try{writePluginFiles(root,this.plugins.files(version.id));const tools=await host.request<PluginTool[]>({op:'load',root,entries:JSON.parse(version.entries),workspace:this.workspace},signal,30000);if(JSON.stringify(tools)!==version.tools)throw Error('插件工具定义与安装时不一致，请重新加载插件');return host}catch(e){await host.close();this.hosts.delete(version.id);removePluginCache(this.plugins.cache,root);throw e}
 }
 tools():AgentTool[]{
  if(!this.selected.length)return []
  const listSchema=Type.Object({pluginId:Type.Optional(Type.String())}),callSchema=Type.Object({pluginId:Type.String(),name:Type.String(),arguments:Type.Record(Type.String(),Type.Unknown())})
  const list:AgentTool<typeof listSchema>={name:'plugin_list_tools',label:'插件工具列表',description:'List enabled installed Pi tool plugins and their IDs. Supply pluginId to read its actual tool schemas before calling. Does not run plugin code.',parameters:listSchema,execute:async(_id,args)=>{
   const data=args.pluginId?JSON.parse(this.find(args.pluginId).tools):this.selected.filter(p=>this.plugins.get(p.plugin_id)?.enabled).map(p=>({pluginId:p.plugin_id,source:p.source,version:p.version,tools:(JSON.parse(p.tools) as PluginTool[]).map(t=>({name:t.name,description:t.description}))}))
   const text=JSON.stringify(data);if(text.length>128000)throw Error('插件工具列表过大，请指定 pluginId');return {content:[{type:'text',text}],details:{}}
  }}
  const call:AgentTool<typeof callSchema>={name:'plugin_call_tool',label:'执行插件工具',description:'Run a discovered installed Pi plugin tool with arguments matching its schema. Loading and execution run trusted host code, may access files/network outside the workspace, and require authorization. Stopping kills the owned process tree; completed external actions are not rolled back.',parameters:callSchema,execute:async(callId,args,signal)=>{
   const version=this.find(args.pluginId)
   if(!(JSON.parse(version.tools) as PluginTool[]).some(t=>t.name===args.name))throw Error('插件工具不存在')
   if(this.permission!=='full')await this.authorize(callId,'plugin_call_tool',{...args,version:version.id,hash:version.hash},`plugin_call ${version.source} ${args.name}`,signal)
   signal?.throwIfAborted();this.find(args.pluginId);const before=await snapshot(this.workspace);signal?.throwIfAborted()
   let result:AgentToolResult<unknown>|undefined
   try{const host=await this.load(version,signal);this.find(args.pluginId);result=await host.request<AgentToolResult<unknown>>({op:'call',tool:args.name,args:args.arguments,callId},signal,60000);return result}
   finally{try{const after=await snapshot(this.workspace);diffSnapshots(before,after,this.changed);if(result&&(!before.complete||!after.complete))result.content.push({type:'text',text:'文件差异扫描不完整；工作空间外或大文件的变更未跟踪。'})}catch{if(result)result.content.push({type:'text',text:'文件差异扫描失败，无法确认所有变更。'})}}
  }}
  return [list,call]
 }
 async close(){this.closed=true;await Promise.allSettled([...this.hosts.values()].map(async({host,root})=>{await host.close();removePluginCache(this.plugins.cache,root)}));this.hosts.clear()}
}
