
import { ComplexReplay } from './components/ComplexReplay'
import { QuestionPanel } from './components/QuestionPanel'
import { useAnswers } from './questions'
import { AgentPanel } from './components/AgentPanel'
import { ResourceLibrary } from './components/ResourceLibrary'
import { ResourceEditor } from './components/ResourceEditor'
import { taskFromMessage, type Resource } from './resources'
import { useCatalog } from './catalog'
import { AgentLibrary } from './components/AgentLibrary'
import { useEffect, useRef, useState } from 'react'
import { ThreadPrimitive } from '@assistant-ui/react'
import { ArrowDown, PanelLeft } from 'lucide-react'
import { Sidebar, Mark } from './components/Sidebar'
import { ContextBar } from './components/ContextBar'
import { Composer } from './components/Composer'
import { Messages } from './components/Messages'
import { Button } from './components/ui/button'
import { ChatRuntime } from './runtime/ChatRuntime'
import { useStore } from './store'
import './App.css'
type Run = { startedAt:number; sessionId: string; messageId: string; timer: ReturnType<typeof setInterval> }
function App() {
 const { sessions, activeId, addMessage, updateMessage } = useStore()
 const session = sessions.find(s => s.id === activeId)!
 const [view, setView] = useState<'chat' | 'agents' | 'groups' | 'extensions' | 'tasks'>('chat')
 const [editingResource,setEditingResource] = useState<Resource|null>(null)
 const [sidebar, setSidebar] = useState(innerWidth >= 760)
 const [command, setCommand] = useState(false)
 const [drafts, setDrafts] = useState<Record<string, string>>({})
 const [runningTasks,setRunningTasks]=useState<Record<string,{sessionId:string;messageId:string}>>({})
 const running=runningTasks[activeId]

 const runs=useRef<Record<string,Run>>({})
 const answered=useAnswers(s=>s.done)
 const question=session.questionRequest&&!answered[session.questionRequest.id]?session.questionRequest:null
 useEffect(()=>{
  if(!question || question.startedAt !== undefined)return
  useAnswers.getState().start(question.id)
  const shownAt=useAnswers.getState().deadlines[question.id]-30000
  const lastUser=session.messages.findLastIndex(m=>m.role==='user')
  const elapsed=question.elapsedBeforeMs ?? session.messages.slice(lastUser+1).reduce((sum,m)=>sum+(m.durationMs??0),0)
  useStore.setState(s=>({sessions:s.sessions.map(x=>x.id===session.id?{...x,questionRequest:{...question,startedAt:shownAt-elapsed}}:x)}))
 },[question,session.id,session.messages])
 const empty = !session.messages.length
 useEffect(()=>()=>{Object.values(runs.current).forEach(run=>clearInterval(run.timer))},[])
 const finish=(id:string)=>{delete runs.current[id];setRunningTasks(s=>{const next={...s};delete next[id];return next})}
 const stopSession=(sessionId:string)=>{const run=runs.current[sessionId];if(run){clearInterval(run.timer);updateMessage(sessionId,run.messageId,{stopped:true,durationMs:Date.now()-run.startedAt});finish(sessionId)}}
 const stop=()=>stopSession(activeId)
 useEffect(()=>{const timer=setInterval(()=>{const answers=useAnswers.getState();for(const s of useStore.getState().sessions){const q=s.questionRequest;if(!q||answers.done[q.id]||!answers.deadlines[q.id]||Date.now()<answers.deadlines[q.id]||answers.states[q.id]==='timed-out')continue;answers.mark(q.id,'timed-out');const run=runs.current[s.id];if(run){clearInterval(run.timer);updateMessage(s.id,run.messageId,{stopped:true,durationMs:Date.now()-run.startedAt});delete runs.current[s.id];setRunningTasks(current=>{const next={...current};delete next[s.id];return next})}addMessage(s.id,{id:crypto.randomUUID(),role:'assistant',text:'等待回答超时，任务已停止。',questionStatus:'已超时'})}},250);return()=>clearInterval(timer)},[addMessage,updateMessage])
 const generate = (messageId: string, text: string, retry = false, startedAt = Date.now()) => {
  const id = activeId
  const response = `${retry ? '回复已恢复。' : '收到，我们一起把这件事理清楚。'}\n\n## 下一步\n\n关于「${text || '整理附件'}」，先确认目标和范围，再拆成几个具体步骤。\n\n1. **梳理目标**：明确需要交付的结果。\n2. **制定计划**：在 ${session.context.workspace} 工作空间中整理步骤。\n3. **验证结果**：记录完成项和未解决的问题。\n\n\`当前角色：${session.context.agent}\`\n\n`
  setRunningTasks(s=>({...s,[id]:{sessionId:id,messageId}}))
  let cursor = 0
  const timer = setInterval(() => { cursor += 7; updateMessage(id, messageId, { text: response.slice(0, cursor),durationMs:Date.now()-startedAt }); if (cursor >= response.length) { clearInterval(timer); finish(id) } }, 35)
  runs.current[id] = { sessionId: id, messageId, timer,startedAt }
 }
 const send = (text: string, files: string[], attachmentIds: string[] = []) => {
  if (runs.current[activeId]) return
  addMessage(activeId, { id: crypto.randomUUID(), role: 'user', text, files, attachmentIds })
  const task = taskFromMessage(text, activeId, session.context.agent, session.context.workspace)
  if (task) { setEditingResource(task); addMessage(activeId, { id: crypto.randomUUID(), role: 'assistant', text: '请在弹窗中确认定时任务配置。' }); return }
  const id = crypto.randomUUID(); addMessage(activeId, { id, role: 'assistant', text: '' }); generate(id, text)
 }
 const retry = (parentId: string | null) => {
  if (runs.current[activeId]) return
  const index = session.messages.findIndex(m => m.id === parentId)
  const target = session.messages[index + 1]
  if (!target || target.role !== 'assistant') return
  updateMessage(activeId, target.id, { text: '', parts: undefined, error: undefined, stopped: false, fileChanges: undefined, questionStatus: undefined, executing: undefined, durationMs: undefined, activity: undefined })
  generate(target.id, session.messages[index]?.text || '', true)
 }
 return <div className="app flex h-dvh overflow-hidden"><Sidebar open={sidebar} close={() => setSidebar(false)} view={view} navigate={setView}/>
 <ChatRuntime key={activeId} messages={session.messages} runningId={running?.sessionId === activeId ? running.messageId : undefined} send={send} stop={stop} retry={retry}>
 <main className="relative flex min-w-0 flex-1 flex-col"><header className="topbar flex h-16 shrink-0 items-center px-5 md:px-8"><div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">{!sidebar && <Button variant="ghost" size="icon" aria-label="展开侧栏" onClick={() => setSidebar(true)}><PanelLeft size={18}/></Button>}<span>{view==='chat' ? (empty ? '新会话' : session.title) : view==='agents' ? 'Agent' : view==='groups' ? 'Group' : view==='extensions' ? '扩展' : '定时任务'}</span></div>{view==='chat'&&activeId==='demo-complex'&&<ComplexReplay/>}</header>
 {view==='extensions'||view==='tasks' ? <ResourceLibrary key={view} mode={view} edit={setEditingResource}/> : view !== 'chat' ? <AgentLibrary key={view} kind={view} start={name => { const id = crypto.randomUUID(); useStore.setState(s => ({ activeId: id, sessions: [{ id, title: '新会话', context: { workspace: 'Ailya', agent: name, model: useCatalog.getState().agents.find(a => a.name === name)?.model ?? '默认模型' }, messages: [], group: '今天' }, ...s.sessions] })); setCommand(false); setView('chat') }}/> : <ThreadPrimitive.Root className={`chat-layout relative flex min-h-0 flex-1 flex-col ${empty ? 'justify-center pb-16' : ''}`}>
 <ThreadPrimitive.Viewport className={`conversation-scroll overflow-y-auto px-5 md:px-8 ${empty ? 'flex-none' : 'flex-1'}`} autoScroll={session.group !== '历史会话' || running?.sessionId === activeId} scrollToBottomOnInitialize={false} scrollToBottomOnThreadSwitch={false}>
 {empty ? <section className="mb-10 text-center"><div className="mb-8"><Mark/></div><h1 className="text-2xl font-medium">今天，我们一起做点什么？</h1></section> : <Messages/>}
 {!empty && <ThreadPrimitive.ScrollToBottom className="scroll-latest absolute bottom-44 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-xs shadow-sm disabled:hidden" aria-label="回到最新消息"><ArrowDown size={14}/>最新消息</ThreadPrimitive.ScrollToBottom>}
 </ThreadPrimitive.Viewport>
 <div className="input-area mx-auto w-[calc(100%-2rem)] max-w-[720px] pb-5 pt-3 md:w-[calc(100%-4rem)]">{empty && <ContextBar/>}<div className={question?'hidden':undefined}><Composer key={activeId} draft={drafts[activeId] || ''} setDraft={v => setDrafts(d => ({ ...d, [activeId]: v }))} blocked={false} commandOpen={command} setCommandOpen={setCommand}/></div>{question&&<QuestionPanel key={question.id} request={question} onRefuse={()=>{stopSession(activeId);addMessage(activeId,{id:crypto.randomUUID(),role:'assistant',text:'已拒答，任务已停止。',questionStatus:'已拒答',stopped:true})}} onSubmit={answer=>{addMessage(activeId,{id:crypto.randomUUID(),role:'user',questionAnswer:true,text:answer});const id=crypto.randomUUID();addMessage(activeId,{id,role:'assistant',text:''});generate(id,'根据已确认的回答继续任务：'+answer,false,question.startedAt ?? (useAnswers.getState().deadlines[question.id]-30000-(question.elapsedBeforeMs??0)))}}/>}
 
 </div></ThreadPrimitive.Root>}</main>{view==='chat'&&<AgentPanel session={session}/>}</ChatRuntime>{editingResource&&<ResourceEditor key={editingResource.id} entry={editingResource} close={()=>setEditingResource(null)} saved={(entry,isNew)=>{if(isNew&&entry.sourceSession)addMessage(entry.sourceSession,{id:crypto.randomUUID(),role:'assistant',text:'已保存定时任务「'+entry.name+'」。'})}}/>}</div>
}
export default App



















