import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/sdk/client/stdio.js'
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {ListRootsRequestSchema} from '@modelcontextprotocol/sdk/types.js'
import {pathToFileURL} from 'node:url'
import {Type} from 'typebox'
import type {AgentTool} from '@earendil-works/pi-agent-core'
import parseArgv from 'string-argv'
import {execFile} from 'node:child_process'
import {join} from 'node:path'
import type {Resources,Resource} from './resources'
import type {Authorize} from './tools'

class OwnedStdioTransport extends StdioClientTransport{
 override async close(){
  const pid=this.pid
  if(process.platform==='win32'&&pid)await new Promise<void>(resolve=>execFile(join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:3000},()=>resolve()))
  await super.close()
 }
}

export class McpSession{
 private clients=new Map<string,{client:Client;config:string}>()
 private closed=false
 constructor(private resources:Resources,private workspace:string,private permission:string,private authorize:Authorize){}
 async close(){this.closed=true;await Promise.allSettled([...this.clients.values()].map(x=>x.client.close()));this.clients.clear()}
 private async connect(id:string,signal?:AbortSignal){
  signal?.throwIfAborted();if(this.closed)throw Error('MCP 会话已结束')
  const r=this.resources.get(id);if(!r||r.kind!=='mcp'||!r.enabled)throw Error('MCP 未启用或不存在')
  const config=JSON.stringify(r),cached=this.clients.get(id)
  if(cached?.config===config)return cached.client
  if(cached){await cached.client.close();this.clients.delete(id)}
  const client=new Client({name:'Ailya',version:'0.1.0'},{capabilities:{roots:{listChanged:false}}})
  client.setRequestHandler(ListRootsRequestSchema,async()=>({roots:[{uri:pathToFileURL(this.workspace).href,name:'Workspace'}]}))
  const transport=this.transport(r)
  const close=()=>{void client.close()};signal?.addEventListener('abort',close,{once:true})
  try{await client.connect(transport,{signal,timeout:15000});signal?.throwIfAborted();if(this.closed)throw Error('MCP 会话已结束');this.clients.set(id,{client,config});return client}catch(e){await client.close();throw e}finally{signal?.removeEventListener('abort',close)}
 }
 private transport(r:Resource){
  if(r.transport==='http')return new StreamableHTTPClientTransport(new URL(r.endpoint),{requestInit:{headers:r.headers}})
  const argv=r.command.trim().startsWith('[')?JSON.parse(r.command):parseArgv(r.command)
  if(!Array.isArray(argv)||!argv.length||argv.some(x=>typeof x!=='string'||!x)||argv.length>100)throw Error('MCP 启动命令无效；可使用 JSON 命令参数数组')
  return new OwnedStdioTransport({command:argv[0],args:argv.slice(1),cwd:this.workspace,env:{...getDefaultEnvironment(),...r.env},stderr:'ignore',maxBufferSize:2*1024*1024})
 }
 tools(){
  const listSchema=Type.Object({}),schema=Type.Object({serverId:Type.String()}),callSchema=Type.Object({serverId:Type.String(),name:Type.String(),arguments:Type.Record(Type.String(),Type.Unknown())})
  const servers:AgentTool<typeof listSchema>={name:'mcp_list_servers',label:'MCP 服务',description:'List configured MCP servers. Server configuration and secrets are not returned.',parameters:listSchema,execute:async()=>({content:[{type:'text',text:JSON.stringify(this.resources.list().filter(r=>r.kind==='mcp').map(r=>({id:r.id,name:r.name,enabled:r.enabled})))}],details:{}})}
  const list:AgentTool<typeof schema>={name:'mcp_list_tools',label:'MCP 工具列表',description:'Connect to an enabled MCP server and discover its tool names and JSON schemas. Connecting stdio runs configured host code and requires permission. MCP roots are hints, not a sandbox.',parameters:schema,execute:async(id,args,signal)=>{
   if(this.permission!=='full')await this.authorize(id,'mcp_list_tools',args,`mcp_connect ${args.serverId}`,signal)
   const client=await this.connect(args.serverId,signal);let cursor:string|undefined;const tools:unknown[]=[]
   let pages=0
   do{if(++pages>10)throw Error('MCP 工具列表分页超过限制');const page=await client.listTools(cursor?{cursor}:undefined,{signal,timeout:15000});tools.push(...page.tools);cursor=page.nextCursor;if(tools.length>200||JSON.stringify(tools).length>128000)throw Error('MCP 工具列表超过大小限制')}while(cursor)
   return {content:[{type:'text',text:JSON.stringify(tools)}],details:{}}
  }}
  const call:AgentTool<typeof callSchema>={name:'mcp_call_tool',label:'执行 MCP 工具',description:'Call a discovered tool on an enabled MCP server with arguments matching its schema. Requires authorization. External MCP servers may have host or network side effects beyond the workspace; cancellation cannot guarantee remote rollback.',parameters:callSchema,execute:async(id,args,signal)=>{
   if(this.permission!=='full')await this.authorize(id,'mcp_call_tool',args,`mcp_call ${args.serverId} ${args.name}`,signal)
   const client=await this.connect(args.serverId,signal)
   try{const result=await client.callTool({name:args.name,arguments:args.arguments},undefined,{signal,timeout:60000,maxTotalTimeout:60000});const text=JSON.stringify(result);if(result.isError)throw Error(text.slice(0,16000));return {content:[{type:'text',text:text.slice(0,64000)+(text.length>64000?'\n[truncated]':'')}],details:{}}}catch(e){if(signal?.aborted){await client.close();this.clients.delete(args.serverId);throw Error('MCP 调用已取消；远端操作可能已生效，不保证回滚')}throw e}
  }}
  return [servers,list,call]
 }
}
