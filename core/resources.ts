import {z} from 'zod'
import {CronDate,CronExpressionParser} from 'cron-parser'
import {realpathSync,statSync} from 'node:fs'
import {Storage} from './storage'
import {encryptSecret,decryptSecret} from './secrets'
import {RuntimeSkills,type SkillPackage} from './runtime-skills'

export const resourceSchema=z.object({
 id:z.string().uuid(),kind:z.enum(['mcp','skill','task']),name:z.string().trim().min(1).max(80),enabled:z.boolean().default(false),
 transport:z.enum(['stdio','http']).default('stdio'),command:z.string().max(10000).default(''),endpoint:z.string().max(4096).default(''),
 env:z.record(z.string(),z.string()).default({}),headers:z.record(z.string(),z.string()).default({}),
 instructions:z.string().max(50000).default(''),frequency:z.enum(['daily','weekly','once']).default('daily'),time:z.string().default(''),weekday:z.string().regex(/^[0-6]$/).default('1'),date:z.string().default(''),
 timezone:z.string().default('Asia/Hong_Kong'),agent:z.string().default('Ailya'),workspace:z.string().max(4096).default('Ailya'),model:z.string().max(500).default('默认模型'),permission:z.enum(['default','full']).default('default'),sourceSession:z.string().optional(),
}).strict()
export type Resource=z.infer<typeof resourceSchema>
type Row={id:string;kind:string;name:string;data:string;enabled:number;next_run:number|null;updated_at:number}
export function nextRun(r:Resource,now:number):number|null{
 if(!r.enabled||r.kind!=='task')return null
 if(r.frequency==='once'){const date=new CronDate(`${r.date}T${r.time}:00`,r.timezone);return date.getTime()>now?date.getTime():null}
 const [hour,minute]=r.time.split(':').map(Number)
 return CronExpressionParser.parse(`${minute} ${hour} * * ${r.frequency==='weekly'?r.weekday:'*'}`,{currentDate:new Date(now),tz:r.timezone}).next().getTime()
}
export class Resources{
 skills:RuntimeSkills
 constructor(public storage:Storage,private defaultWorkspace:string){this.skills=new RuntimeSkills(storage)}
 decode(row:Row):Resource{return JSON.parse(row.kind==='mcp'?decryptSecret(row.data):row.data)}
 list(){return this.storage.all<Row>('SELECT * FROM resources ORDER BY updated_at DESC').map(row=>({...this.decode(row),...(row.kind==='skill'?{skill:this.skills.metadata(row.id)}:{}),nextRun:row.next_run,lastRun:this.storage.get('SELECT id,due_at,status,session_id,error FROM schedule_runs WHERE resource_id=? ORDER BY due_at DESC LIMIT 1',row.id)??null}))}
 get(id:string){const row=this.storage.get<Row>('SELECT * FROM resources WHERE id=?',id);return row?this.decode(row):undefined}
 save(input:unknown,now=Date.now(),imported?:SkillPackage){
  const r=resourceSchema.parse(input)
  const old=this.get(r.id);if(old&&old.kind!==r.kind)throw Error('资源类型不能修改')
  const skill=r.kind==='skill'&&(r.enabled||r.instructions.trim())?this.skills.prepare(r,imported):undefined
  if(r.kind==='mcp'){
   if(r.transport==='stdio'&&!r.command.trim())throw Error('请输入 MCP 启动命令')
   if(r.transport==='http'){const u=new URL(r.endpoint);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('MCP 地址无效')}
  }
  if(r.kind==='task'&&r.enabled){
   if(!r.instructions.trim())throw Error('请输入任务内容')
   if(r.agent!=='Ailya')throw Error('Agent/Group 执行尚未接入')
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))throw Error('执行时间无效')
   new Intl.DateTimeFormat('en',{timeZone:r.timezone})
   if(r.frequency==='once'){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date))throw Error('单次任务需要日期')
    const date=new CronDate(`${r.date}T${r.time}:00`,r.timezone)
    if(date.getFullYear()!==Number(r.date.slice(0,4))||date.getMonth()+1!==Number(r.date.slice(5,7))||date.getDate()!==Number(r.date.slice(8))||date.getHours()!==Number(r.time.slice(0,2)))throw Error('执行日期或时区时间不存在')
    if(r.enabled&&date.getTime()<=now)throw Error('执行时间必须在未来')
   }
   r.workspace=realpathSync(r.workspace==='Ailya'?this.defaultWorkspace:r.workspace);if(!statSync(r.workspace).isDirectory())throw Error('工作空间必须是目录')
  }
  const data=JSON.stringify(r),due=nextRun(r,now)
  try{this.storage.db.transaction(()=>{this.storage.db.run('INSERT INTO resources VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,data=excluded.data,enabled=excluded.enabled,next_run=excluded.next_run,updated_at=excluded.updated_at',[r.id,r.kind,r.name,r.kind==='mcp'?encryptSecret(data):data,Number(r.enabled),due,now]);if(skill)this.skills.persist(r.id,skill)})()}catch(e){if(String(e).includes('UNIQUE'))throw Error('名称或 Skill 标识已存在');throw e}
  return r
 }
 importSkill(path:string,enabled=false){const pack=this.skills.readDirectory(path);return this.save({id:crypto.randomUUID(),kind:'skill',name:pack.meta.name,instructions:pack.document,enabled},Date.now(),pack)}
 remove(id:string){this.storage.db.run('DELETE FROM resources WHERE id=?',[id])}
 importPrototype(input:unknown){
  const rows=z.array(z.unknown()).max(500).parse(input)
  this.storage.db.transaction(()=>{for(const row of rows){
   const r=resourceSchema.parse(row),key='prototype-resource:'+r.id
   if(this.storage.get('SELECT key FROM core_settings WHERE key=?',key))continue
   if(!this.get(r.id)){
    const conflict=this.storage.get('SELECT id FROM resources WHERE kind=? AND name=? COLLATE NOCASE',r.kind,r.name)
    const preserved={...r,name:conflict?r.name.slice(0,40)+' · '+r.id:r.name,enabled:false}
    this.storage.db.run('INSERT INTO resources VALUES(?,?,?,?,?,?,?)',[r.id,r.kind,preserved.name,r.kind==='mcp'?encryptSecret(JSON.stringify(preserved)):JSON.stringify(preserved),0,null,Date.now()])
   }
   this.storage.db.run('INSERT INTO core_settings VALUES(?,?)',[key,'true'])
  }})();return this.list()
 }
}
