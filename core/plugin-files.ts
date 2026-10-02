import {createHash} from 'node:crypto'
import {readdirSync,lstatSync,readFileSync,writeFileSync,mkdirSync,realpathSync,rmSync} from 'node:fs'
import {resolve,relative,isAbsolute,join,dirname,sep} from 'node:path'
export type PluginFile={path:string;bytes:Uint8Array}
export const pluginHash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex')
export function pluginPath(root:string,path:string){
 if(!path||isAbsolute(path)||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))||[...path].some(c=>c.charCodeAt(0)<32))throw Error('插件文件路径不安全')
 return resolve(root,path)
}
export function pluginFiles(root:string){
 const base=realpathSync(root),files:PluginFile[]=[];let total=0
 const walk=(dir:string,depth:number)=>{if(depth>30)throw Error('插件目录层级超过限制');for(const entry of readdirSync(dir,{withFileTypes:true})){
  if(['.git','.bin','.cache'].includes(entry.name))continue
  const full=join(dir,entry.name),stat=lstatSync(full)
  if(stat.isSymbolicLink())throw Error('插件包不能包含符号链接或目录联接')
  if(stat.isDirectory()){walk(full,depth+1);continue}if(!stat.isFile())throw Error('插件包含非普通文件')
  const path=relative(base,full).split(sep).join('/');pluginPath(base,path)
  if(files.length>=10000||(total+=stat.size)>100*1024*1024)throw Error('插件包超过 10,000 文件或 100 MB')
  files.push({path,bytes:readFileSync(full)})
 }};walk(base,0);return files
}
export function writePluginFiles(root:string,files:PluginFile[]){for(const file of files){const path=pluginPath(root,file.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,file.bytes,{flag:'wx'})}}
export function removePluginCache(cacheRoot:string,path:string){
 const base=realpathSync(cacheRoot),target=resolve(path),rel=relative(base,target)
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('插件清理路径不在缓存目录内')
 // Unlinking a junction never recurses into its target. Each task owns a unique child.
 rmSync(target,{recursive:true,force:true})
}
