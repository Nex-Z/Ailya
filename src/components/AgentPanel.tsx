import { X, CheckCircle2, LoaderCircle, AlertCircle } from 'lucide-react'
import { useAgentPanel, agentStatus } from '../agent-panel'
import type { Session } from '../store'
import { Button } from './ui/button'
export function AgentPanel({session}:{session:Session}) {
 const panel=useAgentPanel()
 const runs=session.messages.flatMap(m=>(m.parts??[]).flatMap(p=>p.type==='tool-call'&&p.toolName==='delegate_agent'?[{...p,id:m.id+':'+p.toolCallId}]:[]))
 const current=runs.find(r=>r.id===panel.selected)
 if(panel.session!==session.id || !current)return null
 const args=current.args as Record<string,string>
 return <aside aria-label="子 Agent 会话" className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[380px] flex-col border-l bg-background shadow-lg lg:static lg:z-auto lg:w-[340px] lg:shrink-0 lg:shadow-none">
  <div className="flex h-16 shrink-0 items-center justify-between border-b px-4"><h2 className="text-sm font-medium">Agent 工作情况</h2><Button variant="ghost" size="icon" aria-label="关闭子 Agent 会话" onClick={panel.close}><X className="size-4"/></Button></div>
  <div className="max-h-[35%] shrink-0 space-y-1 overflow-y-auto border-b p-3">{runs.map(r=>{const a=r.args as Record<string,string>;const status=agentStatus(a,r.result,r.isError);const Icon=status==='已完成'?CheckCircle2:status==='有问题'?AlertCircle:LoaderCircle;return <Button key={r.id} variant={r.id===current.id?'secondary':'ghost'} className="h-auto w-full justify-start py-3" onClick={()=>panel.open(session.id,r.id)}><Icon className={`size-4 ${status==='进行中'?'animate-spin':''}`}/><span className="truncate">{a.agent}</span><span className="ml-auto text-xs text-muted-foreground">{status}</span></Button>})}</div>
  <div className="min-h-0 flex-1 overflow-y-auto p-4" key={current.id}><h3 className="mb-5 text-sm font-medium">{args.agent} · 会话记录</h3><div className="mb-5 rounded-lg bg-muted p-3 text-sm leading-6 whitespace-pre-wrap">{args.task}</div>{args.progress&&<p className="mb-5 text-sm leading-6 whitespace-pre-wrap">{args.progress}</p>}{current.result!==undefined&&<p className="text-sm leading-6 whitespace-pre-wrap break-words">{typeof current.result==='string'?current.result:JSON.stringify(current.result,null,2)}</p>}<div className="mt-5 text-xs text-muted-foreground">{agentStatus(args,current.result,current.isError)}</div></div>
 </aside>
}
