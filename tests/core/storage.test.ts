import {test,expect} from 'bun:test'
import {Storage} from '../../core/storage'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
test('SQLite migration, scoped vector ranking, update/delete, restart and consistent backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-storage-')),path=join(root,'db.sqlite');let db=new Storage(path)
 try{
  db.saveSession({id:'session',title:'preserved'})
  for(const item of [{id:'a',scope:'allowed',embedding:[1,0]},{id:'b',scope:'allowed',embedding:[0,1]},{id:'secret',scope:'other',embedding:[1,0]}])db.vector({...item,model:'embedding',revision:'1',content:item.id})
  expect((db.search('allowed','embedding','1',[1,0]) as {id:string}[]).map(x=>x.id)).toEqual(['a','b'])
  expect(()=>db.search('allowed','embedding','1',[1,0,0])).toThrow('维度')
  db.vector({id:'a',scope:'allowed',embedding:[-1,0],model:'embedding',revision:'1',content:'updated'})
  expect((db.search('allowed','embedding','1',[1,0]) as {id:string}[])[0].id).toBe('b')
  db.db.run('DELETE FROM vector_sources WHERE id=?',['a'])
  db.backup(join(root,'backup.sqlite'));db.close();db=new Storage(path)
  expect(db.session<{id:string;title:string}>('session')).toEqual({id:'session',title:'preserved'})
  expect(db.search('allowed','embedding','1',[1,0])).toHaveLength(1)
  const backup=new Storage(join(root,'backup.sqlite'));try{expect(backup.search('allowed','embedding','1',[1,0])).toEqual(db.search('allowed','embedding','1',[1,0]))}finally{backup.close()}
  expect(()=>new Storage(join(root,'missing.sqlite'),'not-a-real-extension.dll')).toThrow()
 }finally{db.close();rmSync(root,{recursive:true,force:true})}
})

