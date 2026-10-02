import { useProviders,modelKey } from '../providers'
import {useState} from 'react'
import {WorkspaceSelect} from './WorkspaceSelect'
import {api} from '../lib/core-api'
import { useCatalog } from '../catalog'
import { FolderOpen, Monitor, Bot } from 'lucide-react'
import { useStore } from '../store'
import { commands } from './command-items'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from './ui/select'
export function ContextSelect({ kind }: { kind: 'workspace' | 'machine' | 'agent' | 'model' }) {

 const [error,setError]=useState('')
 const session = useStore(s => s.sessions.find(x => x.id === s.activeId)!)
 const catalog = useCatalog()
 const providers=useProviders(s=>s.items)
 const update = useStore(s => s.setContext)
 const preferredModel=useStore(s=>s.preferredModel)
 const savingModel=useStore(s=>s.modelSaving)
 const firstProvider=providers.find(p=>p.models.length)
 const firstModel=firstProvider?modelKey(firstProvider.id,firstProvider.models[0]):''
 const fallback=providers.some(p=>p.models.some(m=>modelKey(p.id,m)===preferredModel))?preferredModel:firstModel
 const option = commands.find(c => c.key === kind)
 const label = kind === 'machine' ? '运行机器' : option!.label
 const value = kind === 'machine' ? 'Local' : kind==='model'&&session.context.model==='默认模型'?fallback:session.context[kind]
 const choices = kind === 'agent' ? [...catalog.agents, ...catalog.groups].map(x => x.name) : kind === 'machine' ? ['Local'] : kind === 'model' ? providers.flatMap(p=>p.models.map(m=>modelKey(p.id,m))) : [...option!.values]
 if (!choices.includes(value)) choices.push(value)
 const Icon = kind === 'workspace' ? FolderOpen : kind === 'machine' ? Monitor : kind === 'agent' ? Bot : null
 if(kind==='workspace')return <WorkspaceSelect value={value} disabled={!!session.messages.length} onChange={path=>useStore.setState(s=>({sessions:s.sessions.map(x=>x.id===session.id&&!x.messages.length?{...x,context:{...x.context,workspace:path}}:x)}))}/>
 return <><Select value={value} disabled={kind==='model'?savingModel||session.messages.some(m=>m.executing):!!session.messages.length} onValueChange={async v => {
  if(kind!=='model'){if(kind!=='machine')update(kind,v);return}
  const id=session.id;setError('');useStore.setState({modelSaving:true})
  try{await api('/model-selection',{sessionId:id,model:v});useStore.setState(s=>({preferredModel:v,sessions:s.sessions.map(x=>x.id===id?{...x,context:{...x.context,model:v}}:x)}))}
  catch(e){setError(e instanceof Error?e.message:'模型保存失败')}
  finally{useStore.setState({modelSaving:false})}
 }}>
  <SelectTrigger aria-label={label} className="h-8 w-auto max-w-44 gap-2 border-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent focus:ring-1 disabled:opacity-60 [&>svg]:size-3">
   {Icon && <Icon className="size-3.5 shrink-0"/>}<SelectValue placeholder="选择模型">{kind==='model'?(()=>{try{return JSON.parse(value)[1]}catch{return value||'选择模型'}})():kind==='machine'?'本地':value}</SelectValue>
  </SelectTrigger>
  <SelectContent side="bottom" align={kind === 'model' ? 'end' : 'start'} className="min-w-44">
   {kind==='model'?providers.filter(p=>p.models.length).map(p=><SelectGroup key={p.id}><SelectLabel className="text-xs font-normal text-muted-foreground">{p.name}</SelectLabel>{p.models.map(m=><SelectItem key={m} value={modelKey(p.id,m)} className="py-2 text-xs">{m}</SelectItem>)}</SelectGroup>):choices.map(v => <SelectItem key={v} value={v} className="py-2 text-xs">{kind==='machine'?'本地':v}</SelectItem>)}
  </SelectContent>
 </Select>{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}</>
}
export function ContextBar() { return <div className="context-bar mx-auto mb-0.5 flex w-[95%] flex-wrap items-center justify-start gap-1 rounded-lg bg-muted px-2 py-1"><ContextSelect kind="workspace"/><ContextSelect kind="machine"/></div> }





