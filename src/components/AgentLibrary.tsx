import { useProviders,modelKey,modelLabel } from '../providers'
import { useState,useEffect } from 'react'
import { Bot, Users, Plus, Pencil, Trash2 } from 'lucide-react'
import { useCatalog, type AgentConfig, type GroupConfig } from '../catalog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogCancel } from './ui/alert-dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import { MultiSelect } from './ui/multi-select'
import { useResources } from '../resources'
import { agents as builtInAgents } from '../demo/agents'

type Form = { id: string; name: string; model: string; skills: string[]; tools: string[]; prompt: string; coordinator: string; members: string[] }
const blank = (): Form => ({id:crypto.randomUUID(),name:'',model:'默认模型',skills:[],tools:[],prompt:'',coordinator:'',members:[]})
export function AgentLibrary({ kind, start }: { kind: 'agents' | 'groups'; start: (name: string) => void }) {
 const {agents,groups,saveAgent,saveGroup,remove}=useCatalog()
 const [query,setQuery]=useState('')
 const [mode,setMode]=useState<'new'|'edit'|'detail'|null>(null)
 const [form,setForm]=useState<Form>(blank)
 const models=useProviders(s=>s.items).flatMap(p=>p.models.map(m=>modelKey(p.id,m)))
 const resources=useResources(s=>s.items)
 const loadResources=useResources(s=>s.load)
 useEffect(()=>{void loadResources()},[loadResources])
 const skillOptions=[...new Set([...builtInAgents.flatMap(a=>a.skills),...resources.filter(r=>r.kind==='skill').map(r=>r.name),...form.skills])]
 const toolOptions=[...new Set(['文件','Shell','联网搜索','定时任务','MCP',...builtInAgents.flatMap(a=>a.tools),...resources.filter(r=>r.kind==='mcp').map(r=>r.name),...form.tools])]
 const [error,setError]=useState('')
 const [deleting,setDeleting]=useState<AgentConfig|GroupConfig|null>(null)
 const isGroup=kind==='groups'; const label=isGroup?'Group':'Agent'; const Icon=isGroup?Users:Bot
 const rows=(isGroup?groups:agents).filter(x=>x.name.toLowerCase().includes(query.toLowerCase()))
 const agentName=(id:string)=>agents.find(a=>a.id===id)?.name ?? id
 const open=(row:AgentConfig|GroupConfig, next:'detail'|'edit')=>{setForm({...blank(),...row});setError('');setMode(next)}
 const patch=(value:Partial<Form>)=>setForm(f=>({...f,...value}))
 const save=async()=>{const result=isGroup?await saveGroup({id:form.id,name:form.name,coordinator:form.coordinator,members:form.members}):await saveAgent({id:form.id,name:form.name,model:form.model,skills:form.skills,tools:form.tools,prompt:form.prompt});setError(result??'');if(!result)setMode(null)}
 return <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 md:px-8"><div className="mx-auto max-w-5xl">
 <div className="mb-6 flex items-center justify-between"><h1 className="text-xl font-medium">{label}</h1><Button size="sm" onClick={()=>{setForm(blank());setError('');setMode('new')}}><Plus/>新增 {label}</Button></div>
 <Input aria-label={`搜索 ${label}`} placeholder="搜索" value={query} onChange={e=>setQuery(e.target.value)} className="mb-6 max-w-xs"/>
 <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{rows.map(row=><article key={row.id} className="rounded-lg border bg-popover p-4"><Button variant="ghost" className="mb-4 h-auto w-full justify-start gap-3 p-0 py-2 text-sm hover:bg-transparent" aria-label={`查看 ${row.name}`} onClick={()=>open(row,'detail')}><span className="rounded-md bg-muted p-2"><Icon className="size-5"/></span><span className="truncate">{row.name}</span></Button><div className="mb-5 min-h-10 text-xs leading-6 text-muted-foreground">{'members' in row?row.members.map(agentName).join(' / '):modelLabel(row.model)}</div><div className="flex items-center gap-1 border-t pt-3"><Button variant="ghost" size="sm" onClick={()=>open(row,'detail')}>详情</Button><Button variant="ghost" size="icon" className="ml-auto size-8" aria-label={`编辑 ${row.name}`} onClick={()=>open(row,'edit')}><Pencil className="size-3.5"/></Button><Button variant="ghost" size="icon" className="size-8" aria-label={`删除 ${row.name}`} onClick={()=>{setError('');setDeleting(row)}}><Trash2 className="size-3.5"/></Button></div></article>)}</div>{!rows.length&&<p className="py-8 text-sm text-muted-foreground">没有匹配项</p>}
 <Dialog open={!!mode} onOpenChange={v=>{if(!v)setMode(null)}}><DialogContent aria-describedby={undefined} className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg"><DialogHeader><DialogTitle>{mode==='detail'?form.name:`${mode==='new'?'新增':'编辑'} ${label}`}</DialogTitle></DialogHeader>
 {mode==='detail'?<dl className="divide-y text-sm">{(isGroup?[['协调者',agentName(form.coordinator)],['成员',form.members.map(agentName).join('、')]]:[['模型',modelLabel(form.model)],['Skills',form.skills.join('、')||'—'],['Tools',form.tools.join('、')||'—'],['Prompt',form.prompt||'—']]).map(([key,value])=><div className="grid grid-cols-[80px_1fr] gap-4 py-3" key={key}><dt className="text-muted-foreground">{key}</dt><dd className="whitespace-pre-wrap break-words leading-6">{value}</dd></div>)}</dl>:<form id="catalog-form" className="space-y-4" onSubmit={e=>{e.preventDefault();save()}}>
 <label className="block space-y-2 text-sm"><span>名称</span><Input value={form.name} maxLength={64} onChange={e=>patch({name:e.target.value})}/></label>
 {isGroup?<><div className="space-y-2 text-sm"><label id="coordinator-label">协调者</label><Select value={form.coordinator} onValueChange={coordinator=>patch({coordinator})}><SelectTrigger aria-labelledby="coordinator-label"><SelectValue placeholder="选择 Agent"/></SelectTrigger><SelectContent>{agents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div><fieldset className="space-y-2"><legend className="mb-2 text-sm">成员</legend><div className="flex flex-wrap gap-2">{agents.map(a=><Button type="button" size="sm" variant={form.members.includes(a.id)?'secondary':'outline'} aria-pressed={form.members.includes(a.id)} key={a.id} onClick={()=>patch({members:form.members.includes(a.id)?form.members.filter(id=>id!==a.id):[...form.members,a.id]})}>{a.name}</Button>)}</div></fieldset></>:<><div className="space-y-2 text-sm"><label id="agent-model-label">模型</label><Select value={form.model} onValueChange={model=>patch({model})}><SelectTrigger aria-labelledby="agent-model-label"><SelectValue/></SelectTrigger><SelectContent>{[...new Set(['默认模型',...models,form.model])].map(model=><SelectItem key={model} value={model}>{modelLabel(model)}</SelectItem>)}</SelectContent></Select></div><MultiSelect label="Skills" options={skillOptions} value={form.skills} onChange={skills=>patch({skills})}/><MultiSelect label="Tools" options={toolOptions} value={form.tools} onChange={tools=>patch({tools})}/><label className="block space-y-2 text-sm"><span>Prompt</span><Textarea className="min-h-28" value={form.prompt} onChange={e=>patch({prompt:e.target.value})}/></label></>}
 {error&&<p role="alert" className="text-sm">{error}</p>}</form>}
 <DialogFooter>{mode==='detail'?<><Button variant="outline" onClick={()=>setMode('edit')}>编辑</Button><Button onClick={()=>{setMode(null);start(form.name)}}>新建会话</Button></>:<><Button variant="outline" onClick={()=>setMode(null)}>取消</Button><Button type="submit" form="catalog-form">保存</Button></>}</DialogFooter></DialogContent></Dialog>
 <AlertDialog open={!!deleting} onOpenChange={v=>{if(!v)setDeleting(null)}}><AlertDialogContent aria-describedby={undefined} className="w-[calc(100%-2rem)] rounded-lg"><AlertDialogHeader><AlertDialogTitle>删除 {deleting?.name}？</AlertDialogTitle></AlertDialogHeader>{error&&<p role="alert" className="text-sm">{error}</p>}<AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button onClick={async()=>{if(!deleting)return;const result=await remove(kind,deleting.id);setError(result??'');if(!result)setDeleting(null)}}>删除</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div></div>
}




