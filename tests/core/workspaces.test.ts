import {test,expect} from 'bun:test'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Storage} from '../../core/storage'
import {Workspaces} from '../../core/workspaces'
import {withCore,post,sse} from './helpers'
test('workspace history deduplicates directories, persists across restart and preserves session history',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-workspaces-')),path=join(root,'db'),a=join(root,'alpha'),b=join(root,'beta');mkdirSync(a);mkdirSync(b)
 let db=new Storage(path)
 try{
  db.saveSession({id:'old',context:{workspace:a},messages:[{text:'keep'}]})
  const history=new Workspaces(db,root);history.remember(a);history.remember(join(a,'.'));history.remember(b)
  expect(history.list().filter(x=>x.path===a)).toHaveLength(1)
  expect(history.list().map(x=>x.path)).toContain(b)
  writeFileSync(join(root,'file'),'x');expect(()=>history.remember(join(root,'file'))).toThrow();expect(()=>history.remember(join(root,'missing'))).toThrow()
  db.close();db=new Storage(path);expect(new Workspaces(db,root).list().map(x=>x.path)).toEqual(expect.arrayContaining([a,b,root]));expect(db.session('old')).toMatchObject({messages:[{text:'keep'}]})
 }finally{db.close();rmSync(root,{recursive:true,force:true})}
})
test('workspace selection API validates input and stores the actual selected directory',async()=>{
 await withCore(async(app,url,workspace)=>{
  expect((await post(url+'/api/workspaces/select',{path:workspace})).status).toBe(200)
  expect(await (await fetch(url+'/api/workspaces')).json()).toContainEqual({path:workspace})
  expect((await post(url+'/api/workspaces/select',{path:''})).status).toBe(400)
  expect((await post(url+'/api/workspaces/select',{path:join(workspace,'missing')})).status).toBe(400)
  expect(app.core.storage.all("SELECT key FROM core_settings WHERE key LIKE 'workspace:%'")).toHaveLength(1)
 },()=>sse({content:'unused'}))
})
