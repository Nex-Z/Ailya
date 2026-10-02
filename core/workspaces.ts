import {realpathSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import type {Storage} from './storage'
import type {Session} from './contracts'
export class Workspaces{
 constructor(private storage:Storage,private defaultPath:string){}
 private identity(path:string){return process.platform==='win32'?path.toLowerCase():path}
 remember(input:string){
  const path=realpathSync(input==='Ailya'?this.defaultPath:input)
  if(!statSync(path).isDirectory())throw Error('工作空间必须是目录')
  const key='workspace:'+createHash('sha256').update(this.identity(path)).digest('hex')
  this.storage.db.run('INSERT INTO core_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,JSON.stringify({path,usedAt:Date.now()})])
  return {path}
 }
 list(){
  const saved=this.storage.all<{value:string}>("SELECT value FROM core_settings WHERE key LIKE 'workspace:%'").map(r=>JSON.parse(r.value) as {path:string;usedAt:number}).sort((a,b)=>b.usedAt-a.usedAt)
  const paths=[...saved.map(r=>r.path),...this.storage.list<Session>().map(s=>s.context.workspace),this.defaultPath]
  const seen=new Set<string>()
  return paths.filter(Boolean).map(p=>p==='Ailya'?this.defaultPath:p).filter(p=>{const id=this.identity(p);if(seen.has(id))return false;seen.add(id);return true}).map(path=>({path}))
 }
}
