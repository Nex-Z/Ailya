import {useEffect,useState} from 'react'
import {Plus,Pencil,Trash2,Check,X} from 'lucide-react'
import {api} from '../lib/core-api'
import {useStore} from '../store'
import {Button} from './ui/button'
import {Input} from './ui/input'
import {Textarea} from './ui/textarea'
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select'
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from './ui/alert-dialog'
type Memory={id:string;kind:'fact'|'preference'|'experience';topic:string;content:string;scope:'workspace'|'global'|'session';scope_id:string;status:'active'|'candidate'|'rejected';origin:string;version:number;expires_at:number|null;expired:boolean;sources:{session_id:string;message_id:string;title:string;quote:string}[]}
type Config={useEnabled:boolean;embedding:{enabled:boolean;baseUrl:string;model:string;hasKey?:boolean}}
type Snapshot={items:Memory[];config:Config;counts:{status:string;n:number}[];errors:{memory_id:string;error:string}[]}
type Draft={id?:string;version?:number;kind:Memory['kind'];topic:string;content:string;scope:Memory['scope'];workspace:string;sessionId?:string;expiresAt:number|null}
function Choice({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>}
const kinds={fact:'事实',preference:'偏好',experience:'经验'},scopes={workspace:'工作空间',global:'全局',session:'会话'}
export function MemorySettings(){
 const sessions=useStore(s=>s.sessions),activeId=useStore(s=>s.activeId),active=sessions.find(s=>s.id===activeId)
 const [snapshot,setSnapshot]=useState<Snapshot>(),[config,setConfig]=useState<Config>(),[key,setKey]=useState(''),[workspaces,setWorkspaces]=useState<string[]>([])
 const [draft,setDraft]=useState<Draft>(),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[deleting,setDeleting]=useState<Memory>()
 const refresh=async()=>{const data=await api<Snapshot>('/memories');setSnapshot(data);return data}
 useEffect(()=>{let live=true;void Promise.all([api<Snapshot>('/memories'),api<{path:string}[]>('/workspaces')]).then(([data,paths])=>{if(live){setSnapshot(data);setConfig(data.config);setWorkspaces(paths.map(p=>p.path))}}).catch(e=>{if(live)setMessage(e.message)});return()=>{live=false}},[])
 const perform=async(work:()=>Promise<unknown>,success='已保存')=>{setBusy(true);setMessage('');try{await work();await refresh();setMessage(success)}catch(e){setMessage(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}}
 const workspace=active?.context.workspace??'Ailya'
 const edit=(m?:Memory)=>setDraft(m?{id:m.id,version:m.version,kind:m.kind,topic:m.topic,content:m.content,scope:m.scope,workspace:m.scope==='workspace'?m.scope_id:workspace,sessionId:m.scope==='session'?m.scope_id:activeId,expiresAt:m.expires_at}:{kind:'preference',topic:'',content:'',scope:'workspace',workspace,sessionId:activeId,expiresAt:null})
 const saveConfig=(next:Config)=>perform(async()=>{const result=await api<Config>('/memories/config',{...next,embedding:{enabled:next.embedding.enabled,baseUrl:next.embedding.baseUrl,model:next.embedding.model,...(key?{apiKey:key}:{})}});setConfig(result);setKey('')})
 const items=snapshot?.items.filter(m=>(filter==='all'||m.status===filter)&&(m.topic+' '+m.content).toLowerCase().includes(query.toLowerCase()))??[]
 return <section className="space-y-5" aria-label="长期记忆设置">
  {config&&<div className="rounded-xl border px-4"><label className="flex items-center justify-between gap-3 py-4 text-sm"><span>使用记忆</span><input type="checkbox" role="switch" className="size-4 accent-primary" checked={snapshot?.config.useEnabled??false} disabled={busy} onChange={e=>void saveConfig({...snapshot!.config,useEnabled:e.target.checked})}/></label></div>}
  <div className="flex flex-wrap items-center gap-2"><Input aria-label="搜索记忆" placeholder="搜索记忆" value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1"/><div className="w-28"><Choice label="记忆状态" value={filter} onChange={setFilter} options={[{value:'all',label:'全部'},{value:'active',label:'已生效'},{value:'candidate',label:'待确认'},{value:'rejected',label:'已拒绝'}]}/></div><Button size="sm" disabled={busy||!snapshot} onClick={()=>edit()}><Plus size={14}/>新增</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void perform(refresh,'已刷新')}>刷新</Button></div>
  {draft&&<form className="space-y-3 rounded-xl border p-4" onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('/memories',draft);setDraft(undefined)})}}>
   <div className="flex items-center justify-between"><h3 className="text-sm font-medium">{draft.id?'编辑记忆':'新增记忆'}</h3><Button type="button" size="icon" className="size-8" variant="ghost" aria-label="取消编辑记忆" onClick={()=>setDraft(undefined)}><X size={15}/></Button></div>
   <Input aria-label="记忆主题" placeholder="主题" maxLength={100} required value={draft.topic} onChange={e=>setDraft({...draft,topic:e.target.value})}/>
   <Textarea aria-label="记忆内容" placeholder="希望 Ailya 记住什么？" rows={4} maxLength={2000} required value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/>
   <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Choice label="记忆类型" value={draft.kind} onChange={v=>setDraft({...draft,kind:v as Draft['kind']})} options={Object.entries(kinds).map(([value,label])=>({value,label}))}/><Choice label="记忆范围" value={draft.scope} onChange={v=>setDraft({...draft,scope:v as Draft['scope']})} options={Object.entries(scopes).map(([value,label])=>({value,label}))}/></div>
   {draft.scope==='workspace'&&<Choice label="记忆工作空间" value={draft.workspace} onChange={v=>setDraft({...draft,workspace:v})} options={[...new Set([draft.workspace,...workspaces])].map(value=>({value,label:value}))}/>}
   {draft.scope==='session'&&<Choice label="记忆所属会话" value={draft.sessionId??''} onChange={v=>{const session=sessions.find(s=>s.id===v)!;setDraft({...draft,sessionId:v,workspace:session.context.workspace})}} options={sessions.filter(s=>s.messages.length).map(s=>({value:s.id,label:s.title}))}/>}
   <label className="flex flex-wrap items-center gap-3 text-sm">有效期<Input type="date" aria-label="记忆有效期" className="w-auto" value={draft.expiresAt?new Date(draft.expiresAt).toISOString().slice(0,10):''} onChange={e=>setDraft({...draft,expiresAt:e.target.value?Date.parse(e.target.value+'T23:59:59'):null})}/><span className="text-muted-foreground">{draft.expiresAt?'':'长期'}</span></label>
   <div className="flex justify-end"><Button size="sm" disabled={busy||!draft.topic.trim()||!draft.content.trim()}>保存记忆</Button></div>
  </form>}
  <div className="divide-y">{items.map(m=><article key={m.id} className="space-y-2 py-4 first:pt-0">
   <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-medium">{m.topic}</h3><div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground"><span>{kinds[m.kind]}</span><span>{scopes[m.scope]}</span><span>{m.expired?'已过期':m.status==='active'?'已生效':m.status==='candidate'?'待确认':'已拒绝'}</span><span>{m.origin==='user'?'用户编辑':m.origin==='explicit'?'用户明确要求':'AI 提炼'}</span></div></div><div className="flex shrink-0"><Button size="icon" className="size-8" variant="ghost" aria-label={'编辑 '+m.topic} disabled={busy} onClick={()=>edit(m)}><Pencil size={14}/></Button><Button size="icon" className="size-8" variant="ghost" aria-label={'删除 '+m.topic} disabled={busy} onClick={()=>setDeleting(m)}><Trash2 size={14}/></Button></div></div>
   <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>
   <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">来源与范围</summary><div className="mt-2 space-y-1 break-all"><p>{m.scope==='global'?'所有工作空间':m.scope==='session'?sessions.find(s=>s.id===m.scope_id)?.title??m.scope_id:m.scope_id}</p>{m.sources.length?m.sources.map(s=><div key={s.session_id+s.message_id}><p>{s.title} · {s.message_id.slice(0,8)}</p><blockquote className="mt-1 border-l-2 pl-2 whitespace-pre-wrap">{s.quote}</blockquote></div>):<p>在设置中创建</p>}<p>版本 {m.version}{m.expires_at?' · 到期 '+new Date(m.expires_at).toLocaleDateString():''}</p></div></details>
   {m.status==='candidate'&&<div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void perform(()=>api('/memories/'+m.id+'/decision',{version:m.version,accept:true}))}><Check size={14}/>确认</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void perform(()=>api('/memories/'+m.id+'/decision',{version:m.version,accept:false}),'已拒绝')}>拒绝</Button></div>}
  </article>)}{snapshot&&!items.length&&<p className="py-6 text-center text-sm text-muted-foreground">暂无记忆</p>}</div>
  {config&&<details className="border-t pt-4"><summary className="cursor-pointer text-sm">检索设置 · {snapshot?.config.embedding.enabled?'语义 + 关键词':'关键词'}</summary><div className="mt-4 space-y-3">
   <label className="flex items-center justify-between text-sm">启用语义检索<input type="checkbox" className="size-4 accent-primary" checked={config.embedding.enabled} onChange={e=>setConfig({...config,embedding:{...config.embedding,enabled:e.target.checked}})}/></label>
   <Input aria-label="Embedding 地址" placeholder="Embedding API 地址（含 /v1）" value={config.embedding.baseUrl} onChange={e=>setConfig({...config,embedding:{...config.embedding,baseUrl:e.target.value}})}/>
   <Input aria-label="Embedding 模型" placeholder="Embedding 模型" value={config.embedding.model} onChange={e=>setConfig({...config,embedding:{...config.embedding,model:e.target.value}})}/>
   <Input aria-label="Embedding 密钥" type="password" autoComplete="off" placeholder={config.embedding.hasKey?'已配置密钥，留空保持':'API Key（可选）'} value={key} onChange={e=>setKey(e.target.value)}/>
   <p className="text-xs text-muted-foreground">启用后，生效记忆和检索文本会发送到此服务；未配置或调用失败时使用关键词检索。</p>
   <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void saveConfig(config)}>保存检索配置</Button><Button size="sm" variant="outline" disabled={busy||!snapshot?.config.embedding.enabled} onClick={()=>void perform(()=>api('/memories/reindex',{}),'已开始重建')}>重建索引</Button></div>
   {!!snapshot?.counts.length&&<p className="text-xs text-muted-foreground">{snapshot.counts.map(c=>`${({ready:'已索引',pending:'待索引',running:'索引中',failed:'失败'} as Record<string,string>)[c.status]} ${c.n}`).join(' · ')}</p>}{snapshot?.errors.map(e=><p className="text-xs text-destructive" key={e.memory_id}>{e.error}</p>)}
  </div></details>}
  {message&&<p role="status" className="break-words text-sm">{message}</p>}
  <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open)setDeleting(undefined)}}><AlertDialogContent><AlertDialogTitle>删除这条记忆？</AlertDialogTitle><AlertDialogDescription>记忆及其索引会被删除。原始会话仍然保留。</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={()=>{if(deleting)void perform(()=>api('/memories/'+deleting.id,{version:deleting.version},'DELETE'),'已删除');setDeleting(undefined)}}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </section>
}
