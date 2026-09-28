import { useProviders,modelKey,modelLabel } from '../providers'
import { useCatalog } from '../catalog'
import { FolderOpen, Monitor, Bot } from 'lucide-react'
import { useStore } from '../store'
import { commands } from './command-items'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
export function ContextSelect({ kind }: { kind: 'workspace' | 'machine' | 'agent' | 'model' }) {
 const session = useStore(s => s.sessions.find(x => x.id === s.activeId)!)
 const catalog = useCatalog()
 const providers=useProviders(s=>s.items)
 const update = useStore(s => s.setContext)
 const option = commands.find(c => c.key === kind)
 const label = kind === 'machine' ? '运行机器' : option!.label
 const value = kind === 'machine' ? 'Local' : session.context[kind]
 const choices = kind === 'agent' ? [...catalog.agents, ...catalog.groups].map(x => x.name) : kind === 'machine' ? ['Local'] : kind === 'model' ? ['默认模型',...providers.flatMap(p=>p.models.map(m=>modelKey(p.id,m)))] : [...option!.values]
 if (!choices.includes(value)) choices.push(value)
 const Icon = kind === 'workspace' ? FolderOpen : kind === 'machine' ? Monitor : kind === 'agent' ? Bot : null
 return <Select value={value} disabled={!!session.messages.length} onValueChange={v => { if (kind !== 'machine') update(kind, v) }}>
  <SelectTrigger aria-label={label} className="h-8 w-auto max-w-44 gap-2 border-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent focus:ring-1 disabled:opacity-60 [&>svg]:size-3">
   {Icon && <Icon className="size-3.5 shrink-0"/>}<SelectValue/>
  </SelectTrigger>
  <SelectContent side="bottom" align={kind === 'model' ? 'end' : 'start'} className="min-w-44">
   {choices.map(v => <SelectItem key={v} value={v} className="py-2 text-xs">{kind==='model'?modelLabel(v):v}</SelectItem>)}
  </SelectContent>
 </Select>
}
export function ContextBar() { return <div className="context-bar mx-auto mb-0.5 flex w-[95%] flex-wrap items-center justify-start gap-1 rounded-lg bg-muted px-2 py-1"><ContextSelect kind="workspace"/><ContextSelect kind="machine"/><ContextSelect kind="agent"/></div> }





