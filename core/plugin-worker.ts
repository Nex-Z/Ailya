// This process runs trusted plugin code. It has no Core database handle or inherited model keys.
import {DefaultPackageManager,SettingsManager,type LoadExtensionsResult,type ExtensionContext,type ToolDefinition} from '@earendil-works/pi-coding-agent'
import {validateToolArguments} from '@earendil-works/pi-ai'
import {existsSync,lstatSync,mkdirSync,readFileSync,writeFileSync,realpathSync} from 'node:fs'
import {join,basename,relative,isAbsolute,sep} from 'node:path'
import {execFile} from 'node:child_process'
import {pluginFiles,writePluginFiles,pluginPath} from './plugin-files'
type Input={op:'prepare'|'load'|'call';root:string;workspace:string;source:string;kind:string;entries:string[];tool:string;args:Record<string,unknown>;callId:string}
let definitions=new Map<string,ToolDefinition>(),context:ExtensionContext
const unsupported=()=>{throw Error('此插件依赖尚未接入的 Pi 会话或界面 API')}
async function prepare(input:Input){
 let source=input.source
 if(input.kind==='本地路径'){
  const path=realpathSync(source),bundle=join(input.root,'bundle');mkdirSync(bundle)
  if(lstatSync(path).isFile()){source=join(bundle,basename(path));writeFileSync(source,readFileSync(path))}
  else{writePluginFiles(bundle,pluginFiles(path));source=bundle}
 }
 const manager=new DefaultPackageManager({cwd:input.root,agentDir:join(input.root,'pi'),settingsManager:SettingsManager.inMemory()})
 const resolved=await manager.resolveExtensionSources([source])
 const entries=resolved.extensions.filter(e=>e.enabled).map(e=>{
  let path=e.path
  if(lstatSync(path).isDirectory()){path=['index.ts','index.js'].map(n=>join(path,n)).find(existsSync)??'';if(!path)throw Error('插件目录需要 index.ts / index.js 或 package.json 的 pi.extensions')}
  const rel=relative(input.root,realpathSync(path)).split(sep).join('/');pluginPath(input.root,rel);if(isAbsolute(rel)||rel.startsWith('../'))throw Error('插件入口超出安装目录');return rel
 })
 if(!entries.length||entries.length>50)throw Error('未找到可用 Pi 工具扩展入口，或入口超过 50 个')
 const manifest=resolved.extensions[0]?.metadata.baseDir?join(resolved.extensions[0].metadata.baseDir!,'package.json'):''
 let version='local';try{version=JSON.parse(readFileSync(manifest,'utf8')).version??'local'}catch{}
 return {entries,version:String(version).slice(0,100)}
}
async function load(input:Input){
 // Pinned Pi 0.87.1 loader: explicit paths only, with the real workspace cwd. No default discovery.
 const loaderUrl=new URL('./core/extensions/loader.js',import.meta.resolve('@earendil-works/pi-coding-agent'))
 const {loadExtensions}=await import(loaderUrl.href) as {loadExtensions:(paths:string[],cwd:string)=>Promise<LoadExtensionsResult>}
 const result=await loadExtensions(input.entries.map(p=>pluginPath(input.root,p)),input.workspace)
 if(result.errors.length)throw Error(result.errors.map(e=>e.error).join('\n').slice(0,4000))
 definitions=new Map()
 for(const extension of result.extensions){
  if(extension.handlers.size||extension.commands.size||extension.shortcuts.size||extension.flags.size||extension.messageRenderers.size||extension.entryRenderers?.size||extension.markdownTransformer)throw Error('当前支持注册工具的 Pi 插件；此插件还依赖事件钩子、命令或界面扩展，暂不兼容')
  for(const {definition} of extension.tools.values()){
   if(!/^[a-zA-Z0-9_-]{1,64}$/.test(definition.name)||definitions.has(definition.name)||typeof definition.execute!=='function')throw Error('插件工具名称重复、无效或缺少执行函数')
   definitions.set(definition.name,definition)
  }
 }
 if(result.runtime.pendingProviderRegistrations.length||result.runtime.pendingNativeProviderRegistrations.length)throw Error('插件自定义模型厂商尚未接入')
 if(!definitions.size||definitions.size>100)throw Error('插件必须注册 1 到 100 个工具')
 const metadata=[...definitions.values()].map(d=>({name:d.name,label:d.label,description:d.description,parameters:d.parameters}))
 if(JSON.stringify(metadata).length>128000)throw Error('插件工具描述超过大小限制')
 const ui=new Proxy({},{get:()=>unsupported})
 context=new Proxy({cwd:input.workspace,hasUI:false,mode:'print',model:undefined,scopedModels:[],signal:undefined,ui,isIdle:()=>false,isProjectTrusted:()=>true,hasPendingMessages:()=>false,abort:unsupported,shutdown:unsupported,compact:unsupported},{get:(target,key)=>{if(key in target)return Reflect.get(target,key);throw Error(`插件上下文 ${String(key)} 尚未接入`)}}) as unknown as ExtensionContext
 result.runtime.getActiveTools=()=>[...definitions.keys()]
 result.runtime.getAllTools=()=>result.extensions.flatMap(e=>[...e.tools.values()].map(t=>({name:t.definition.name,description:t.definition.description,parameters:t.definition.parameters,sourceInfo:t.sourceInfo})))
 result.runtime.getCommands=()=>[]
 return metadata
}
process.on('message',async(message:unknown)=>{
 const {id,body}=message as {id:number;body:Input}
 try{
  let value:unknown
  if(body.op==='prepare')value=await prepare(body)
  else if(body.op==='load')value=await load(body)
  else if(body.op==='call'){
   const definition=definitions.get(body.tool);if(!definition)throw Error('插件中没有此工具')
   const args=definition.prepareArguments?definition.prepareArguments(body.args):body.args
   if(!args||typeof args!=='object'||Array.isArray(args))throw Error('插件参数必须是对象')
   const valid=validateToolArguments(definition,{type:'toolCall',id:body.callId,name:definition.name,arguments:args as Record<string,never>})
   value=await definition.execute(body.callId,valid,undefined,undefined,context)
   if(!value||!Array.isArray((value as {content?:unknown}).content))throw Error('插件返回了无效工具结果')
   for(const item of (value as {content:unknown[]}).content){if(!item||typeof item!=='object'||!(('type' in item&&item.type==='text'&&'text' in item&&typeof item.text==='string')||('type' in item&&item.type==='image'&&'data' in item&&typeof item.data==='string'&&'mimeType' in item&&typeof item.mimeType==='string')))throw Error('插件结果仅支持文本和图片内容')}
   if(JSON.stringify(value).length>512000)throw Error('插件结果超过 512 KB')
  }else throw Error('未知插件操作')
  process.send?.({id,ok:true,value})
 }catch(e){process.send?.({id,ok:false,error:(e instanceof Error?e.message:String(e)).slice(0,4000)})}
})
process.on('disconnect',()=>{
 if(process.platform==='win32')execFile(join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe'),['/PID',String(process.pid),'/T','/F'],{windowsHide:true},()=>process.exit())
 else process.exit()
})
