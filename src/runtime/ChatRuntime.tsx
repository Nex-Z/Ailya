import { useAttachments } from '../attachments'
import layoutSketch from '../demo/layout.svg?raw'
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import type { ReactNode } from 'react'
import type { Message } from '../store'
export function ChatRuntime({ messages, runningId, send, stop, retry, children }: { messages: Message[]; runningId?: string; send: (text: string, files: string[], attachmentIds: string[]) => void; stop: () => void; retry: (parentId: string | null) => void; children: ReactNode }) {
 const runtime = useExternalStoreRuntime<Message>({
  messages,
  isRunning: !!runningId,
  convertMessage: (message): ThreadMessageLike => ({
   id: message.id,
   role: message.role,
   content: message.parts?.map(part => part.type === 'image' && part.image === '/demo-layout.svg' ? { ...part, image: 'data:image/svg+xml;base64,' + btoa(layoutSketch) } : part) ?? [{ type: 'text', text: message.text }],
   ...(message.role === 'assistant' ? { status: message.id === runningId ? { type: 'running' as const } : message.error ? { type: 'incomplete' as const, reason: 'error' as const, error: message.error } : message.stopped ? { type: 'incomplete' as const, reason: 'cancelled' as const } : { type: 'complete' as const, reason: 'stop' as const } } : {}),
   attachments: message.role === 'user' ? message.files?.map((name, i) => ({ id: message.attachmentIds?.[i] ?? `${message.id}-file-${i}`, file: useAttachments.getState().files[message.attachmentIds?.[i] ?? ""], name, type: 'file', status: { type: 'complete' as const }, content: [] })) : undefined,
  }),
  onNew: async message => { send(message.content.filter(p => p.type === 'text').map(p => p.text).join('\n'), (message.attachments ?? []).map(a => a.name), (message.attachments ?? []).map(a => a.id)) },
  onCancel: async () => { stop() },
  onReload: async parentId => { retry(parentId) },
 })
 return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}



