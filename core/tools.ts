import { structuredPatch } from 'diff'
import { createReadTool, createWriteTool, createEditTool } from '@earendil-works/pi-coding-agent'
import { accessSync, existsSync, lstatSync, realpathSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import {homedir} from 'node:os'
import type { FileChange } from './contracts'
export type Authorize=(toolCallId:string,tool:string,args:Record<string,unknown>,action:string,signal?:AbortSignal)=>Promise<void>
// Pi owns tool schemas and editing. Core owns authorization and filesystem boundaries.
export function fileTools(workspace:string, permission:string, signal:()=>AbortSignal|undefined, changed:(change:FileChange)=>void,authorize?:Authorize) {
 const root=realpathSync(workspace)
 const guard=(path:string)=>{
  signal()?.throwIfAborted()
  const target=resolve(path),rel=relative(root,target)
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('文件不在授权工作空间内')
  let current=root
  for(const part of rel.split(sep).filter(Boolean)){current=resolve(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw Error('不允许通过符号链接访问文件')}
  return target
 }
 const pathFor=(path:string)=>guard(resolve(root,path==='~'?homedir():path.startsWith('~/')||path.startsWith('~\\')?resolve(homedir(),path.slice(2)):path))
 const commit=async(path:string,content:string)=>{
  const target=guard(path),exists=existsSync(target),before=exists?readFileSync(target,'utf8'):''
  if(before.includes('\0')||content.includes('\0'))throw Error('写入工具仅支持文本文件')
  if(exists&&before===content)return
  writeFileSync(target,content,'utf8')
  const patch=structuredPatch(target,target,before,content)
  const diff=patch.hunks.flatMap(h=>[`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,...h.lines])
  changed({path:target,kind:exists?'modified':'added',added:diff.filter(x=>x.startsWith('+')).length,deleted:diff.filter(x=>x.startsWith('-')).length,diff})
 }
 const read=createReadTool(root,{operations:{access:async path=>{accessSync(guard(path))},readFile:async path=>readFileSync(guard(path)),detectImageMimeType:async()=>null}})
 const write=createWriteTool(root,{operations:{mkdir:async path=>{guard(path);mkdirSync(path,{recursive:true})},writeFile:commit}})
 const edit=createEditTool(root,{operations:{readFile:async path=>readFileSync(guard(path)),access:async path=>{accessSync(guard(path))},writeFile:commit}})
 const permit:Authorize=async(id,tool,args,_action,abort)=>{
  const target=pathFor(String(args.path));abort?.throwIfAborted()
  if(permission!=='full'){if(!authorize)throw Error('写入需要授权');await authorize(id,tool,args,`${tool} ${target.replaceAll('\\','/')}`,abort)}
  abort?.throwIfAborted();guard(target)
 }
 const writeExecute=write.execute
 write.execute=async(id,args,abort,update)=>{await permit(id,'write',args,'',abort);return writeExecute(id,args,abort,update)}
 const editExecute=edit.execute
 edit.execute=async(id,args,abort,update)=>{await permit(id,'edit',args,'',abort);return editExecute(id,args,abort,update)}
 return [read,write,edit] as const
}
