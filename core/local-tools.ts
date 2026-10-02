import {createPowerShellTool,createBashTool,createLsTool,createFindTool} from '@earendil-works/pi-coding-agent'
import {Type} from 'typebox'
import type {AgentTool} from '@earendil-works/pi-agent-core'
import {existsSync,statSync,readdirSync,readFileSync,realpathSync} from 'node:fs'
import {structuredPatch} from 'diff'
import {workspaceGuard,walkFiles} from './workspace'
import type {Authorize} from './tools'
import type {FileChange} from './contracts'

export async function snapshot(root:string){
 const scan=await walkFiles(root),files=new Map<string,Buffer>();let bytes=0,complete=!scan.truncated
 const guard=workspaceGuard(root)
 for(const name of scan.files){try{const path=guard(name),size=statSync(path).size;if(size>512*1024||bytes+size>16*1024*1024){complete=false;continue}files.set(path,readFileSync(path));bytes+=size}catch{complete=false}}
 return {files,complete}
}
export function diffSnapshots(before:Awaited<ReturnType<typeof snapshot>>,after:Awaited<ReturnType<typeof snapshot>>,changed:(c:FileChange)=>void){
 for(const path of new Set([...before.files.keys(),...after.files.keys()])){
  const a=before.files.get(path),b=after.files.get(path)
  if(a?.equals(b??Buffer.alloc(0))&&b!==undefined)continue
  if(!a&&!before.complete||!b&&!after.complete)continue
  let oldText='',newText='',binary=false
  try{const decoder=new TextDecoder('utf-8',{fatal:true});oldText=decoder.decode(a);newText=decoder.decode(b);binary=oldText.includes('\0')||newText.includes('\0')}catch{binary=true}
  const diff=binary?[]:structuredPatch(path,path,oldText,newText).hunks.flatMap(h=>[`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,...h.lines])
  changed({path,kind:!a?'added':!b?'deleted':'modified',binary,added:diff.filter(x=>x.startsWith('+')).length,deleted:diff.filter(x=>x.startsWith('-')).length,diff})
 }
}
export function localTools(workspace:string,permission:string,authorize:Authorize,changed:(c:FileChange)=>void){
 const root=realpathSync(workspace),guard=workspaceGuard(root)
 const ls=createLsTool(root,{operations:{exists:p=>existsSync(guard(p)),stat:p=>statSync(guard(p)),readdir:p=>readdirSync(guard(p))}})
 const find=createFindTool(root,{operations:{exists:p=>existsSync(guard(p)),glob:async(pattern,cwd,options)=>(await walkFiles(guard(cwd),pattern,Math.min(options.limit+1,3001))).files}})
 find.description='Find files by glob pattern inside the workspace. Skips .git, node_modules, .ailya and symlinks. Results are bounded; no ripgrep is used.'
 const schema=Type.Object({query:Type.String({minLength:1,maxLength:500}),path:Type.Optional(Type.String()),glob:Type.Optional(Type.String()),ignoreCase:Type.Optional(Type.Boolean()),limit:Type.Optional(Type.Integer({minimum:1,maximum:200}))})
 const search:AgentTool<typeof schema>={name:'search_files',label:'搜索文件内容',description:'Search literal text in UTF-8 files inside the workspace. Returns file, line number and matching text. Skips binary/large files, .git, node_modules and symlinks. Not a regular expression.',parameters:schema,async execute(_id,args,signal){
  const base=guard(args.path??'.'),scoped=workspaceGuard(base,signal),scan=await walkFiles(base,args.glob??'**/*',3000,signal)
  const matches:{path:string;line:number;text:string}[]=[],needle=args.ignoreCase?args.query.toLowerCase():args.query;let skipped=0,limited=false,bytes=0
  for(const name of scan.files){signal?.throwIfAborted();let text:string;try{const path=scoped(name),size=statSync(path).size;if(size>1024*1024||bytes+size>16*1024*1024){skipped++;continue}bytes+=size;text=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path));if(text.includes('\0')){skipped++;continue}}catch{skipped++;continue}
   for(const [i,line] of text.split(/\r?\n/).entries()){if((args.ignoreCase?line.toLowerCase():line).includes(needle)){matches.push({path:name,line:i+1,text:line.slice(0,1000)});if(matches.length>=(args.limit??50)){limited=true;break}}}if(limited)break
  }
  return {content:[{type:'text',text:JSON.stringify({matches,truncated:scan.truncated||limited,skipped})}],details:{}}
 }}
 const shell=(process.platform==='win32'?createPowerShellTool:createBashTool)(root,{exposeSessionEnvironment:false,spawnHook:ctx=>({...ctx,env:Object.fromEntries(Object.entries(ctx.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|COMSPEC|LANG|LC_ALL)$/i.test(key)))})})
 shell.description+=' This is a trusted host shell, NOT a directory sandbox. cwd is the selected workspace. Do not use rg. On Windows use PowerShell, never cross-shell destructive commands. Do not launch detached background processes. Core credentials are not inherited.'
 const pythonAlias=process.platform==='win32'&&/[/\\]Microsoft[/\\]WindowsApps[/\\]/i.test(Bun.which('python')??'')
 const pythonLauncher=process.platform==='win32'&&!!Bun.which('py')
 if(pythonLauncher)shell.description+=' The py launcher is present on this host. Prefer py -3 for Python scripts and py -3 -c for short code.'
 if(pythonAlias)shell.description+=' The python command resolves to a Windows Store app-execution alias, not a verified interpreter. Do not use it to run scripts; use py -3 if available, or inspect other installed runtimes.'
 const execute=shell.execute
 shell.execute=async(id,args,signal,update)=>{
  if(!args.command.trim()||args.command.length>20000)throw Error('命令为空或过长')
  if(permission!=='full')await authorize(id,shell.name,args,`${shell.name} ${args.command}`,signal)
  signal?.throwIfAborted()
  const before=await snapshot(root);signal?.throwIfAborted()
  let result:Awaited<ReturnType<typeof execute>>|undefined
  try{result=await execute(id,{...args,timeout:Math.max(1,Math.min(args.timeout??120,600))},signal,update);return result}
  catch(error){
   if(!signal?.aborted&&pythonAlias&&/(?:^|[;|\r\n])\s*python(?:3)?(?:\.exe)?\s/i.test(args.command))throw Error(`${error instanceof Error?error.message:'Shell command failed'}\nThe python executable on PATH is a Windows Store alias. ${pythonLauncher?'Use the installed py launcher (py -3), rather than retrying python.':'Inspect installed runtimes with Get-Command; do not assume Python is usable.'}`)
   throw error
  }
  finally{let complete=false;try{const after=await snapshot(root);diffSnapshots(before,after,changed);complete=before.complete&&after.complete}catch{ /* Preserve execution errors; do not fabricate diffs. */ }
   if(result&&!complete)result.content.push({type:'text',text:'Workspace diff scan is partial or unavailable. Large/excluded files and changes outside the workspace are not tracked.'})
  }
 }
 return [ls,find,search,shell]
}
