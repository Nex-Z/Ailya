import { FileChanges } from './FileChanges'
import { useAgentPanel, agentStatus } from '../agent-panel'
import { useStore } from '../store'
import { Button } from './ui/button'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './ui/collapsible'
import { useState } from 'react'
import { ActionBarPrimitive, MessagePrimitive, MessagePartPrimitive, ThreadPrimitive, useAuiState } from '@assistant-ui/react'
import { MarkdownTextPrimitive, type CodeHeaderProps } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, ChevronRight, Terminal, Users, Copy, RotateCcw, FileText, AlertCircle } from 'lucide-react'


function CodeHeader({ language, code }: CodeHeaderProps) {
 const [copied, setCopied] = useState(false)
 return <div className="code-header"><span>{language || 'text'}</span><Button variant="ghost" size="sm" aria-label="复制代码" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true) } catch { setCopied(false) } }}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? '已复制' : '复制代码'}</Button></div>
}
function ToolActivity({ toolName, args, result, isError, status, callId }: { callId:string; toolName: string; args: unknown; result?: unknown; isError?: boolean; status: { type: string } }) {
 const [open, setOpen] = useState(false)
 const messageId=useAuiState(s=>s.message.id)
 const sessionId=useStore(s=>s.activeId)
 const show=useAgentPanel(s=>s.open)
 const team = toolName === 'delegate_agent'
 const agent = team && args && typeof args === 'object' && 'agent' in args ? String(args.agent) : null
 const pending = result === undefined && (status.type === 'running' || !!args && typeof args === 'object' && 'executionStatus' in args && args.executionStatus === 'running')
 if(team){
  const task=args&&typeof args==='object'&&'task' in args?String(args.task):agent
  const state=agentStatus(args,result,isError)
  return <Button variant="ghost" aria-label={`${agent} ${state}`} className={`team-task my-1 h-auto w-full justify-start gap-3 rounded-lg border px-3 py-3 text-left whitespace-normal ${state==='有问题'?'border-rose-200 bg-rose-50/60':'border-border bg-popover'}`} onClick={()=>show(sessionId,messageId+':'+callId)}><span className={`size-2 shrink-0 rounded-full ${state==='有问题'?'bg-rose-600':state==='进行中'?'animate-pulse bg-blue-500':'bg-neutral-400'}`}/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{task}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{agent}</span></span><span className={`shrink-0 text-xs ${state==='有问题'?'text-rose-700':state==='进行中'?'text-blue-700':'text-muted-foreground'}`}>{state}</span><ChevronRight className="size-4 shrink-0 text-muted-foreground"/></Button>
 }
 return <Collapsible open={open} onOpenChange={setOpen} className={`tool-activity ${isError ? 'tool-error' : ''}`}><CollapsibleTrigger asChild><Button variant="ghost" className="tool-summary h-auto rounded-none">{team ? <Users size={15}/> : <Terminal size={15}/>}<strong>{agent || toolName}</strong><span>{isError ? '失败' : pending ? '执行中' : result === undefined ? '未完成' : '完成'}</span><ChevronRight size={14} className={open ? 'rotate' : ''}/></Button></CollapsibleTrigger><CollapsibleContent className="tool-detail"><p>输入</p><pre>{JSON.stringify(args, null, 2)}</pre><p>输出</p><pre>{typeof result === 'string' ? result : JSON.stringify(result ?? '尚无结果', null, 2)}</pre></CollapsibleContent></Collapsible>
}
function MarkdownPart(){return <MarkdownTextPrimitive className="markdown-content" remarkPlugins={[remarkGfm]} smooth={false} components={{CodeHeader,a:({children,...props})=><a {...props} target="_blank" rel="noreferrer">{children}</a>}}/>}
const partComponents={Text:MarkdownPart,Image:()=> <MessagePartPrimitive.Image className="message-image" alt="内置布局示意图"/>,tools:{Fallback:(props:Omit<React.ComponentProps<typeof ToolActivity>,'callId'>&{toolCallId:string})=><ToolActivity {...props} callId={props.toolCallId}/>}}
function IndexedPart({index}:{index:number}){return <MessagePrimitive.PartByIndex index={index} components={partComponents}/>}
function ToolGroup({indexes,active}:{indexes:number[];active:boolean}){
 const [open,setOpen]=useState(false)
 return <div className="my-3">{(!active||indexes.length>1)&&<Button variant="ghost" size="sm" aria-expanded={open} onClick={()=>setOpen(!open)} className="text-xs text-muted-foreground"><ChevronRight className={open?'rotate size-3':'size-3'}/>{indexes.length} 次工具调用</Button>}{(open?indexes:active?[indexes[indexes.length-1]]:[]).map(index=><IndexedPart key={index} index={index}/>)}</div>
}
function ReasoningPanel({text,thinking,open,toggle}:{text:string;thinking:boolean;open:boolean;toggle:()=>void}){
 return <details open={open} className="reasoning-panel mb-3 text-xs text-muted-foreground"><summary className="cursor-pointer py-1" onClick={event=>{event.preventDefault();toggle()}}>{thinking?'正在思考':'思考过程'}</summary><div className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-l pl-3 leading-relaxed">{text}</div></details>
}
function Parts({assistant=false}:{assistant?:boolean}){
 const [manualThinking,setManualThinking]=useState<boolean|null>(null)
 const parts=useAuiState(s=>s.message.parts)
 const id=useAuiState(s=>s.message.id)
 const status=useAuiState(s=>s.message.status)
 const source=useStore(s=>s.sessions.find(x=>x.id===s.activeId)?.messages.find(m=>m.id===id))
 const [open,setOpen]=useState(false)
 const active=status?.type==='running'||source?.executing||parts.some(p=>p.type==='tool-call'&&p.toolName==='delegate_agent'&&!!p.args&&typeof p.args==='object'&&'executionStatus' in p.args&&p.args.executionStatus==='running')
 const hasTools=parts.some(p=>p.type==='tool-call')
 const final=parts.map((p,i)=>p.type==='text'?i:-1).filter(i=>i>=0).at(-1)??-1
 const groups=(indexes:number[])=>{const nodes:React.ReactNode[]=[];for(let k=0;k<indexes.length;k++){const i=indexes[k];if(parts[i].type==='tool-call'&&parts[i].toolName==='delegate_agent'){nodes.push(<IndexedPart key={i} index={i}/>)}else if(parts[i].type==='tool-call'){const batch=[i];while(k+1<indexes.length&&((part)=>part.type==='tool-call'&&part.toolName!=='delegate_agent')(parts[indexes[k+1]]))batch.push(indexes[++k]);nodes.push(<ToolGroup key={i} indexes={batch} active={!!active}/>)}else nodes.push(<IndexedPart key={i} index={i}/>)}return nodes}
 const all=parts.map((_,i)=>i)

 const reasoning=source?.reasoning,phase=source?.phase
 const thinkingOpen=manualThinking??(phase==='thinking')
 const thinking=reasoning&&<ReasoningPanel key={id} text={reasoning} thinking={phase==='thinking'} open={thinkingOpen} toggle={()=>setManualThinking(!thinkingOpen)}/>
 const seconds=source?.durationMs===undefined?null:Math.max(1,Math.round(source.durationMs/1000))
 const elapsed=seconds===null?'耗时未记录':seconds>=60?`耗时 ${Math.floor(seconds/60)} 分 ${seconds%60} 秒`:`耗时 ${seconds} 秒`
 if(!assistant)return <>{all.map(i=><IndexedPart key={i} index={i}/>)}</>
 if(!hasTools||active)return <><div className="mb-3 text-xs text-muted-foreground">{elapsed}</div>{thinking}{groups(all)}</>
 return <><Collapsible open={open} onOpenChange={setOpen}><CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="mb-3 h-auto justify-start rounded-none p-0 text-xs font-normal text-muted-foreground">{elapsed}<ChevronRight className={open?'rotate size-3':'size-3'}/></Button></CollapsibleTrigger>{thinking}<CollapsibleContent>{groups(all.filter(i=>i!==final))}</CollapsibleContent></Collapsible>{final>=0&&<IndexedPart index={final}/>}</>
}
function QuestionRecord({children}:{children:React.ReactNode}){return <Collapsible className="my-4 rounded-lg border bg-popover"><CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between text-sm">问题与回答<span className="text-xs text-muted-foreground">已回答 · 展开</span></Button></CollapsibleTrigger><CollapsibleContent className="border-t p-4">{children}</CollapsibleContent></Collapsible>}
function UserMessage() {
 const sessionId=useStore(s=>s.activeId)
 const id=useAuiState(s=>s.message.id)
 const isAnswer=useStore(s=>s.sessions.find(x=>x.id===s.activeId)?.messages.find(m=>m.id===id)?.questionAnswer)
 if(isAnswer)return <MessagePrimitive.Root><QuestionRecord><Parts/></QuestionRecord></MessagePrimitive.Root>
 return <MessagePrimitive.Root className="user-message"><div><MessagePrimitive.Attachments>{({ attachment }) => <a className="file-chip" aria-label={`下载附件 ${attachment.name}`} href={`/api/sessions/${sessionId}/attachments/${attachment.id}`} download={attachment.name}><FileText size={13}/>{attachment.name}</a>}</MessagePrimitive.Attachments><Parts/></div></MessagePrimitive.Root>
}
function AssistantMessage() {
 const awaitingQuestion=useStore(s=>!!s.sessions.find(x=>x.id===s.activeId)?.questionRequest)
 const awaitingPermission=useStore(s=>!!s.sessions.find(x=>x.id===s.activeId)?.permissionRequest)
 const messageId=useAuiState(s=>s.message.id)
 const phase=useStore(s=>s.sessions.find(x=>x.id===s.activeId)?.messages.find(m=>m.id===messageId)?.phase)
 const questionStatus=useStore(s=>s.sessions.find(x=>x.id===s.activeId)?.messages.find(m=>m.id===messageId)?.questionStatus)
 const files=useStore(s=>s.sessions.find(x=>x.id===s.activeId)?.messages.find(m=>m.id===messageId)?.fileChanges)
 const status = useAuiState(s => s.message.status)
 const hasText = useAuiState(s => s.message.parts.some(p => p.type === 'text' && p.text.length > 0))
 const isLast = useAuiState(s => s.message.isLast)
 const copied = useAuiState(s => s.message.isCopied)
 const running = useAuiState(s => s.thread.isRunning)
 const incomplete = status?.type === 'incomplete'
 return <MessagePrimitive.Root className="assistant-message"><div className="assistant-body min-w-0">{questionStatus?<details className="my-4 rounded-lg border p-3 text-sm"><summary>问题与回答 · {questionStatus}</summary><Parts assistant/></details>:<Parts assistant/>}{files&&files.length>0&&<FileChanges files={files}/>}{status?.type === 'running' && <div className="stream-state"><span className="pulse-dot"/>{awaitingQuestion?'等待回答…':awaitingPermission?'等待授权…':phase==='compacting'?'正在整理上下文…':phase==='thinking'?'正在思考…':phase==='tool'?'正在准备工具调用…':hasText ? '正在生成…' : '等待模型响应…'}</div>}{incomplete && <div role={status.reason === 'error' ? 'alert' : 'status'} className={`message-status ${status.reason === 'error' ? 'error-status' : ''}`}>{status.reason === 'error' ? <><AlertCircle size={14}/><span>{typeof status.error === 'string' ? status.error : '回复失败，请重试。'}</span></> : '已停止生成'}</div>}<ActionBarPrimitive.Root className="message-actions">{hasText && status?.type !== 'running' && <ActionBarPrimitive.Copy className="copy-button" aria-label="复制回复">{copied ? <Check size={14}/> : <Copy size={14}/>}<span>{copied ? '已复制' : '复制'}</span></ActionBarPrimitive.Copy>}{isLast && !running && !awaitingQuestion && <ActionBarPrimitive.Reload className="copy-button" aria-label={incomplete ? '重试回复' : '重新生成'}><RotateCcw size={13}/>{incomplete ? '重试' : '重新生成'}</ActionBarPrimitive.Reload>}</ActionBarPrimitive.Root></div></MessagePrimitive.Root>
}
export function Messages() { return <div className="messages" data-chat-engine="assistant-ui"><ThreadPrimitive.Messages>{({ message }) => message.role === 'user' ? <UserMessage/> : <AssistantMessage/>}</ThreadPrimitive.Messages></div> }
