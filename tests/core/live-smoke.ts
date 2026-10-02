import {startServer} from '../../core/server'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=mkdtempSync(join(tmpdir(),'ailya-live-'))
const app=startServer({dataPath:join(root,'db.sqlite'),workspace:root,port:0})
try{
 const url=`http://127.0.0.1:${app.server.port}`
 const r=await fetch(url+'/api/sessions/live/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),text:'请只回复：Ailya Core 已连接。',context:{workspace:'Ailya',agent:'Ailya',model:'默认模型',permission:'default'}})})
 console.log(r.status,await r.json())
 await Promise.all([...app.core.active.values()].map(r=>r.done))
 console.log(JSON.stringify(app.core.storage.list()))
 console.log('requests',app.core.storage.get('SELECT count(*) n FROM requests'))
}finally{await app.close();rmSync(root,{recursive:true,force:true})}
