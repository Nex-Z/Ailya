import type { FileChange } from './components/FileChanges'
import type { QuestionRequest } from './questions'
import type { ThreadMessageLike } from '@assistant-ui/react'
import { create } from 'zustand'
import { api } from './lib/core-api'
export type Context = { permission?:'default'|'full'; workspace: string; agent: string; model: string }
export type Message = { reasoning?:string; phase?:'waiting'|'thinking'|'generating'|'tool'|'compacting'; attachmentIds?:string[]; questionStatus?:string; fileChanges?:FileChange[]; durationMs?:number; executing?:boolean; questionAnswer?:boolean; id: string; role: 'user' | 'assistant'; text: string; files?: string[]; activity?: boolean; stopped?: boolean; error?: string; parts?: Exclude<ThreadMessageLike['content'], string> }
export type PermissionRequest={id:string;tool:string;args:Record<string,unknown>;action:string;createdAt:number;taskId:string;toolCallId:string}
export type Session = { compaction?:{status:'running'|'completed'|'failed'|'cancelled'|'skipped';mode:'auto'|'manual';jobId?:string;message?:string;before?:number;after?:number}; permissionRequest?:PermissionRequest; questionRequest?:QuestionRequest; id: string; title: string; context: Context; messages: Message[]; group: string }
const context = { workspace: 'Ailya', agent: 'Ailya', model: '默认模型' }
export const draft=():Session=>({id:crypto.randomUUID(),title:'新会话',context:{...context},messages:[],group:'今天'})
const first=draft()
type Store = { preferredModel:string; modelSaving:boolean; workspaceSelecting:boolean; sessions: Session[]; activeId: string; select: (id: string) => void; newSession: () => void; setContext: (key: keyof Context, value: string) => void; addMessage: (id: string, message: Message) => void; updateMessage: (id: string, messageId: string, patch: Partial<Message>) => void; remove: (id: string) => Promise<void> }
export const useStore=create<Store>(set=>({preferredModel:'默认模型',modelSaving:false,workspaceSelecting:false,sessions:[first],activeId:first.id,select:activeId=>{sessionStorage.setItem('ailya-active-session',activeId);set({activeId})},newSession:()=>set(s=>{const existing=s.sessions.find(x=>!x.messages.length);const next={...(existing??draft()),context:{...(existing?.context??context),model:s.preferredModel}};sessionStorage.setItem('ailya-active-session',next.id);return {activeId:next.id,sessions:existing?s.sessions.map(x=>x.id===next.id?next:x):[next,...s.sessions]}}),setContext:(key,value)=>set(s=>({sessions:s.sessions.map(x=>x.id===s.activeId&&(key==='model'?!x.messages.some(m=>m.executing):!x.messages.length)?{...x,context:{...x.context,[key]:value}}:x)})),addMessage:(id,message)=>set(s=>({sessions:s.sessions.map(x=>x.id===id?{...x,messages:[...x.messages,message]}:x)})),updateMessage:(id,messageId,patch)=>set(s=>({sessions:s.sessions.map(x=>x.id===id?{...x,messages:x.messages.map(m=>m.id===messageId?{...m,...patch}:m)}:x)})),remove:async id=>{await api('/sessions/'+id,{},'DELETE');set(s=>{let sessions=s.sessions.filter(x=>x.id!==id);if(!sessions.length)sessions=[draft()];return {sessions,activeId:s.activeId===id?sessions[0].id:s.activeId}})}}))
export function applySession(session:Session){useStore.setState(s=>({sessions:s.sessions.some(x=>x.id===session.id)?s.sessions.map(x=>x.id===session.id?session:x):[session,...s.sessions]}))}


