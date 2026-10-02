import {test,expect} from 'bun:test'
import {withCore,input,post,settle,sse,call} from './helpers'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {Database} from 'bun:sqlite'
import {Storage} from '../../core/storage'
import {Catalog} from '../../core/catalog'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
const persona={id:'writer',name:'Writer',model:'默认模型',skills:[],tools:['文件'],prompt:'PERSONA_MARKER: write carefully.'}
test('v3 upgrades to v4 preserving sessions and catalog survives restart',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-catalog-')),path=join(root,'db');const old=new Database(path)
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
 for(let v=1;v<=3;v++){old.exec(readFileSync(new URL(`../../core/migrations/000${v}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[v])}
 old.run('INSERT INTO sessions VALUES(?,?,?)',['preserved',JSON.stringify({id:'preserved',messages:[]}),1]);old.close()
 let db=new Storage(path)
 try{expect(db.session<{id:string;messages:unknown[]}>('preserved')).toEqual({id:'preserved',messages:[]});new Catalog(db).save('agents',persona);db.close();db=new Storage(path);expect(new Catalog(db).list().agents).toEqual([persona])}finally{db.close();rmSync(root,{recursive:true,force:true})}
})
test('catalog persists, imports once, protects references, and agent executes real file tools',async()=>{
 let request=0;const bodies:Record<string,any>[]=[]
 await withCore(async(app,url,workspace)=>{
  expect((await post(url+'/api/catalog/agents',persona)).ok).toBe(true)
  const data=input('write');data.context.agent='Writer';data.context.permission='full'
  expect((await post(url+'/api/sessions/agent/send',data)).status).toBe(202);await settle(app)
  expect(readFileSync(join(workspace,'agent.txt'),'utf8')).toBe('real-agent-file')
  expect(JSON.stringify(bodies[0].messages)).toContain('PERSONA_MARKER')
  const tools=bodies[0].tools.map((t:{function:{name:string}})=>t.function.name)
  expect(tools).toContain('write');expect(tools).not.toContain('powershell');expect(tools).not.toContain('mcp_call_tool')
  app.core.catalog.save('agents',{...persona,name:'Renamed Writer'})
  expect((await post(url+'/api/sessions/agent/send',{...data,requestId:crypto.randomUUID()})).status).toBe(202);await settle(app)
  expect(JSON.stringify(bodies[2].messages)).toContain('Renamed Writer')
  app.core.catalog.save('agents',{...persona,skills:['unsupported']})
  expect((await post(url+'/api/sessions/blocked/send',{...data,requestId:crypto.randomUUID()})).status).toBe(400)
  expect(app.core.storage.session('blocked')).toBeUndefined()
  app.core.catalog.save('agents',persona)
  app.core.catalog.save('groups',{id:'team',name:'Team',coordinator:'writer',members:['writer']})
  expect(()=>app.core.catalog.remove('agents','writer')).toThrow('Group')
  app.core.catalog.import({agents:[persona],groups:[]});app.core.catalog.remove('groups','team');app.core.catalog.remove('agents','writer')
  app.core.catalog.import({agents:[persona],groups:[]});expect(app.core.catalog.list().agents).toHaveLength(0)
 },async req=>{bodies.push(await req.json());return ++request===1?call('write',{path:'agent.txt',content:'real-agent-file'}):sse({content:'done'})})
})
