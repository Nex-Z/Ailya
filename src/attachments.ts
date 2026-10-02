import { create } from 'zustand'
export type LocalAttachment = { id: string; file: File }
// File objects stay in memory: changing sessions preserves them; reloading releases them.
export const useAttachments = create<{
 drafts: Record<string, LocalAttachment[]>;
 files: Record<string, File>;
 add: (session: string, incoming: File[]) => void;
 remove: (session: string, id: string) => void;
 sent: (session: string, ids?:string[]) => void;
}>()(set => ({
 drafts: {}, files: {},
 add: (session, incoming) => set(s => {
  const added = incoming.map(file => ({ id: crypto.randomUUID(), file }))
  return { drafts: { ...s.drafts, [session]: [...(s.drafts[session] ?? []), ...added] }, files: { ...s.files, ...Object.fromEntries(added.map(a => [a.id, a.file])) } }
 }),
 remove: (session, id) => set(s => { const files = { ...s.files }; delete files[id]; return { files, drafts: { ...s.drafts, [session]: (s.drafts[session] ?? []).filter(a => a.id !== id) } } }),
 sent: (session,ids) => set(s => {
 const completed=new Set(ids??(s.drafts[session]??[]).map(f=>f.id)),files={...s.files}
 for(const id of completed)delete files[id]
 return {files,drafts:{...s.drafts,[session]:(s.drafts[session]??[]).filter(f=>!completed.has(f.id))}}
}),
}))

export async function encodeAttachments(ids:string[]){
 const files=ids.map(id=>{const file=useAttachments.getState().files[id];if(!file)throw Error('附件已不可用，请重新添加');return {id,file}})
 if(files.length>10||files.some(x=>x.file.size>8*1024*1024)||files.reduce((n,x)=>n+x.file.size,0)>16*1024*1024)throw Error('附件限 10 个，单个 8 MiB，总共 16 MiB')
 return Promise.all(files.map(async({id,file})=>{
  const bytes=new Uint8Array(await file.arrayBuffer());let raw=''
  for(let offset=0;offset<bytes.length;offset+=32768)raw+=String.fromCharCode(...bytes.subarray(offset,offset+32768))
  return {id,name:file.name,mime:file.type,base64:btoa(raw)}
 }))
}
