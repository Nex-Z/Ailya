import {PermissionPanel} from './components/PermissionPanel'
import {useAttachments,encodeAttachments} from './attachments'

import { ComplexReplay } from './components/ComplexReplay'
import { QuestionPanel } from './components/QuestionPanel'
import { useCore } from './runtime/useCore'
import { api } from './lib/core-api'
import { AgentPanel } from './components/AgentPanel'
import { ResourceLibrary } from './components/ResourceLibrary'
import { ResourceEditor } from './components/ResourceEditor'
import { type Resource } from './resources'
import { useCatalog } from './catalog'
import { AgentLibrary } from './components/AgentLibrary'
import { useRef, useState } from 'react'
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
function App() {
 const {sessions,activeId,addMessage,modelSaving,workspaceSelecting}=useStore()
 const session=sessions.find(s=>s.id===activeId)!
 const [view,setView]=useState<'chat'|'agents'|'groups'|'extensions'|'tasks'>('chat')
 const [editingResource,setEditingResource]=useState<Resource|null>(null)
 const [sidebar,setSidebar]=useState(innerWidth>=760)
 const [command,setCommand]=useState(false)
 const [drafts,setDrafts]=useState<Record<string,string>>({})
 const {error,setError,ready}=useCore()
 const current=session.messages.find(m=>m.executing)
 const running=current?{sessionId:activeId,messageId:current.id}:undefined
 const question=session.questionRequest??null
 const empty=!session.messages.length
 const pending=useRef(new Set<string>())
 const [uploads,setUploads]=useState<Set<string>>(new Set())
 const stopSession=(id:string)=>{void api('/sessions/'+id+'/stop',{}).catch(e=>setError(e.message))}
 const stop=()=>stopSession(activeId)
 const send=async(text:string,_files:string[],attachmentIds:string[]=[])=>{
  if(pending.current.has(activeId)||running)return
  const id=activeId;sessionStorage.setItem('ailya-active-session',id);pending.current.add(id);setUploads(new Set(pending.current));setError('')
  try{
   const attachments=await encodeAttachments(attachmentIds)
   await api('/sessions/'+id+'/send',{requestId:crypto.randomUUID(),text,attachments,context:session.context})
   setDrafts(d=>d[id]?.trim()===text?{...d,[id]:''}:d);useAttachments.getState().sent(id,attachmentIds)
  }catch(error){setError(error instanceof Error?error.message:'发送失败')}
  finally{pending.current.delete(id);setUploads(new Set(pending.current))}
 }
 const retry=(parentId:string|null)=>{
  const index=session.messages.findIndex(m=>m.id===parentId),reply=session.messages[index+1]
  if(!reply||running||pending.current.has(activeId))return
  const id=activeId;pending.current.add(id)
  void api('/sessions/'+id+'/send',{requestId:crypto.randomUUID(),text:session.messages[index].text,context:session.context,retryMessageId:reply.id}).catch(e=>setError(e.message)).finally(()=>pending.current.delete(id))
 }
 return <div className="app flex h-dvh overflow-hidden"><Sidebar open={sidebar} close={() => setSidebar(false)} view={view} navigate={setView}/>
 <ChatRuntime key={activeId} messages={session.messages} runningId={running?.sessionId === activeId ? running.messageId : undefined} send={send} stop={stop} retry={retry}>
 <main className="relative flex min-w-0 flex-1 flex-col"><header className="topbar flex h-16 shrink-0 items-center px-5 md:px-8"><div className="flex min-w-0 items-center gap-3 text-sm text-muted-foreground">{!sidebar && <Button variant="ghost" size="icon" aria-label="展开侧栏" onClick={() => setSidebar(true)}><PanelLeft size={18}/></Button>}<span>{view==='chat' ? (empty ? '新会话' : session.title) : view==='agents' ? 'Agent' : view==='groups' ? 'Group' : view==='extensions' ? '扩展' : '定时任务'}</span></div>{view==='chat'&&activeId==='demo-complex'&&<ComplexReplay/>}</header>
 {view==='extensions'||view==='tasks' ? <ResourceLibrary key={view} mode={view} edit={setEditingResource}/> : view !== 'chat' ? <AgentLibrary key={view} kind={view} start={name => { const id = crypto.randomUUID(); useStore.setState(s => ({ activeId: id, sessions: [{ id, title: '新会话', context: { workspace: 'Ailya', agent: name, model: useCatalog.getState().agents.find(a => a.name === name)?.model ?? '默认模型' }, messages: [], group: '今天' }, ...s.sessions] })); setCommand(false); setView('chat') }}/> : <ThreadPrimitive.Root className={`chat-layout relative flex min-h-0 flex-1 flex-col ${empty ? 'justify-center pb-16' : ''}`}>
 <ThreadPrimitive.Viewport className={`conversation-scroll overflow-y-auto px-5 md:px-8 ${empty ? 'flex-none' : 'flex-1'}`} autoScroll={session.group !== '历史会话' || running?.sessionId === activeId} scrollToBottomOnInitialize={false} scrollToBottomOnThreadSwitch={false}>
 {empty ? <section className="mb-10 text-center"><div className="mb-8"><Mark/></div><h1 className="text-2xl font-medium">今天，我们一起做点什么？</h1></section> : <Messages/>}
 {!empty && <ThreadPrimitive.ScrollToBottom className="scroll-latest absolute bottom-44 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover px-3 py-1.5 text-xs shadow-sm disabled:hidden" aria-label="回到最新消息"><ArrowDown size={14}/>最新消息</ThreadPrimitive.ScrollToBottom>}
 </ThreadPrimitive.Viewport>
 <div className="input-area mx-auto w-[calc(100%-2rem)] max-w-[720px] pb-5 pt-3 md:w-[calc(100%-4rem)]">{error&&<p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}{session.permissionRequest&&<PermissionPanel key={session.permissionRequest.id} sessionId={activeId} request={session.permissionRequest}/>}{<ContextBar/>}<div className={question?'hidden':undefined}><Composer key={activeId} draft={drafts[activeId] || ''} setDraft={v => setDrafts(d => ({ ...d, [activeId]: v }))} blocked={workspaceSelecting||modelSaving||!ready||uploads.has(activeId)} commandOpen={command} setCommandOpen={setCommand}/></div>{question&&<QuestionPanel key={question.id} request={question} sessionId={activeId} disabled={!ready} onError={setError}/>}
 
 </div></ThreadPrimitive.Root>}</main>{view==='chat'&&<AgentPanel session={session}/>}</ChatRuntime>{editingResource&&<ResourceEditor key={editingResource.id} entry={editingResource} close={()=>setEditingResource(null)} saved={(entry,isNew)=>{if(isNew&&entry.sourceSession)addMessage(entry.sourceSession,{id:crypto.randomUUID(),role:'assistant',text:'已保存定时任务「'+entry.name+'」。'})}}/>}</div>
}
export default App

