import type { FileChange } from '../components/FileChanges'
const changes=[
 {path:'E:/WorkSpace/project/Ailya/src/components/Composer.tsx',kind:'modified' as const,diff:[
 ' const sessionId = session.id;',
 '-const [files, setFiles] = useState<File[]>([]);',
 '+const files = attachmentDrafts[sessionId] ?? [];',
 '+const setFiles = (files: AttachmentDraft[]) => {',
 '+  setAttachmentDrafts(drafts => ({ ...drafts, [sessionId]: files }));',
 '+};',
 ' const submit = () => {',
 '-  send(draft, files);',
 '+  const snapshot = [...files];',
 '+  send(draft, snapshot.map(item => item.file));',
 '   setFiles([]);',
 ' };']},
 {path:'E:/WorkSpace/project/Ailya/src/attachments.ts',kind:'added' as const,diff:[
 '+export type AttachmentDraft = {', '+  id: string;', '+  file: File;', '+  previewUrl?: string;', '+};', '+', '+export const createAttachment = (file: File): AttachmentDraft => ({', '+  id: crypto.randomUUID(),', '+  file,', '+});']},
 {path:'E:/WorkSpace/project/Ailya/src/components/AttachmentList.tsx',kind:'modified' as const,diff:[
 ' <div className="flex items-center gap-2">', '-  <span>{file.name}</span>', '-  <button onClick={remove}>删除</button>', '+  <span className="min-w-0 flex-1 truncate">{file.name}</span>', '+  <button className="shrink-0" onClick={remove}>删除</button>', ' </div>']},
 {path:'E:/WorkSpace/project/Ailya/src/legacy-attachments.ts',kind:'deleted' as const,diff:[
 '-let files: File[] = [];', '-', '-export function addFile(file: File) {', '-  files.push(file);', '-}', '-', '-export function clearFiles() {', '-  files = [];', '-}']}
]
export const fileChanges:FileChange[]=changes.map(f=>({...f,added:f.diff.filter(l=>l.startsWith('+')).length,deleted:f.diff.filter(l=>l.startsWith('-')).length}))

fileChanges.push(
 {path:'E:/WorkSpace/project/Ailya/src/services/attachment-store.ts',oldPath:'E:/WorkSpace/project/Ailya/src/attachment-store.ts',kind:'renamed',added:1,deleted:1,oldStart:120,newStart:124,diff:[' export function clearDraft() {','-  cache.clear();','+  cache.delete(sessionId);',' }']},
 {path:'E:/WorkSpace/project/Ailya/public/attachment-preview.png',kind:'modified',added:0,deleted:0,binary:true},
 {path:'E:/WorkSpace/project/Ailya/src/generated/schema.ts',kind:'modified',added:1,deleted:1,oldStart:500,newStart:500,truncated:true,diff:['-export const version = 1;','+export const version = 2;']}
)
