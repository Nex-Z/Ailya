import {test,expect} from 'bun:test'
import {mkdirSync,writeFileSync,readFileSync,existsSync,symlinkSync} from 'node:fs'
import {join} from 'node:path'
import {withCore,input,post,settle,sse,call,waitSession} from './helpers'
import type {Session} from '../../core/contracts'
const doc=(name='local-writer',body='Load references/value.txt, export this package, then run scripts/write.cjs using Node. Keep all output in the workspace.',manual=false)=>`---\nname: ${name}\ndescription: Write a skill proof file using the bundled script.\ndisable-model-invocation: ${manual}\n---\n${body}`
function pack(root:string){const dir=join(root,'package');mkdirSync(join(dir,'references'),{recursive:true});mkdirSync(join(dir,'scripts'));writeFileSync(join(dir,'SKILL.md'),doc());writeFileSync(join(dir,'references/value.txt'),'SKILL-PROOF-73');writeFileSync(join(dir,'scripts/write.cjs'),"require('node:fs').writeFileSync('skill-proof.txt',require('node:fs').readFileSync(require('node:path').join(__dirname,'../references/value.txt')))");return dir}
test('real Pi skill parsing, discovery, import, reference reads, export and shell produce actual file',async()=>{
 let n=0
 await withCore(async(app,url,workspace,root)=>{
  const path=pack(root),discovery=await(await post(url+'/api/skills/discover',{path:root})).json();expect(discovery[0].name).toBe('local-writer')
  const r=await(await post(url+'/api/skills/import',{path,enabled:true})).json();expect(r.kind).toBe('skill')
  const task=await post(url+'/api/sessions/skills/send',{...input('Use local-writer to produce the proof file'),context:{...input().context,permission:'full'}});expect(task.status).toBe(202);await settle(app)
  const session=app.core.storage.session<Session>('skills')!;expect(session.messages.at(-1)?.error).toBeUndefined()
  expect(readFileSync(join(workspace,'skill-proof.txt'),'utf8')).toBe('SKILL-PROOF-73')
  expect(app.core.storage.all('SELECT * FROM task_skills')).toHaveLength(1);expect(app.core.storage.all('SELECT * FROM task_skill_files')).toHaveLength(3)
  expect(session.messages.at(-1)!.fileChanges!.some(f=>f.path.endsWith('scripts\\write.cjs')&&!f.binary)).toBe(true)
  const req=JSON.parse(app.core.storage.get<{data:string}>('SELECT data FROM requests ORDER BY rowid LIMIT 1')!.data)
  expect(JSON.stringify(req.context)).toContain('local-writer');expect(JSON.stringify(req.context)).not.toContain('Load references/value.txt')
 },async req=>{const body=await req.json() as {messages:{role:string;content:string}[]};n++;if(n===1)return call('load_skill',{skill:'local-writer'});if(n===2)return call('load_skill',{skill:'local-writer',path:'references/value.txt'},'ref');if(n===3)return call('export_skill',{skill:'local-writer'},'export');if(n===4){const data=JSON.parse(body.messages.findLast(m=>m.role==='tool')!.content);return call('powershell',{command:`node '${data.directory.replaceAll("'","''")}\\scripts\\write.cjs'`},'script')}return sse({content:'DONE'})})
})
test('export denial writes nothing and disabling a skill blocks a waiting authorization',async()=>{
 await withCore(async(app,url,workspace)=>{
  const r=app.core.resources.save({id:crypto.randomUUID(),kind:'skill',name:'safe',enabled:true,instructions:doc('safe')})
  await post(url+'/api/sessions/deny/send',input('export safe'));const session=await waitSession(app,'deny',s=>!!s?.permissionRequest)
  await post(url+`/api/sessions/deny/permissions/${session.permissionRequest!.id}`,{allow:false});await settle(app)
  expect(existsSync(join(workspace,'.ailya','skills'))).toBe(false)
  await post(url+'/api/sessions/disabled/send',input('export safe'));const pending=await waitSession(app,'disabled',s=>!!s?.permissionRequest)
  app.core.resources.save({...r,enabled:false});await post(url+`/api/sessions/disabled/permissions/${pending.permissionRequest!.id}`,{allow:true});await settle(app)
  expect(existsSync(join(workspace,'.ailya','skills'))).toBe(false)
  expect(JSON.stringify(app.core.storage.session('disabled'))).toContain('Skill 已停用或删除')
 },async req=>{const b=await req.json() as {messages:{role:string}[]};return b.messages.some(m=>m.role==='tool')?sse({content:'done'}):call('export_skill',{skill:'safe'})})
})
test('Agent selection is enforced, skill does not grant tools, manual skills stay out of the automatic catalog',async()=>{
 let names:string[][]=[],prompts:string[]=[]
 await withCore(async(app,url)=>{
  const a=app.core.resources.save({id:crypto.randomUUID(),kind:'skill',name:'manual',enabled:true,instructions:doc('manual','MANUAL-INSTRUCTION-ONLY',true)})
  app.core.resources.save({id:crypto.randomUUID(),kind:'skill',name:'foreign',enabled:true,instructions:doc('foreign')})
  app.core.catalog.save('agents',{id:'reader',name:'Reader',model:'默认模型',skills:['manual'],tools:[],prompt:'Use only assigned skills'})
  expect(app.core.catalog.list().agents[0].skills).toEqual([a.id])
  await post(url+'/api/sessions/reader/send',{...input('hello'),context:{...input().context,agent:'Reader'}});await settle(app)
  expect(names[0]).toContain('load_skill');expect(names[0]).not.toContain('export_skill');expect(names[0]).not.toContain('powershell');expect(prompts[0]).not.toContain('MANUAL-INSTRUCTION-ONLY');expect(prompts[0]).not.toContain('<name>manual</name>')
  expect(JSON.stringify(app.core.storage.session('reader'))).toContain('Skill 不属于当前 Agent')
  await post(url+'/api/sessions/manual/send',{...input('/skill:manual do it'),context:{...input().context,agent:'Reader'}});await settle(app)
  expect(prompts.some(p=>p.includes('MANUAL-INSTRUCTION-ONLY'))).toBe(true)
  expect((await post(url+'/api/sessions/wrong/send',{...input('/skill:foreign do it'),context:{...input().context,agent:'Reader'}})).status).toBe(400)
  expect(app.core.storage.session('wrong')).toBeUndefined()
 },async req=>{const b=await req.json() as {tools:{function:{name:string}}[];messages:{role:string;content:string}[]};names.push(b.tools.map(t=>t.function.name));prompts.push(JSON.stringify(b.messages));return !b.messages.some(m=>m.role==='tool')&&!JSON.stringify(b.messages).includes('MANUAL-INSTRUCTION-ONLY')?call('load_skill',{skill:'foreign'}):sse({content:'OK'})})
})
test('running tasks pin skill bytes while edits take effect in the next task; invalid imports are atomic',async()=>{
 let release=()=>{},entered=()=>{},n=0
 const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r)
 await withCore(async(app,url,_workspace,root)=>{
  const r=app.core.resources.save({id:crypto.randomUUID(),kind:'skill',name:'versioned',enabled:true,instructions:doc('versioned','ORIGINAL-VERSION')})
  await post(url+'/api/sessions/v/send',input('load versioned'));await started
  app.core.resources.save({...r,instructions:doc('versioned','NEW-VERSION')});release();await settle(app)
  const results=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_end'")
  expect(JSON.stringify(results)).toContain('ORIGINAL-VERSION');expect(JSON.stringify(results)).not.toContain('NEW-VERSION')
  await post(url+'/api/sessions/v2/send',input('/skill:versioned explain'));await settle(app)
  expect(JSON.stringify(app.core.storage.all('SELECT data FROM requests'))).toContain('NEW-VERSION')
  const before=app.core.resources.list().length,bad=join(root,'bad');mkdirSync(bad);writeFileSync(join(bad,'SKILL.md'),'---\nname: bad\n---\nNo description')
  expect((await post(url+'/api/skills/import',{path:bad,enabled:true})).status).toBe(400);expect(app.core.resources.list()).toHaveLength(before)
  const bundle=pack(root),outside=join(root,'outside');mkdirSync(outside);symlinkSync(outside,join(bundle,'escape'),'junction')
  expect(()=>app.core.resources.importSkill(bundle)).toThrow('符号链接')
 },async()=>{n++;if(n===1){entered();await gate;return call('load_skill',{skill:'versioned'})}return sse({content:'OK'})})
})
test('skill tools reject traversal, binary text, aborted exports, changed files and linked export roots',async()=>{
 await withCore(async(app,url,workspace,root)=>{
  const dir=pack(root);writeFileSync(join(dir,'binary.dat'),Buffer.from([0,1,255]));const r=app.core.resources.importSkill(dir,true)
  await post(url+'/api/sessions/bounds/send',input('ready'));await settle(app)
  const task=app.core.storage.get<{id:string}>('SELECT id FROM tasks')!.id,skills=app.core.resources.skills.snapshots(task),changes:unknown[]=[]
  const [load,exporter]=app.core.resources.skills.tools(task,skills,workspace,async()=>{},true,'full',c=>changes.push(c))
  await expect(load.execute('bad',{skill:'local-writer',path:'../outside'})).rejects.toThrow('路径不安全')
  await expect(load.execute('binary',{skill:'local-writer',path:'binary.dat'})).rejects.toThrow('二进制')
  await expect(exporter.execute('aborted',{skill:'local-writer'},AbortSignal.abort())).rejects.toThrow();expect(existsSync(join(workspace,'.ailya'))).toBe(false)
  await exporter.execute('first',{skill:'local-writer'});await exporter.execute('repeat',{skill:'local-writer'});expect(changes).toHaveLength(4)
  const target=join(workspace,'.ailya','skills',r.id,skills[0].hash,'SKILL.md');writeFileSync(target,'USER-CHANGED')
  await expect(exporter.execute('changed',{skill:'local-writer'})).rejects.toThrow('被修改');expect(readFileSync(target,'utf8')).toBe('USER-CHANGED')
  const second=join(root,'second'),outside=join(root,'outside');mkdirSync(second);mkdirSync(outside);symlinkSync(outside,join(second,'.ailya'),'junction')
  const linked=app.core.resources.skills.tools(task,skills,second,async()=>{},true,'full',()=>{})[1]
  await expect(linked.execute('linked',{skill:'local-writer'})).rejects.toThrow('符号链接');expect(existsSync(join(outside,'skills'))).toBe(false)
 },()=>sse({content:'READY'}))
})
