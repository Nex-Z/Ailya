import {useEffect,useState} from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
import {useStore} from '../store'
import {useProviders} from '../providers'
import {api} from '../lib/core-api'

type Usage={used:number;capacity:number;inputBudget:number;estimated:boolean;summaryId:string|null}
const compact=(n:number)=>n>=1e6?`${Number((n/1e6).toFixed(2))}M`:n>=1e3?`${Number((n/1e3).toFixed(1))}k`:String(n)
export function ContextUsage(){
 const session=useStore(s=>s.sessions.find(x=>x.id===s.activeId)!),preferred=useStore(s=>s.preferredModel)
 const providers=useProviders(s=>s.items)
 const model=session.context.model==='默认模型'?preferred:session.context.model
 const [result,setResult]=useState<{key:string;usage:Usage}|null>(null),[failed,setFailed]=useState(false),[open,setOpen]=useState(false)
 const key=session.id+':'+model,last=session.messages.at(-1),running=session.messages.some(m=>m.executing)
 const busy=running||session.compaction?.status==='running'
 useEffect(()=>{
  let disposed=false,inFlight=false
  const refresh=async()=>{
   if(inFlight)return
   inFlight=true
   try{const usage=await api<Usage>('/sessions/'+session.id+'/context-usage?model='+encodeURIComponent(model));if(!disposed){setResult({key,usage});setFailed(false)}}
   catch{if(!disposed){setFailed(true);setResult(null)}}finally{inFlight=false}
  }
  void refresh()
  const timer=busy?setInterval(()=>void refresh(),2000):undefined
  return()=>{disposed=true;clearInterval(timer)}
 },[key,session.id,model,busy,session.messages.length,last?.parts?.length,session.compaction?.status,session.compaction?.jobId,providers])
 const usage=result?.key===key?result.usage:null
 const percent=usage?usage.used/usage.capacity*100:0,rounded=Math.round(percent*10)/10
 const text=usage?`${compact(usage.used)} / ${compact(usage.capacity)} tokens`:failed?'上下文数据暂不可用':'正在读取上下文…'
 return <Tooltip.Provider delayDuration={180}><Tooltip.Root open={open} onOpenChange={setOpen}><Tooltip.Trigger asChild>
  <button type="button" className="context-usage flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label={usage?`上下文占用 ${rounded}%，${text}`:'上下文占用：'+text} onClick={event=>{event.preventDefault();setOpen(v=>!v)}}>
   <svg width="18" height="18" viewBox="0 0 20 20" role="progressbar" aria-label="上下文占用" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usage?Math.min(100,rounded):undefined} aria-valuetext={text}>
    <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" opacity=".18"/>
    {usage&&<circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.min(100,percent)} 100`} transform="rotate(-90 10 10)" className={percent>=90?'text-destructive':percent>=70?'text-amber-600':'text-primary'}/>}
    {!usage&&<circle cx="10" cy="10" r="1" fill="currentColor"/>}
   </svg>
  </button>
 </Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="top" sideOffset={9} collisionPadding={16} className="z-50 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover px-3 py-2 text-xs text-foreground shadow-md">
  <div className="font-medium">上下文占用</div>
  <div className="mt-1 tabular-nums">{text}{usage?` · ${rounded}%`:''}</div>
  {usage&&<div className="mt-1 tabular-nums text-muted-foreground">{usage.used.toLocaleString('zh-CN')} / {usage.capacity.toLocaleString('zh-CN')} tokens</div>}
 </Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider>
}
