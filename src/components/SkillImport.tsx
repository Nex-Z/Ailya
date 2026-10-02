import {useState} from 'react'
import {api} from '../lib/core-api'
import {useResources} from '../resources'
import {Dialog,DialogContent,DialogTitle} from './ui/dialog'
import {Input} from './ui/input'
import {Button} from './ui/button'
type Found={path:string;name:string;description:string;files:number;error:string|null}
export function SkillImport({close}:{close:()=>void}){
 const [path,setPath]=useState(''),[found,setFound]=useState<Found[]>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[imported,setImported]=useState<string[]>([])
 const load=useResources(s=>s.load)
 const discover=async()=>{setBusy(true);setError('');setFound(undefined);try{setFound(await api<Found[]>('/skills/discover',{path}))}catch(e){setError(e instanceof Error?e.message:'读取失败')}finally{setBusy(false)}}
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)close()}}><DialogContent aria-describedby={undefined} className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl"><DialogTitle>导入本地 Skills</DialogTitle><form className="flex gap-2" onSubmit={e=>{e.preventDefault();void discover()}}><Input aria-label="Skills 目录" placeholder="包含 SKILL.md 的目录或其父目录" value={path} onChange={e=>setPath(e.target.value)}/><Button disabled={busy||!path.trim()}>查找</Button></form>
 {found?.map(skill=><article key={skill.path} className="space-y-2 border-t pt-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{skill.name}</span><Button size="sm" disabled={busy||!!skill.error||imported.includes(skill.path)} onClick={async()=>{setBusy(true);setError('');try{await api('/skills/import',{path:skill.path});await load();setImported(v=>[...v,skill.path])}catch(e){setError(e instanceof Error?e.message:'导入失败')}finally{setBusy(false)}}}>{imported.includes(skill.path)?'已导入':'导入'}</Button></div><p className="text-sm">{skill.description}</p><p className="break-all text-xs text-muted-foreground">{skill.path} · {skill.files} 个文件</p>{skill.error&&<p className="text-sm text-destructive">{skill.error}</p>}</article>)}
 {found?.length===0&&<p className="text-sm text-muted-foreground">未找到 SKILL.md</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={close}>完成</Button></div></DialogContent></Dialog>
}
