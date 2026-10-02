import {test,expect} from 'bun:test'
import {Database} from 'bun:sqlite'
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Storage} from '../../core/storage'
test('v4 catalog and history survive v5 with a readable pre-upgrade backup',()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-v5-')),path=join(root,'db');const old=new Database(path)
 old.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY)')
 for(let v=1;v<=4;v++){old.exec(readFileSync(new URL(`../../core/migrations/000${v}.sql`,import.meta.url),'utf8'));old.run('INSERT INTO schema_migrations VALUES(?)',[v])}
 old.run('INSERT INTO catalog VALUES(?,?,?,?)',['kept','agents','Kept','{"id":"kept"}'])
 old.run('INSERT INTO sessions VALUES(?,?,?)',['history','{"id":"history","text":"retained"}',1]);old.close()
 const current=new Storage(path)
 try{
  expect(current.get<{data:string}>('SELECT data FROM catalog')!.data).toBe('{"id":"kept"}')
  expect(current.session<{text:string}>('history')!.text).toBe('retained')
  expect(current.get<{v:number}>('SELECT max(version) v FROM schema_migrations')!.v).toBe(12)
  const backup=new Database(join(root,readdirSync(root).find(n=>n.startsWith('db.before-v5-'))!),{readonly:true})
  try{expect(backup.query('SELECT max(version) v FROM schema_migrations').get()).toEqual({v:4});expect(backup.query('SELECT count(*) n FROM catalog').get()).toEqual({n:1})}finally{backup.close()}
 }finally{current.close();rmSync(root,{recursive:true,force:true})}
})
