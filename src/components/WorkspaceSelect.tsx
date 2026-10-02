import {useState} from 'react'
import {FolderOpen,ChevronDown,Check} from 'lucide-react'
import {api} from '../lib/core-api'
import {useStore} from '../store'
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover'
import {Command,CommandInput,CommandList,CommandEmpty,CommandItem} from './ui/command'
import {Button} from './ui/button'
export function WorkspaceSelect({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(path:string)=>void}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[items,setItems]=useState<{path:string}[]>([]),[error,setError]=useState('')
 const choose=async(path?:string)=>{
  setBusy(true);setError('');useStore.setState({workspaceSelecting:true})
  try{const result=await api<{path:string|null}>(path?'/workspaces/select':'/workspaces/pick',path?{path}:{});if(result.path){onChange(result.path);setOpen(false)}}catch(e){setError(e instanceof Error?e.message:'选择工作空间失败')}finally{setBusy(false);useStore.setState({workspaceSelecting:false})}
 }
 return <Popover open={open} onOpenChange={next=>{setOpen(next);if(next){setError('');void api<{path:string}[]>('/workspaces').then(setItems).catch(e=>setError(e.message))}}}>
  <PopoverTrigger asChild><button type="button" aria-label="工作空间" title={value} disabled={disabled||busy} className="flex h-8 max-w-44 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-60"><FolderOpen className="size-3.5 shrink-0"/><span className="truncate">{busy?'选择中…':value==='Ailya'?'Ailya':value.split(/[\\/]/).filter(Boolean).at(-1)||value}</span><ChevronDown className="size-3 shrink-0"/></button></PopoverTrigger>
  <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0"><Command><CommandInput aria-label="搜索工作空间" placeholder="搜索工作空间"/><CommandList><CommandEmpty>没有匹配的工作空间</CommandEmpty>{items.map(item=><CommandItem key={item.path} value={item.path} aria-label={item.path} title={item.path} disabled={busy} onSelect={()=>void choose(item.path)}><FolderOpen className="size-4 shrink-0"/><span className="truncate">{item.path}</span>{item.path===value&&<Check className="ml-auto size-4 shrink-0"/>}</CommandItem>)}</CommandList></Command><div className="border-t p-1"><Button variant="ghost" size="sm" disabled={busy} className="w-full justify-start" onClick={()=>void choose()}><FolderOpen/>选择其他文件夹</Button></div>{error&&<p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p>}</PopoverContent>
 </Popover>
}
