import { create } from 'zustand'
export type LocalAttachment = { id: string; file: File }
// File objects stay in memory: changing sessions preserves them; reloading releases them.
export const useAttachments = create<{
 drafts: Record<string, LocalAttachment[]>;
 files: Record<string, File>;
 add: (session: string, incoming: File[]) => void;
 remove: (session: string, id: string) => void;
 sent: (session: string) => void;
}>()(set => ({
 drafts: {}, files: {},
 add: (session, incoming) => set(s => {
  const added = incoming.map(file => ({ id: crypto.randomUUID(), file }))
  return { drafts: { ...s.drafts, [session]: [...(s.drafts[session] ?? []), ...added] }, files: { ...s.files, ...Object.fromEntries(added.map(a => [a.id, a.file])) } }
 }),
 remove: (session, id) => set(s => { const files = { ...s.files }; delete files[id]; return { files, drafts: { ...s.drafts, [session]: (s.drafts[session] ?? []).filter(a => a.id !== id) } } }),
 sent: session => set(s => ({ drafts: { ...s.drafts, [session]: [] } })),
}))
