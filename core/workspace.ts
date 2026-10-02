import {existsSync,lstatSync,realpathSync} from 'node:fs'
import {isAbsolute,relative,resolve,sep} from 'node:path'
import fg from 'fast-glob'
import type {Readable} from 'node:stream'

export function workspaceGuard(workspace:string,signal?:AbortSignal){
 const root=realpathSync(workspace)
 return (path:string)=>{
  signal?.throwIfAborted()
  const target=resolve(root,path),rel=relative(root,target)
  if(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel))throw Error('文件不在授权工作空间内')
  let current=root
  for(const part of rel.split(sep).filter(Boolean)){current=resolve(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw Error('不允许通过符号链接访问文件')}
  return target
 }
}
export async function walkFiles(root:string,pattern='**/*',limit=3000,signal?:AbortSignal){
 if(pattern.length>500||isAbsolute(pattern)||pattern.split(/[\\/]/).includes('..'))throw Error('搜索模式无效')
 signal?.throwIfAborted()
 const stream=fg.stream(pattern,{cwd:root,onlyFiles:true,dot:true,followSymbolicLinks:false,ignore:['**/.git/**','**/node_modules/**','**/.ailya/**']}) as Readable
 const files:string[]=[];let truncated=false
 const abort=()=>stream.destroy(Error('搜索已停止'))
 const timer=setTimeout(()=>stream.destroy(Error('目录扫描超时')),10000)
 signal?.addEventListener('abort',abort,{once:true})
 try{for await(const file of stream){signal?.throwIfAborted();if(files.length>=limit){truncated=true;break}files.push(String(file))}}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);stream.destroy()}
 return {files,truncated}
}
