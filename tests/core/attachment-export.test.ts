import {test,expect} from 'bun:test'
import type {AgentTool} from '@earendil-works/pi-agent-core'
import {existsSync,readFileSync,writeFileSync,mkdirSync,symlinkSync} from 'node:fs'
import {join} from 'node:path'
import {withCore,input,post,settle,call,sse,waitSession} from './helpers'
import {exportAttachmentTool} from '../../core/attachments'
import {SYSTEM_PROMPT} from '../../core/core'
import {localTools} from '../../core/local-tools'
import type {Session} from '../../core/contracts'
import {pdfFixture} from '../fixtures/pdf'

test('binary attachment fallback exports actual bytes after approval and shell consumes the exported file',async()=>{
 const id=crypto.randomUUID(),bytes=pdfFixture();let calls=0
 await withCore(async(app,url,workspace)=>{
  await post(url+'/api/sessions/pdf/send',{...input('Inspect the attachment'),attachments:[{id,name:'sample.pdf',mime:'application/pdf',base64:bytes.toString('base64')}]})
  const first=await waitSession(app,'pdf',s=>s?.permissionRequest?.tool==='export_attachment')
  expect(existsSync(join(workspace,'sample.pdf'))).toBe(false)
  await post(url+`/api/sessions/pdf/permissions/${first.permissionRequest!.id}`,{allow:true})
  const next=await waitSession(app,'pdf',s=>s?.permissionRequest?.tool==='powershell')
  expect(readFileSync(join(workspace,'sample.pdf'))).toEqual(bytes)
  await post(url+`/api/sessions/pdf/permissions/${next.permissionRequest!.id}`,{allow:true});await settle(app)
  const result=app.core.storage.session<Session>('pdf')!.messages.at(-1)!
  expect(result.text).toBe('INSPECTED');expect(result.fileChanges?.[0].binary).toBe(true)
  expect(result.fileChanges?.[0].path).toBe(join(workspace,'sample.pdf'))
  expect(calls).toBe(4)
 },async req=>{const body=await req.json();calls++;if(calls===1){expect(JSON.stringify(body.messages)).not.toContain('binary/document/image parsing is unavailable');return call('read_attachment',{id},'read')}
  if(calls===2){expect(JSON.stringify(body.messages)).toContain('export_attachment');return call('export_attachment',{id,path:'sample.pdf'},'export')}
  if(calls===3)return call('powershell',{command:"[BitConverter]::ToString([IO.File]::ReadAllBytes((Join-Path $PWD 'sample.pdf')))",timeout:10},'inspect')
  expect(JSON.stringify(body.messages)).toContain(Array.from(bytes).map(v=>v.toString(16).padStart(2,'0').toUpperCase()).join('-'));return sse({content:'INSPECTED'})
 })
})
test('export rejects foreign attachments, traversal, symlinks, overwrite and abort; same bytes are reused without another mutation',async()=>{
 const id=crypto.randomUUID(),bytes=Buffer.from([0,255,7,42]);let approvals=0,changes=0
 await withCore(async(app,url,workspace,root)=>{
  await post(url+'/api/sessions/owner/send',{...input(),attachments:[{id,name:'binary.dat',mime:'application/octet-stream',base64:bytes.toString('base64')}]});await settle(app)
  const tool=exportAttachmentTool(app.core.storage,'owner',workspace,'default',async()=>{approvals++},()=>{changes++})
  await expect(exportAttachmentTool(app.core.storage,'other',workspace,'full',async()=>{},()=>{}).execute('x',{id,path:'foreign.dat'})).rejects.toThrow('此会话')
  await expect(tool.execute('x',{id,path:'../outside.dat'})).rejects.toThrow('工作空间')
  const outside=join(root,'outside');mkdirSync(outside);symlinkSync(outside,join(workspace,'linked'),'junction')
  await expect(tool.execute('x',{id,path:'linked/leak.dat'})).rejects.toThrow('符号链接')
  writeFileSync(join(workspace,'keep.dat'),'keep')
  await expect(tool.execute('x',{id,path:'keep.dat'})).rejects.toThrow('内容不同');expect(readFileSync(join(workspace,'keep.dat'),'utf8')).toBe('keep')
  await expect(tool.execute('x',{id,path:'aborted.dat'},AbortSignal.abort())).rejects.toThrow();expect(existsSync(join(workspace,'aborted.dat'))).toBe(false)
  await tool.execute('first',{id,path:'.ailya/attachments/binary.dat'});await tool.execute('again',{id,path:'.ailya/attachments/binary.dat'})
  expect(approvals).toBe(1);expect(changes).toBe(1);expect(readFileSync(join(workspace,'.ailya/attachments/binary.dat'))).toEqual(bytes)
 },()=>sse({content:'ready'}))
})
test('denying export stops the task and never creates a copy',async()=>{
 const id=crypto.randomUUID()
 await withCore(async(app,url,workspace)=>{
  await post(url+'/api/sessions/deny/send',{...input(),attachments:[{id,name:'binary.dat',mime:'application/octet-stream',base64:'AA=='}]})
  const s=await waitSession(app,'deny',s=>!!s?.permissionRequest)
  await post(url+`/api/sessions/deny/permissions/${s.permissionRequest!.id}`,{allow:false});await settle(app)
  expect(existsSync(join(workspace,'denied.dat'))).toBe(false);expect(app.core.storage.session<Session>('deny')?.messages.at(-1)?.stopped).toBe(true)
 },()=>call('export_attachment',{id,path:'denied.dat'}))
})
test('existing built-in conversations receive the current capability policy without dropping their history',async()=>{
 let calls=0
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/policy/send',input('remember orchid'));await settle(app)
  const stored=app.core.storage.get<{data:string}>('SELECT data FROM transcripts WHERE session_id=?','policy')!
  const messages=JSON.parse(stored.data);messages[0]={role:'system',content:'STALE_BINARY_UNAVAILABLE_POLICY',timestamp:1}
  app.core.storage.db.run('UPDATE transcripts SET data=? WHERE session_id=?',[JSON.stringify(messages),'policy'])
  await post(url+'/api/sessions/policy/send',input('continue'));await settle(app)
  expect(calls).toBe(2)
 },async req=>{const body=await req.json();if(++calls===2){expect(JSON.stringify(body.messages)).not.toContain('STALE_BINARY_UNAVAILABLE_POLICY');expect(JSON.stringify(body.messages)).toContain(SYSTEM_PROMPT);expect(JSON.stringify(body.messages)).toContain('remember orchid')}return sse({content:'kept'})})
})
test('a Group member can export only its parent-session attachment and file-tool restrictions remain effective',async()=>{
 const id=crypto.randomUUID(),bytes=pdfFixture();let parent=0,worker=0
 await withCore(async(app,url,workspace)=>{
  app.core.catalog.save('agents',{id:'lead',name:'Lead',model:'默认模型',skills:[],tools:[],prompt:'LEAD'})
  app.core.catalog.save('agents',{id:'worker',name:'Worker',model:'默认模型',skills:[],tools:['文件'],prompt:'WORKER'})
  app.core.catalog.save('groups',{id:'team',name:'Team',coordinator:'lead',members:['worker']})
  const data=input();data.context.agent='Team';data.context.permission='full'
  await post(url+'/api/sessions/group/send',{...data,attachments:[{id,name:'sample.pdf',mime:'application/pdf',base64:bytes.toString('base64')}]});await settle(app)
  expect(readFileSync(join(workspace,'group.pdf'))).toEqual(bytes)
  expect(app.core.storage.session<Session>('group')?.messages.at(-1)?.fileChanges?.[0].path).toContain('group.pdf')
 },async req=>{const body=await req.json();const tools=body.tools.map((t:{function:{name:string}})=>t.function.name)
  if(JSON.stringify(body.messages).includes('WORKER')){expect(tools).toContain('export_attachment');expect(tools).not.toContain('powershell');return ++worker===1?call('export_attachment',{id,path:'group.pdf'}):sse({content:'EXPORTED'})}
  expect(tools).not.toContain('export_attachment');return ++parent===1?call('delegate_agent',{agent:'worker',task:'Export the attachment with ID '+id}):sse({content:'TEAM_DONE'})
 })
})
test('Windows Store Python failure includes the verified launcher alternative',async()=>{
 if(process.platform!=='win32'||!/[\\/]Microsoft[\\/]WindowsApps[\\/]/i.test(Bun.which('python')??''))return
 await withCore(async(_app,_url,workspace)=>{
  const shell:AgentTool=localTools(workspace,'full',async()=>{},()=>{}).find(t=>t.name==='powershell')!
  expect(shell.description).toContain('Windows Store')
  let message=''
  try{await shell.execute('alias',{command:'python -c "print(123)"',timeout:5})}catch(error){message=String(error)}
  expect(message).toContain('Windows Store alias');if(Bun.which('py'))expect(message).toContain('py -3')
 },()=>sse({content:'unused'}))
})
