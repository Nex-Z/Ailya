import { useAttachments, type LocalAttachment } from '../attachments'
import { usePreferences } from '../preferences'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import { useCatalog } from '../catalog'
import { useAui, useAuiState } from '@assistant-ui/react'
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Paperclip, Square, X, Mic } from 'lucide-react'
import { ContextSelect } from './ContextBar'
import { Textarea } from './ui/textarea'
import { Button } from './ui/button'
import { SlashCommand } from './SlashCommand'
import { commands, getCommandItems, type CommandItem } from './command-items'
import { useStore } from '../store'
export function Composer({ blocked, commandOpen, setCommandOpen, draft, setDraft }: { blocked: boolean; commandOpen: boolean; setCommandOpen: (v: boolean) => void; draft: string; setDraft: (v: string) => void }) {
 const aui = useAui()
 const running = useAuiState(s => s.thread.isRunning)
 const stop = () => aui.thread().cancelRun()
 const attachmentStore = useAttachments()
 const sessionId = useStore(s => s.activeId)
 const files = attachmentStore.drafts[sessionId] ?? []
 const sendKey = usePreferences(s => s.config.sendKey)
 const send = (text: string, entries: LocalAttachment[]) => aui.thread().append({ role: 'user', content: [{ type: 'text', text }], attachments: entries.map(({id,file}) => ({ id, type: 'file', name: file.name, file, content: [], status: { type: 'complete' } })) })
 const [dragging,setDragging] = useState(false)
 const dragDepth = useRef(0)
 const addFiles = (incoming: FileList | File[]) => attachmentStore.add(sessionId, Array.from(incoming))
 const [active, setActive] = useState(0)
 const [menuQuery, setMenuQuery] = useState('/')
 const input = useRef<HTMLInputElement>(null)
 const textarea = useRef<HTMLTextAreaElement>(null)
 const wrapper = useRef<HTMLDivElement>(null)
 const session = useStore(s => s.sessions.find(x => x.id === s.activeId)!)
 const setContext = useStore(s => s.setContext)
 const catalog = useCatalog()
 const items = getCommandItems(menuQuery, [...catalog.agents, ...catalog.groups].map(x => x.name))
 const selected = Math.min(active, Math.max(items.length - 1, 0))
 const slashDraft = draft.startsWith('/') && !draft.includes('\n')
 useEffect(() => {
  if (!commandOpen) return
  textarea.current?.focus()
  const dismiss = (e: PointerEvent) => { if (!wrapper.current?.contains(e.target as Node)) setCommandOpen(false) }
  document.addEventListener('pointerdown', dismiss)
  return () => document.removeEventListener('pointerdown', dismiss)
 }, [commandOpen, setCommandOpen])
 useEffect(() => { if (commandOpen) document.getElementById(`slash-option-${selected}`)?.scrollIntoView({ block: 'nearest' }) }, [selected, commandOpen])

 const select = (item: CommandItem) => {
  if (item.prompt) { setDraft(item.prompt); setCommandOpen(false); textarea.current?.focus(); return }
  if (!item.key) return
  if (!item.value) { const query = commands.find(c => c.key === item.key)!.command + ' '; setMenuQuery(query); if (!draft || slashDraft) setDraft(query); setActive(0); textarea.current?.focus(); return }
  if (session.messages.length) return
  setContext(item.key, item.value); setCommandOpen(false); setMenuQuery('/'); if (slashDraft) setDraft(''); textarea.current?.focus()
 }
 const submit = () => { if ((!draft.trim() && !files.length) || running || blocked || commandOpen) return; send(draft.trim(), files); setDraft(''); attachmentStore.sent(sessionId) }
 return <div className="composer-wrap relative" ref={wrapper} onDragEnter={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragDepth.current++;setDragging(true)}} onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}}} onDragLeave={e=>{e.preventDefault();dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false)}} onDrop={e=>{if(!e.dataTransfer.types.includes('Files'))return;e.preventDefault();dragDepth.current=0;setDragging(false);addFiles(e.dataTransfer.files)}}>
  {commandOpen && <SlashCommand items={items} active={selected} select={select} context={session.context} locked={!!session.messages.length}/>}

   {files.length > 0 && <div className="composer-attachments mb-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">{files.map((f) => <span className="inline-flex max-w-full items-center gap-2 break-all rounded-md border bg-muted px-2 py-1 text-xs" key={f.id}><Paperclip size={12}/>{f.file.name}<button aria-label={`移除 ${f.file.name}`} onClick={() => attachmentStore.remove(sessionId, f.id)}><X size={12}/></button></span>)}</div>}
  <div className={`composer rounded-xl border bg-popover p-3 shadow-sm focus-within:ring-1 focus-within:ring-ring ${dragging ? 'ring-2 ring-ring bg-muted' : ''}`}>
   <Textarea className="min-h-20 resize-none border-0 bg-transparent px-1 py-2 text-sm shadow-none focus-visible:ring-0" ref={textarea} aria-label="消息" aria-expanded={commandOpen} aria-controls={commandOpen ? 'slash-options' : undefined} aria-activedescendant={commandOpen && items.length ? `slash-option-${selected}` : undefined} placeholder="有什么想一起做的？" rows={2} value={draft} onChange={e => { const value = e.target.value; setDraft(value); const isCommand = value.startsWith('/') && !value.includes('\n'); setCommandOpen(isCommand); if (isCommand) { setMenuQuery(value); setActive(0) } }} onKeyDown={e => {
    if (e.nativeEvent.isComposing) return
    if (commandOpen) {
     if (e.key === 'Escape') { e.preventDefault(); setCommandOpen(false); return }
     if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive((selected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % (items.length || 1)); return }
     if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (items[selected]) select(items[selected]); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && (sendKey === 'Ctrl + Enter' ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey)) { e.preventDefault(); submit() }
   }}/>
   <div className="composer-actions mt-1 flex items-center gap-2 text-muted-foreground"><Button variant="ghost" size="icon" aria-label="添加附件" onClick={() => input.current?.click()}><Paperclip size={18}/></Button><Select value={session.context.permission??'default'} onValueChange={v=>useStore.setState(s=>({sessions:s.sessions.map(x=>x.id===session.id?{...x,context:{...x.context,permission:v as 'default'|'full'}}:x)}))}><SelectTrigger aria-label="执行权限" className="h-8 w-auto gap-1 border-0 px-2 text-xs shadow-none"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="default">默认权限</SelectItem><SelectItem value="full">所有权限</SelectItem></SelectContent></Select><input ref={input} type="file" multiple className="hidden" onChange={e => { addFiles(e.target.files || []); e.target.value = '' }}/><div className="model-slot ml-auto"><ContextSelect kind="model"/></div><Button variant="ghost" size="icon" aria-label="语音输入" title="语音输入不可用" disabled><Mic size={18}/></Button><Button size="icon" className="send-button size-8 rounded-md" disabled={blocked || (!running && ((!draft.trim() && !files.length) || commandOpen))} onClick={running ? stop : submit} aria-label={running ? '停止生成' : '发送消息'}>{running ? <Square size={14} fill="currentColor"/> : <ArrowUp size={18}/>}</Button></div>
  </div>
 </div>
}










