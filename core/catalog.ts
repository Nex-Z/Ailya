import {z} from 'zod'
import type {Storage} from './storage'
const identity={id:z.string().min(1).max(100),name:z.string().trim().min(1).max(64)}
export const agentSchema=z.object({...identity,model:z.string().max(500),skills:z.array(z.string()).max(100),tools:z.array(z.string()).max(100),prompt:z.string().max(50000)}).strict()
export const groupSchema=z.object({...identity,coordinator:z.string(),members:z.array(z.string()).min(1).max(100)}).strict()
export type AgentConfig=z.infer<typeof agentSchema>
export type GroupConfig=z.infer<typeof groupSchema>
export class Catalog{
 constructor(private storage:Storage){}
 list(){const rows=this.storage.all<{kind:string;data:string}>('SELECT kind,data FROM catalog');return {agents:rows.filter(r=>r.kind==='agents').map(r=>JSON.parse(r.data) as AgentConfig),groups:rows.filter(r=>r.kind==='groups').map(r=>JSON.parse(r.data) as GroupConfig)}}
 save(kind:'agents'|'groups',input:unknown){
  const value=kind==='agents'?agentSchema.parse(input):groupSchema.parse(input),all=this.list()
  if(value.name.toLowerCase()==='ailya'&&(kind!=='agents'||value.id!=='Ailya'))throw Error('Ailya 是内置角色名称')
  if([...all.agents,...all.groups].some(x=>x.id!==value.id&&x.name.toLowerCase()===value.name.toLowerCase()))throw Error('名称已存在')
  if('members' in value&&[value.coordinator,...value.members].some(id=>!all.agents.some(a=>a.id===id)))throw Error('请选择有效 Agent')
  const old=this.storage.get<{kind:string}>('SELECT kind FROM catalog WHERE id=?',value.id)
  if(old&&old.kind!==kind)throw Error('资源类型不能修改')
  this.storage.db.run('INSERT INTO catalog VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,data=excluded.data',[value.id,kind,value.name,JSON.stringify(value)])
  return this.list()
 }
 remove(kind:'agents'|'groups',id:string){
  if(kind==='agents'&&this.list().groups.some(g=>g.coordinator===id||g.members.includes(id)))throw Error('Agent 正被 Group 使用')
  this.storage.db.run('DELETE FROM catalog WHERE id=? AND kind=?',[id,kind]);return this.list()
 }
 import(input:unknown){
  const data=z.object({agents:z.array(agentSchema).max(500),groups:z.array(groupSchema).max(500)}).strict().parse(input)
  this.storage.db.transaction(()=>{for(const kind of ['agents','groups'] as const)for(const value of data[kind]){
   const key='prototype-catalog:'+value.id
   if(this.storage.get('SELECT key FROM core_settings WHERE key=?',key))continue
   if(!this.storage.get('SELECT id FROM catalog WHERE id=?',value.id))this.save(kind,value)
   this.storage.db.run('INSERT INTO core_settings VALUES(?,?)',[key,'true'])
  }})();return this.list()
 }
}
