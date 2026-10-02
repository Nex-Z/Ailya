import {Database} from 'bun:sqlite'
import {createHash} from 'node:crypto'
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,statSync,lstatSync,realpathSync,existsSync,renameSync,rmSync,openSync,readSync,closeSync} from 'node:fs'
import {dirname,join,resolve,relative,isAbsolute} from 'node:path'
import {z} from 'zod'
import {Storage} from './storage'
import {Memories} from './memory'
import {contextSchema} from './contracts'
import {decryptSecret} from './secrets'
import {resourceSchema} from './resources'
import type {Core} from './core'
const tables=['sessions','tasks','attachments','memories','vector_sources','resources','skill_packages','plugins'] as const
const nameSchema=z.string().regex(/^backup-\d+-[a-f0-9-]+\.sqlite$/)
const digest=(path:string)=>{const hash=createHash('sha256'),fd=openSync(path,'r'),buffer=Buffer.alloc(1024*1024);try{let n:number;while((n=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,n));return hash.digest('hex')}finally{closeSync(fd)}}
function schema(db:Database){return db.query("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().map(row=>{const r=row as {sql:string};return {...r,sql:r.sql?.replace(/\s+/g,'').toLowerCase()}})}
function validate(db:Database){
 if((db.query('PRAGMA integrity_check').get() as {integrity_check:string})?.integrity_check!=='ok')throw Error('备份完整性检查失败')
 const versions=db.query('SELECT version FROM schema_migrations ORDER BY version').all() as {version:number}[]
 const version=versions.at(-1)?.version??0
 if(version<1||version>12||versions.length!==version||versions.some((r,i)=>r.version!==i+1))throw Error('备份版本不受支持或迁移记录不完整')
 const expected=new Database(':memory:')
 try{expected.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)');for(let n=1;n<=version;n++)expected.exec(readFileSync(new URL(`./migrations/${String(n).padStart(4,'0')}.sql`,import.meta.url),'utf8'));if(JSON.stringify(schema(db))!==JSON.stringify(schema(expected)))throw Error('文件不是兼容的 Ailya 备份：数据库结构不匹配')}finally{expected.close()}
 if(db.query('PRAGMA foreign_key_check').all().length)throw Error('备份包含失效的数据关系')
 if(version>=3)for(const row of db.query("SELECT data FROM resources WHERE kind='mcp'").all() as {data:string}[]){try{resourceSchema.parse(JSON.parse(decryptSecret(row.data)))}catch{throw Error('备份中的 MCP 配置无法在当前用户下解密或格式无效；请使用原 Windows 用户迁移配置')}}
 for(const {name} of db.query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[]){for(const col of db.query(`PRAGMA table_info("${name}")`).all() as {name:string}[]){if(['data','config'].includes(col.name)&&db.query(`SELECT 1 FROM "${name}" WHERE ${name==='resources'?"kind<>'mcp' AND ":''}"${col.name}" IS NOT NULL AND NOT json_valid("${col.name}") LIMIT 1`).get())throw Error('备份中的结构化记录已损坏')}}
 if(db.query('SELECT id FROM vector_sources WHERE dimensions<1 OR length(embedding)<>dimensions*4 LIMIT 1').get())throw Error('备份向量数据不完整')
 for(const row of db.query('SELECT id,data FROM sessions').all() as {id:string;data:string}[]){const s=z.object({id:z.string(),title:z.string(),context:contextSchema,messages:z.array(z.object({id:z.string(),role:z.enum(['user','assistant']),text:z.string()}))}).parse(JSON.parse(row.data));if(s.id!==row.id)throw Error('备份会话标识不一致')}
 return version
}
export class Backups{
 readonly root:string
 private previews=new Map<string,{dir:string;path:string;hash:string;expires:number}>()
 constructor(private current:()=>Core){this.root=join(dirname(resolve(current().dataPath)),'backups');if(existsSync(this.root)&&lstatSync(this.root).isSymbolicLink())throw Error('备份目录不能是目录联接');mkdirSync(this.root,{recursive:true})}
 path(name:string){const path=join(this.root,nameSchema.parse(name));if(lstatSync(path).isSymbolicLink()||!statSync(path).isFile())throw Error('备份文件无效');return path}
 list(){return readdirSync(this.root).filter(n=>nameSchema.safeParse(n).success).map(name=>{const path=this.path(name),s=statSync(path);return {name,size:s.size,createdAt:s.mtimeMs}}).sort((a,b)=>b.createdAt-a.createdAt)}
 create(){const name=`backup-${Date.now()}-${crypto.randomUUID()}.sqlite`;this.current().storage.backup(join(this.root,name));return {...this.list().find(b=>b.name===name)!,path:join(this.root,name)}}
 private cleanup(dir:string){const rel=relative(realpathSync(this.root),resolve(dir));if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('恢复临时目录越界');rmSync(dir,{recursive:true,force:true})}
 preview(source:string){
  for(const [id,p] of this.previews)if(p.expires<Date.now()){this.cleanup(p.dir);this.previews.delete(id)}
  if(this.previews.size>=5)throw Error('待确认的恢复过多，请稍后重试')
  const actual=realpathSync(source);if(actual.toLowerCase()===realpathSync(this.current().dataPath).toLowerCase())throw Error('不能将当前运行数据库作为恢复来源')
  if(!statSync(actual).isFile()||statSync(actual).size>1024*1024*1024)throw Error('请选择不超过 1 GB 的 SQLite 备份')
  const dir=mkdtempSync(join(this.root,'preview-')),path=join(dir,'restore.sqlite')
  try{
   const sourceDb=new Database(actual,{readonly:true})
   let sourceVersion:number
   try{sourceDb.exec('PRAGMA trusted_schema=OFF');sourceVersion=validate(sourceDb);sourceDb.run('VACUUM INTO ?',[path])}finally{sourceDb.close()}
   const staged=new Storage(path)
   let counts:Record<string,number>
   try{validate(staged.db);this.sanitize(staged,this.current().memories.deletionLedger());counts=Object.fromEntries(tables.map(t=>[t,staged.get<{n:number}>(`SELECT count(*) n FROM ${t}`)!.n]))}finally{staged.close()}
   const id=crypto.randomUUID(),hash=digest(path),expires=Date.now()+10*60*1000;this.previews.set(id,{dir,path,hash,expires})
   return {id,sourceVersion,version:12,counts,expiresAt:expires,size:statSync(path).size}
  }catch(error){this.cleanup(dir);throw error}
 }
 async restore(id:string,swap:(path:string,rollback:string)=>Promise<void>){
  const preview=this.previews.get(id);if(!preview||preview.expires<Date.now())throw Error('恢复预览已过期，请重新检查')
  if(digest(preview.path)!==preview.hash)throw Error('恢复副本已变化，请重新检查')
  const core=this.current();if(core.active.size||core.plugins.jobs.size||core.compaction.jobs.size)throw Error('请等待执行、安装和压缩完成后再恢复')
  const ledger=core.memories.deletionLedger(),staged=new Storage(preview.path)
  try{
   this.sanitize(staged,ledger);validate(staged.db)
  }finally{staged.close()}
  const rollback=this.create()
  this.previews.delete(id)
  try{await swap(preview.path,rollback.path);return {ok:true,rollback}}finally{this.cleanup(preview.dir)}
 }
 close(){for(const p of this.previews.values())this.cleanup(p.dir);this.previews.clear()}
 discard(id:string){const preview=this.previews.get(id);if(preview){this.cleanup(preview.dir);this.previews.delete(id)}}
 private sanitize(staged:Storage,ledger:ReturnType<Memories['deletionLedger']>){
  // Restoring an old backup must not replay external conversations or resend old messages.
  staged.db.run("UPDATE im_accounts SET config=json_set(config,'$.enabled',json('false')),status='disabled'")
  staged.db.run("UPDATE im_inbox SET state='cancelled' WHERE state IN ('pending','processing')")
  staged.db.run("UPDATE im_outbox SET state='cancelled' WHERE state='pending'")
  staged.db.run("UPDATE im_outbox SET state='uncertain' WHERE state='sending'")
  const memories=new Memories(staged,this.current().workspace,sessionId=>{staged.db.run('DELETE FROM context_summaries WHERE session_id=?',[sessionId]);staged.db.run('DELETE FROM context_segments WHERE session_id=?',[sessionId])},false);try{memories.applyDeletionLedger(ledger)}finally{void memories.index.close()}}
}

// Replace only a closed database. The sibling rename is atomic; the caller retains the Core lock.
export function replaceDatabase(source:string,destination:string){
 const dir=realpathSync(dirname(destination)),target=resolve(destination)
 if(dirname(target).toLowerCase()!==dir.toLowerCase())throw Error('数据库目标目录已变化')
 for(const suffix of ['-wal','-shm']){const file=target+suffix;if(existsSync(file)){if(suffix==='-wal'&&statSync(file).size>0)throw Error('数据库 WAL 尚未关闭，不能恢复');rmSync(file)}}
 renameSync(source,target)
}
