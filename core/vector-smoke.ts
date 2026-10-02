import {Database} from 'bun:sqlite'
import {dirname,join} from 'node:path'
const db=new Database(':memory:')
try{
 db.loadExtension(join(dirname(process.execPath),'vec0.dll'))
 db.exec('CREATE VIRTUAL TABLE vectors USING vec0(embedding float[2])')
 db.run('INSERT INTO vectors(rowid,embedding) VALUES(1,?),(2,?)',['[1,0]','[0,1]'])
 const nearest=db.query('SELECT rowid,distance FROM vectors WHERE embedding MATCH ? AND k=2 ORDER BY distance').all('[1,0]') as {rowid:number;distance:number}[]
 if(nearest[0].rowid!==1||nearest[1].rowid!==2)throw Error('Incorrect nearest neighbors')
 console.log(JSON.stringify({version:db.query('SELECT vec_version() version').get(),nearest,executable:process.execPath}))
}finally{db.close(true)}
