import {useEffect,useState} from 'react'
import {useStore} from '../store'
import {api} from '../lib/core-api'
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select'
const labels:Record<string,string>={off:'关闭',on:'开启',low:'轻度',high:'深度',max:'极深'}
export function ThinkingSelect(){
 const session=useStore(s=>s.sessions.find(x=>x.id===s.activeId)!),preferred=useStore(s=>s.preferredModel),saving=useStore(s=>s.modelSaving)
 const model=session.context.model==='默认模型'?preferred:session.context.model
 return <ThinkingModelSelect key={model} model={model} sessionId={session.id} running={session.messages.some(m=>m.executing)} saving={saving}/>
}
function ThinkingModelSelect({model,sessionId,running,saving}:{model:string;sessionId:string;running:boolean;saving:boolean}){
 const [profile,setProfile]=useState<{options:string[];value:string}|null>(null),[error,setError]=useState('')
 useEffect(()=>{let cancelled=false;if(model!=='默认模型')void api<{options:string[];value:string}>('/reasoning?model='+encodeURIComponent(model)).then(value=>{if(!cancelled)setProfile(value)}).catch(()=>{});return()=>{cancelled=true}},[model])
 if(!profile?.options.length)return null
 return <><Select value={profile.value} disabled={saving||running} onValueChange={async level=>{
  useStore.setState({modelSaving:true});setError('')
  try{const next=await api<{options:string[];value:string}>('/reasoning',{model,level,sessionId});setProfile(next)}catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{useStore.setState({modelSaving:false})}
 }}><SelectTrigger aria-label="思考深度" className="h-8 w-auto gap-1 border-transparent px-2 text-xs text-muted-foreground shadow-none hover:bg-accent"><SelectValue>思考：{labels[profile.value]}</SelectValue></SelectTrigger><SelectContent>{profile.options.map(value=><SelectItem key={value} value={value} className="text-xs">{labels[value]}</SelectItem>)}</SelectContent></Select>{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}</>
}
