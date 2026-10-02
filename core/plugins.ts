import {z} from 'zod'
import {mkdirSync,mkdtempSync,existsSync,lstatSync} from 'node:fs'
import {join,dirname} from 'node:path'
import type {Storage} from './storage'
import {PluginHost} from './plugin-host'
import {pluginFiles,writePluginFiles,pluginHash,removePluginCache,type PluginFile} from './plugin-files'
export const pluginInput=z.object({id:z.string().uuid(),kind:z.enum(['npm','Git','本地路径']),source:z.string().trim().min(1).max(4096),enabled:z.boolean().default(true)}).strict()
export type PluginInput=z.infer<typeof pluginInput>
export type PluginRow={id:string;kind:string;source:string;enabled:number;active_version:string|null;error:string|null;updated_at:number}
export type PluginVersion={id:string;plugin_id:string;source:string;hash:string;version:string;entries:string;tools:string;created_at:number}
export type PluginTool={name:string;label:string;description:string;parameters:Record<string,unknown>}
export class Plugins{
 readonly cache:string
 readonly jobs=new Map<string,Promise<void>>()
 private hosts=new Set<PluginHost>()
 private closing=false
 constructor(readonly storage:Storage,dataPath:string){
  this.cache=join(dirname(dataPath),'plugin-cache');if(existsSync(this.cache)&&lstatSync(this.cache).isSymbolicLink())throw Error('插件缓存不能是目录联接');mkdirSync(this.cache,{recursive:true})
  this.storage.db.transaction(()=>{for(const job of this.storage.all<{id:string;plugin_id:string}>("SELECT id,plugin_id FROM plugin_jobs WHERE status='running'")){this.storage.db.run("UPDATE plugin_jobs SET status='interrupted',error='Core 重启，操作已中断',finished_at=? WHERE id=?",[Date.now(),job.id]);this.storage.db.run("UPDATE plugins SET error='Core 重启，插件操作已中断' WHERE id=?",[job.plugin_id])}})()
  this.collect()
 }
 get(id:string){return this.storage.get<PluginRow>('SELECT * FROM plugins WHERE id=?',id)}
 version(id:string){const row=this.storage.get<PluginVersion>('SELECT * FROM plugin_versions WHERE id=?',id);if(!row)throw Error('插件版本不存在');return row}
 list(){return this.storage.all<PluginRow>('SELECT * FROM plugins ORDER BY updated_at DESC').map(p=>({...p,enabled:!!p.enabled,version:p.active_version?this.version(p.active_version).version:null,tools:p.active_version?JSON.parse(this.version(p.active_version).tools):[],job:this.storage.get('SELECT id,action,status,error,started_at,finished_at FROM plugin_jobs WHERE plugin_id=? ORDER BY rowid DESC LIMIT 1',p.id)??null}))}
 private idle(id:string){if(this.closing)throw Error('Core 正在关闭');if(this.jobs.has(id))throw Error('插件操作进行中，请稍后重试')}
 private source(input:PluginInput){
  if(input.kind==='npm'&&!/^npm:(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:@[a-zA-Z0-9.^~*+_-]+)?$/.test(input.source))throw Error('npm 来源格式应为 npm:包名 或 npm:@scope/包名@版本')
  if(input.kind==='Git'&&!/^git:(?:https?:\/\/)?[a-zA-Z0-9.-]+(?::[0-9]{1,5})?\/[\w./-]+(?:@[\w./-]+)?$/.test(input.source))throw Error('Git 来源格式应为 git:github.com/用户/仓库@引用，不接受凭据或本地协议')
  if(input.kind==='Git'&&input.source.split('/').some(p=>p==='.'||p==='..'))throw Error('Git 来源不能包含路径穿越')
  if(input.kind==='本地路径'&&!existsSync(input.source))throw Error('本地插件路径不存在')
 }
 start(raw:unknown,action:'install'|'update'|'reload'='install'){
  const input=pluginInput.parse(raw);if(action!=='reload')this.source(input);this.idle(input.id)
  const old=this.get(input.id);if(action!=='install'&&!old)throw Error('插件不存在');if(action==='reload'&&!old?.active_version)throw Error('插件尚未安装')
  const jobId=crypto.randomUUID(),now=Date.now()
  this.storage.db.transaction(()=>{if(!old)this.storage.db.run('INSERT INTO plugins VALUES(?,?,?,?,?,?,?)',[input.id,input.kind,input.source,0,null,null,now]);this.storage.db.run('INSERT INTO plugin_jobs VALUES(?,?,?,?,?,?,?,?)',[jobId,input.id,action,'running',JSON.stringify(input),null,now,null]);this.storage.db.run('UPDATE plugins SET error=NULL WHERE id=?',[input.id])})()
  const work=this.install(input,action,jobId).catch(error=>{const message=(error instanceof Error?error.message:'插件操作失败').slice(0,4000);this.storage.db.run('UPDATE plugins SET error=? WHERE id=?',[message,input.id]);this.storage.db.run("UPDATE plugin_jobs SET status='failed',error=?,finished_at=? WHERE id=?",[message,Date.now(),jobId])}).finally(()=>this.jobs.delete(input.id))
  this.jobs.set(input.id,work);return {id:input.id,jobId}
 }
 private async install(input:PluginInput,action:string,jobId:string){
  const stage=mkdtempSync(join(this.cache,'install-')),host=new PluginHost(stage);this.hosts.add(host)
  try{
   let entries:string[],version:string,files:PluginFile[]
   if(action==='reload'){const previous=this.version(this.get(input.id)!.active_version!);entries=JSON.parse(previous.entries);version=previous.version;files=this.files(previous.id);writePluginFiles(stage,files)}
   else{({entries,version}=await host.request<{entries:string[];version:string}>({op:'prepare',root:stage,source:input.source,kind:input.kind},undefined,180000));files=pluginFiles(stage)}
   const tools=await host.request<PluginTool[]>({op:'load',root:stage,entries,workspace:stage},undefined,30000)
   if(this.closing)throw Error('Core 正在关闭，插件操作已中断')
   const hash=pluginHash(JSON.stringify([...files].sort((a,b)=>a.path.localeCompare(b.path)).map(f=>[f.path,pluginHash(f.bytes)]))),id=crypto.randomUUID()
   this.storage.db.transaction(()=>{
    this.storage.db.run('INSERT INTO plugin_versions VALUES(?,?,?,?,?,?,?,?)',[id,input.id,input.source,hash,version,JSON.stringify(entries),JSON.stringify(tools),Date.now()])
    for(const file of files)this.storage.db.run('INSERT INTO plugin_files VALUES(?,?,?)',[id,file.path,file.bytes])
    this.storage.db.run('UPDATE plugins SET kind=?,source=?,enabled=?,active_version=?,error=NULL,updated_at=? WHERE id=?',[input.kind,input.source,Number(input.enabled),id,Date.now(),input.id])
    this.storage.db.run("UPDATE plugin_jobs SET status='completed',finished_at=? WHERE id=?",[Date.now(),jobId]);this.collect()
   })()
  }finally{await host.close();this.hosts.delete(host);removePluginCache(this.cache,stage)}
 }
 files(versionId:string){return this.storage.all<PluginFile>('SELECT path,bytes FROM plugin_files WHERE version_id=?',versionId)}
 setEnabled(id:string,enabled:boolean){this.idle(id);const p=this.get(id);if(!p)throw Error('插件不存在');if(enabled&&!p.active_version)throw Error('请先安装插件');this.storage.db.run('UPDATE plugins SET enabled=?,updated_at=? WHERE id=?',[Number(enabled),Date.now(),id])}
 remove(id:string){this.idle(id);this.storage.db.transaction(()=>{this.storage.db.run('DELETE FROM plugins WHERE id=?',[id]);this.storage.db.run('DELETE FROM plugin_jobs WHERE plugin_id=?',[id]);this.collect()})()}
 collect(){this.storage.db.run('DELETE FROM plugin_versions WHERE id NOT IN (SELECT active_version FROM plugins WHERE active_version IS NOT NULL) AND id NOT IN (SELECT version_id FROM task_plugins)')}
 snapshot(taskId:string){this.storage.db.run('INSERT INTO task_plugins SELECT ?,id,active_version FROM plugins WHERE enabled=1 AND active_version IS NOT NULL',[taskId])}
 selected(taskId:string){return this.storage.all<PluginVersion>('SELECT v.* FROM task_plugins t JOIN plugin_versions v ON v.id=t.version_id WHERE t.task_id=?',taskId)}
 permitted(version:PluginVersion){if(!this.get(version.plugin_id)?.enabled)throw Error('插件已停用或卸载')}
 importPrototype(raw:unknown){const rows=z.array(pluginInput).max(500).parse(raw);this.storage.db.transaction(()=>{for(const row of rows){const key='prototype-plugin:'+row.id;if(this.storage.get('SELECT key FROM core_settings WHERE key=?',key))continue;if(!this.get(row.id))this.storage.db.run('INSERT INTO plugins VALUES(?,?,?,?,?,?,?)',[row.id,row.kind,row.source,0,null,null,Date.now()]);this.storage.db.run('INSERT INTO core_settings VALUES(?,?)',[key,'true'])}})();return this.list()}
 async close(){this.closing=true;await Promise.allSettled([...this.hosts].map(h=>h.close()));await Promise.allSettled(this.jobs.values())}
}
