import {test,expect} from 'bun:test'
import {Database} from 'bun:sqlite'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Storage} from '../../core/storage'
import {startServer} from '../../core/server'
import {input,post,call,sse,waitSession} from './helpers'
test('v10 migration preserves skills and history; readable pre-v11 backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-plugin-v11-')),path=join(root,'db'),old=new Database(path)
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
 for(let v=1;v<=10;v++){old.exec(readFileSync(new URL(`../../core/migrations/${String(v).padStart(4,'0')}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[v])}
 old.run('INSERT INTO sessions VALUES(?,?,?)',['s','{"id":"s","title":"kept"}',1]);old.run('INSERT INTO resources VALUES(?,?,?,?,?,?,?)',['r','skill','kept','{}',0,null,1]);old.run('INSERT INTO skill_packages VALUES(?,?,?,?,?,?)',['r',1,'kept','kept',0,'hash']);old.run('INSERT INTO skill_files VALUES(?,?,?)',['r','SKILL.md',Buffer.from('kept')]);old.close()
 const current=new Storage(path)
 try{expect(current.get<{v:number}>('SELECT max(version) v FROM schema_migrations')!.v).toBe(12);expect(current.session<{title:string}>('s')!.title).toBe('kept');expect(new TextDecoder().decode(current.get<{bytes:Uint8Array}>('SELECT bytes FROM skill_files')!.bytes)).toBe('kept');const backup=new Database(join(root,readdirSync(root).find(n=>n.startsWith('db.before-v11-'))!),{readonly:true});try{expect(backup.query('SELECT max(version) v FROM schema_migrations').get()).toEqual({v:10})}finally{backup.close()}}finally{current.close();rmSync(root,{recursive:true,force:true})}
})
test('plugin task version survives update, restart and backup; legacy import stays disabled and does not execute',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-plugin-resume-')),path=join(root,'db'),source=join(root,'source');mkdirSync(source)
 const pluginId=crypto.randomUUID(),body=(mark:string)=>`import {writeFileSync} from 'node:fs';import {join} from 'node:path';export default pi=>pi.registerTool({name:'proof',label:'Proof',description:'write proof',parameters:{type:'object',properties:{}},async execute(id,args,signal,update,ctx){writeFileSync(join(ctx.cwd,'proof.txt'),${JSON.stringify(mark)});return {content:[{type:'text',text:'DONE'}],details:{}}}})`
 writeFileSync(join(source,'index.ts'),body('ORIGINAL'))
 let n=0;const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>++n===1?call('ask_questions',{questions:[{id:'q',kind:'text',title:'继续吗'}]}):n===2?call('plugin_call_tool',{pluginId,name:'proof',arguments:{}}):sse({content:'FINISHED'})})
 let app=startServer({dataPath:path,workspace:root,port:0})
 try{
  app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
  const config={id:pluginId,kind:'本地路径' as const,source,enabled:true};app.core.plugins.importPrototype([config]);app.core.plugins.importPrototype([config]);expect(app.core.plugins.list()).toHaveLength(1);expect(app.core.plugins.list()[0].enabled).toBe(false);expect(app.core.plugins.list()[0].active_version).toBeNull()
  app.core.plugins.start(config);await app.core.plugins.jobs.get(pluginId);expect(app.core.plugins.get(pluginId)!.error).toBeNull();const original=app.core.plugins.get(pluginId)!.active_version
  await post(`http://127.0.0.1:${app.server.port}/api/sessions/restore/send`,{...input('use proof after asking'),context:{...input().context,permission:'full'}});const q=(await waitSession(app,'restore',s=>!!s?.questionRequest)).questionRequest!
  const nextSource=join(root,'new-source');mkdirSync(nextSource);writeFileSync(join(nextSource,'index.ts'),body('NEW'));app.core.plugins.start({...config,source:nextSource},'update');await app.core.plugins.jobs.get(pluginId);expect(app.core.plugins.get(pluginId)!.active_version).not.toBe(original)
  app.core.storage.backup(join(root,'backup'));await app.close();app=startServer({dataPath:join(root,'backup'),workspace:root,port:0})
  await app.core.answerQuestion('restore',q.id,{q:{selected:[],text:'继续'}});await waitSession(app,'restore',s=>s?.messages.at(-1)?.text==='FINISHED'&&!s.messages.at(-1)?.executing)
  expect(readFileSync(join(root,'proof.txt'),'utf8')).toBe('ORIGINAL');expect(app.core.plugins.version(original!).source).toBe(source);expect(app.core.storage.all('SELECT * FROM plugin_versions')).toHaveLength(2)
  app.core.plugins.remove(pluginId);expect(app.core.storage.all('SELECT * FROM plugin_versions')).toHaveLength(1)
  await Promise.all([...app.core.active.values()].map(x=>x.done));expect((await fetch(`http://127.0.0.1:${app.server.port}/api/sessions/restore`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'})).status).toBe(200);expect(app.core.storage.all('SELECT * FROM plugin_versions')).toHaveLength(0);expect(app.core.storage.all('SELECT * FROM plugin_files')).toHaveLength(0)
 }finally{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true})}
},20000)
