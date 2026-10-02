import {openSync,writeFileSync,readFileSync,closeSync,unlinkSync,existsSync,mkdirSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
export function acquireCoreLock(database:string){
 const path=resolve(database)+'.lock';mkdirSync(dirname(path),{recursive:true})
 if(existsSync(path)){
  const pid=Number(readFileSync(path,'utf8'))
  if(!Number.isInteger(pid)||pid<1)throw Error('Core 锁文件无效，请核实原进程后处理')
  let alive=true;try{process.kill(pid,0)}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false}
  if(alive)throw Error('该数据库已有 Core 进程运行')
  unlinkSync(path)
 }
 const fd=openSync(path,'wx');try{writeFileSync(fd,String(process.pid))}finally{closeSync(fd)}
 return ()=>{if(existsSync(path)&&readFileSync(path,'utf8')===String(process.pid))unlinkSync(path)}
}
