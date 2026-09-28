import type { FileChange } from './components/FileChanges'
import type { QuestionRequest } from './questions'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { demoSessions } from './demo/sessions'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export type Context = { permission?:'default'|'full'; workspace: string; agent: string; model: string }
export type Message = { attachmentIds?:string[]; questionStatus?:string; fileChanges?:FileChange[]; durationMs?:number; executing?:boolean; questionAnswer?:boolean; id: string; role: 'user' | 'assistant'; text: string; files?: string[]; activity?: boolean; stopped?: boolean; error?: string; parts?: Exclude<ThreadMessageLike['content'], string> }
export type Session = { questionRequest?:QuestionRequest; id: string; title: string; context: Context; messages: Message[]; group: string }
const context = { workspace: 'Ailya', agent: 'Ailya', model: '默认模型' }
const seed: Session[] = [
 { id: 'welcome', title: '新会话', context, messages: [], group: '今天' },
 { id: 'design', title: '一起梳理 Ailya 的交互', context, group: '今天', messages: [{ id: 'd1', role: 'user', text: '我们来梳理一下 Ailya 的会话体验。' }, { id: 'd2', role: 'assistant', text: '我们可以从最简单的一次对话开始。\n\n打开 Ailya，选择一个工作目录，就能开始工作。第一条消息发出后，这段会话的上下文就固定下来，之后随时回来都能接着聊。\n\n复杂的能力留在需要它们的时候：用 / 选择角色，展开执行过程了解进展，让对话始终是界面的中心。\n\n你想先从新建会话，还是团队协作的体验开始？', activity: true }] },
 { id: 'team', title: '检查项目，准备下一步', context: { ...context, agent: 'Dev Team' }, group: '昨天', messages: [{ id: 't1', role: 'user', text: '让团队一起看看项目，给我一个下一步计划。' }, { id: 't2', role: 'assistant', text: '团队已准备好。\n\nCoder 梳理结构，Reviewer 检查设计边界，Tester 整理验证场景。每个角色的过程都收在下面，最终由我统一汇总。\n\n建议先确认会话与输入区的交互，再逐步接入真实的本地能力。', activity: true }] },
 { id: 'notes', title: '整理我的工作灵感', context: { ...context, workspace: '个人空间' }, group: '昨天', messages: [{ id: 'n1', role: 'user', text: '帮我整理工作灵感。' }, { id: 'n2', role: 'assistant', text: '把想法留在这里就好。我们可以一起把零散的灵感整理成清晰的下一步。\n\n这是一条示例会话，你可以继续输入，体验对话流程。' }] }
]
type Store = { sessions: Session[]; activeId: string; select: (id: string) => void; newSession: () => void; setContext: (key: keyof Context, value: string) => void; addMessage: (id: string, message: Message) => void; updateMessage: (id: string, messageId: string, patch: Partial<Message>) => void; remove: (id: string) => void }
export const useStore = create<Store>()(persist((set) => ({ sessions: [...seed, ...demoSessions], activeId: 'welcome', select: (activeId) => set({ activeId }), newSession: () => set(s => { const draft = s.sessions.find(x => !x.messages.length); if (draft) return { activeId: draft.id }; const id = crypto.randomUUID(); return { activeId: id, sessions: [{ id, title: '新会话', context: { ...context }, messages: [], group: '今天' }, ...s.sessions] } }), setContext: (key, value) => set(s => ({ sessions: s.sessions.map(x => x.id === s.activeId && !x.messages.length ? { ...x, context: { ...x.context, [key]: value } } : x) })), addMessage: (id, message) => set(s => ({ sessions: s.sessions.map(x => x.id === id ? { ...x, title: x.messages.length === 0 ? message.text.slice(0, 22) || '附件会话' : x.title, messages: [...x.messages, message] } : x) })), updateMessage: (id, messageId, patch) => set(s => ({ sessions: s.sessions.map(x => x.id === id ? { ...x, messages: x.messages.map(m => m.id === messageId ? { ...m, ...patch } : m) } : x) })), remove: (id) => set(s => { const remaining = s.sessions.filter(x => x.id !== id); if (!remaining.length) remaining.push({ id: crypto.randomUUID(), title: '新会话', context: { ...context }, messages: [], group: '今天' }); return { sessions: remaining, activeId: s.activeId === id ? remaining[0].id : s.activeId } }) }), { name: 'ailya-prototype-v1', version: 10, migrate: (persisted, version) => { const old = persisted as Store; if(version===9)return {...old,sessions:old.sessions.map(session=>{const fresh=demoSessions.find(d=>d.id===session.id);return session.questionRequest&&fresh?.questionRequest?{...session,questionRequest:{...session.questionRequest,questions:session.questionRequest.questions.map(q=>({...q,recommendedOptions:fresh.questionRequest?.questions.find(n=>n.id===q.id)?.recommendedOptions}))}}:session})}; return { ...old, sessions: [...old.sessions.map(session=>{const fresh=demoSessions.find(d=>d.id===session.id);return fresh?{...session,group:fresh.group,questionRequest:fresh.questionRequest,messages:session.messages.map(m=>fresh.messages.find(n=>n.id===m.id)??m)}:session}), ...demoSessions.filter(d => !old.sessions.some(s => s.id === d.id))] } } }))















