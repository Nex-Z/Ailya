import { DirectoryPicker } from './ui/directory-picker'

import { TimePicker } from './ui/time-picker'
import { useState } from 'react'
import { useCatalog } from '../catalog'
import { useResources,resourceLabel,type Resource } from '../resources'
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Select,SelectTrigger,SelectValue,SelectContent,SelectItem } from './ui/select'
function Choice({label,value,values,onChange}:{label:string;value:string;values:[string,string][];onChange:(v:string)=>void}){return <div className="space-y-2"><span className="text-sm">{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{values.map(([id,name])=><SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>}
export function ResourceEditor({entry,close,saved}:{entry:Resource;close:()=>void;saved:(entry:Resource,isNew:boolean)=>void}){
 const [form,setForm]=useState(entry);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const {items,save}=useResources();const {agents,groups}=useCatalog();const isNew=!items.some(x=>x.id===entry.id)
 const patch=(value:Partial<Resource>)=>setForm(f=>({...f,...value}))
 const [credentials,setCredentials]=useState(JSON.stringify(entry.transport==='http'?entry.headers??{}:entry.env??{},null,2))
 const submit=async()=>{
  let next=form
  if(form.kind==='mcp'){try{const value=JSON.parse(credentials);if(!value||Array.isArray(value)||typeof value!=='object'||Object.values(value).some(x=>typeof x!=='string'))throw Error();next={...form,[form.transport==='http'?'headers':'env']:value}}catch{setError('请输入值为字符串的 JSON 对象');return}}
  setBusy(true);const message=await save(next);setBusy(false);setError(message??'');if(!message){saved(next,isNew);close()}
 }
 const roles=[...new Set([...agents,...groups].map(a=>a.name).concat(form.agent))]
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)close()}}><DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg"><DialogHeader><DialogTitle>{isNew?'新增':'编辑'} {resourceLabel[form.kind]}</DialogTitle></DialogHeader><form id="resource-form" className="space-y-4" onSubmit={async e=>{e.preventDefault();if(!busy)await submit()}}>
 <label className="block space-y-2 text-sm"><span>名称</span><Input value={form.name} maxLength={80} onChange={e=>patch({name:e.target.value})}/></label>
 {form.kind==='mcp'?<><Choice label="传输方式" value={form.transport} values={[["stdio","stdio"],["http","HTTP"]]} onChange={v=>{patch({transport:v as Resource['transport']});setCredentials(JSON.stringify(v==='http'?form.headers??{}:form.env??{},null,2))}}/>{form.transport==='stdio'?<label className="block space-y-2 text-sm"><span>启动命令</span><Input value={form.command} onChange={e=>patch({command:e.target.value})}/></label>:<label className="block space-y-2 text-sm"><span>服务地址</span><Input value={form.endpoint} onChange={e=>patch({endpoint:e.target.value})}/></label>}</>:<label className="block space-y-2 text-sm"><span>{form.kind==='task'?'任务内容':'Skill 内容'}</span><Textarea className="min-h-24" value={form.instructions} onChange={e=>patch({instructions:e.target.value})}/></label>}
 {form.kind==='mcp'&&<label className="block space-y-2 text-sm"><span>{form.transport==='http'?'请求头 JSON':'环境变量 JSON'}</span><Textarea aria-label={form.transport==='http'?'请求头 JSON':'环境变量 JSON'} autoComplete="off" value={credentials} onChange={e=>setCredentials(e.target.value)}/></label>}
 {form.kind==='task'&&<><div className="grid grid-cols-2 gap-3"><Choice label="频率" value={form.frequency} values={[["daily","每天"],["weekly","每周"],["once","单次"]]} onChange={v=>patch({frequency:v as Resource['frequency']})}/><TimePicker value={form.time} onChange={time=>patch({time})}/></div>{form.frequency==='weekly'&&<Choice label="星期" value={form.weekday} values={['日','一','二','三','四','五','六'].map((v,i)=>[String(i),'周'+v])} onChange={weekday=>patch({weekday})}/>} {form.frequency==='once'&&<label className="block space-y-2 text-sm"><span>日期</span><Input type="date" value={form.date} onChange={e=>patch({date:e.target.value})}/></label>}<Choice label="时区" value={form.timezone} values={[...new Set([form.timezone,'Asia/Hong_Kong','Asia/Shanghai','UTC'])].map(v=>[v,v])} onChange={timezone=>patch({timezone})}/><Choice label="Agent / Group" value={form.agent} values={roles.map(v=>[v,v])} onChange={agent=>patch({agent})}/><DirectoryPicker value={form.workspace} onChange={workspace=>patch({workspace})}/></>}
 <Choice label="状态" value={form.enabled?'enabled':'disabled'} values={[["disabled","停用"],["enabled","启用"]]} onChange={v=>patch({enabled:v==='enabled'})}/>{error&&<p role="alert" className="text-sm">{error}</p>}
 </form><DialogFooter><Button variant="outline" onClick={close}>取消</Button><Button disabled={busy} type="submit" form="resource-form">保存</Button></DialogFooter></DialogContent></Dialog>
}



