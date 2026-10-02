import {test,expect} from 'bun:test'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {Storage} from '../../core/storage'
import {attachmentTool} from '../../core/attachments'
import {withCore,call,sse,input,post,settle} from './helpers'
import type {Session} from '../../core/contracts'
test('uploaded bytes are consumed by Pi, persist with message, backup and download; no cross-session access',async()=>{
 const id=crypto.randomUUID(),content='Only attachment contains code: orchid-42\n';let calls=0;const requests:unknown[]=[]
 await withCore(async(app,url,_workspace,root)=>{
  const body={...input('Read the attachment'),attachments:[{id,name:'附件.txt',mime:'text/plain',base64:Buffer.from(content).toString('base64')}]}
  const response=await post(url+'/api/sessions/one/send',body);expect(response.status).toBe(202);await settle(app)
  expect(JSON.stringify(requests[0])).toContain(id);expect(JSON.stringify(requests[0])).not.toContain('orchid-42');expect(JSON.stringify(requests[1])).toContain('orchid-42')
  const session=app.core.storage.session<Session>('one')!;expect(session.messages[0].files).toEqual(['附件.txt']);expect(session.messages[0].attachmentIds).toEqual([id])
  expect((await post(url+'/api/sessions/one/send',body)).status).toBe(202)
  expect(app.core.storage.get<{n:number}>('SELECT count(*) n FROM attachments')!.n).toBe(1)
  const downloaded=await fetch(url+'/api/sessions/one/attachments/'+id);expect(await downloaded.text()).toBe(content);expect(downloaded.headers.get('content-disposition')).toContain('attachment;')
  expect((await fetch(url+'/api/sessions/other/attachments/'+id)).status).toBe(404)
  await expect(attachmentTool(app.core.storage,'other').execute('x',{id})).rejects.toThrow('此会话')
  const stored=app.core.storage.get<{hash:string}>('SELECT hash FROM attachments')!;expect(stored.hash).toBe(createHash('sha256').update(content).digest('hex'))
  app.core.storage.backup(join(root,'backup.sqlite'));const restored=new Storage(join(root,'backup.sqlite'))
  try{expect(restored.session<Session>('one')!.messages[0].attachmentIds).toEqual([id]);expect(JSON.stringify(await attachmentTool(restored,'one').execute('r',{id}))).toContain('orchid-42')}finally{restored.close()}
  const duplicate={...body,requestId:crypto.randomUUID()};expect((await post(url+'/api/sessions/two/send',duplicate)).status).toBe(400);expect(app.core.storage.session('two')).toBeUndefined()
  expect((await fetch(url+'/api/sessions/one',{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(200)
  expect(app.core.storage.get<{n:number}>('SELECT count(*) n FROM attachments')!.n).toBe(0)
 },async req=>{requests.push(await req.json());return ++calls===1?call('read_attachment',{id}):sse({content:'orchid-42'})})
})
test('attachment-only input persists; unsupported binary is explicit; malformed names/data rejected atomically',async()=>{
 let calls=0;const id=crypto.randomUUID()
 await withCore(async(app,url)=>{
  const body={...input(''),attachments:[{id,name:'test.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.7 test').toString('base64')}]}
  expect((await post(url+'/api/sessions/one/send',body)).status).toBe(202);await settle(app)
  const event=app.core.storage.get<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'")!;expect(JSON.parse(event.data).isError).toBe(true)
  for(const attachment of [{...body.attachments[0],id:crypto.randomUUID(),name:'../bad.txt'},{...body.attachments[0],id:crypto.randomUUID(),name:'..\\bad.txt'},{...body.attachments[0],id:crypto.randomUUID(),base64:'invalid!!'}]){
   expect((await post(url+'/api/sessions/invalid/send',{...input('test'),attachments:[attachment]})).status).toBe(400)
   expect(app.core.storage.session('invalid')).toBeUndefined()
  }
 },()=>++calls===1?call('read_attachment',{id}):sse({content:'Binary parsing is unavailable'}))
})

