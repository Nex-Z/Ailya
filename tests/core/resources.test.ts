import {test,expect} from 'bun:test'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Storage} from '../../core/storage'
import {Resources,nextRun,resourceSchema} from '../../core/resources'
import {Scheduler} from '../../core/scheduler'
import {withCore,post,sse,settle} from './helpers'

test('scheduler fires one independent session; completed state follows real Core; restart misses never catch up',async()=>{
 await withCore(async(app,url,workspace)=>{
  app.core.scheduler.close();let now=Date.parse('2030-01-01T00:00:00Z')
  const r=app.core.resources.save({id:crypto.randomUUID(),kind:'task',name:'job',instructions:'hello',enabled:true,workspace,time:'08:01',frequency:'daily',model:'["test","test"]'},now)
  const scheduler=new Scheduler(app.core.storage,app.core.resources,(id,resource,requestId)=>app.core.send(id,{requestId,text:resource.instructions,context:{workspace,agent:'Ailya',model:resource.model,permission:'default'}}),()=>now)
  now+=60000;scheduler.tick();scheduler.tick();await settle(app);scheduler.reconcile()
  const runs=app.core.storage.all<{status:string;session_id:string}>('SELECT * FROM schedule_runs')
  expect(runs).toHaveLength(1);expect(runs[0].status).toBe('completed');expect(app.core.storage.session(runs[0].session_id)).toBeDefined()
  now+=24*3600000;new Scheduler(app.core.storage,app.core.resources,()=>{throw Error('must not run')},()=>now)
  expect(app.core.resources.list().find(x=>x.id===r.id)!.lastRun).toMatchObject({status:'missed'})
  const response=await post(url+'/api/resources',{...r,enabled:false});expect(response.status).toBe(200)
 },()=>sse({content:'scheduled real Core output'}))
})

test('resource persistence keeps disabled prototype settings; invalid enabling rejects; MCP secrets encrypted; backup restores',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-resources-')),db=new Storage(join(root,'db')),resources=new Resources(db,root)
 try{
  const legacy={id:crypto.randomUUID(),kind:'task',name:'old',workspace:'missing folder',agent:'Old Agent',enabled:true}
  resources.importPrototype([legacy]);expect(resources.get(legacy.id)).toMatchObject({workspace:'missing folder',enabled:false})
  expect(()=>resources.save({...resources.get(legacy.id),enabled:true})).toThrow()
  resources.importPrototype([]);const second={...legacy,id:crypto.randomUUID()};resources.importPrototype([second]);expect(resources.get(second.id)).toBeDefined()
  resources.remove(second.id);resources.importPrototype([second]);expect(resources.get(second.id)).toBeUndefined()
  const m=resources.save({id:crypto.randomUUID(),kind:'mcp',name:'echo',command:'bun echo.ts',env:{TOKEN:'private-value'}})
  expect(db.get<{data:string}>('SELECT data FROM resources WHERE id=?',m.id)!.data).not.toContain('private-value')
  db.backup(join(root,'backup'));const restored=new Storage(join(root,'backup'));try{expect(new Resources(restored,root).get(m.id)!.env.TOKEN).toBe('private-value')}finally{restored.close()}
  const r=resourceSchema.parse({id:crypto.randomUUID(),kind:'task',name:'weekly',enabled:true,time:'09:00',frequency:'weekly',weekday:'1',timezone:'Asia/Hong_Kong'})
  expect(new Date(nextRun(r,Date.parse('2030-01-06T00:00:00Z'))!).toISOString()).toBe('2030-01-07T01:00:00.000Z')
 }finally{db.close();rmSync(root,{recursive:true,force:true})}
})
