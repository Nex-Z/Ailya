import {test,expect} from 'bun:test'
import {mkdtempSync,rmSync,writeFileSync,readFileSync,existsSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {localTools} from '../../core/local-tools'
import type {FileChange} from '../../core/contracts'

test('Pi directory/glob and literal search stay scoped; host shell writes a real tracked file',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-local-')),changes:FileChange[]=[]
 try{
  writeFileSync(join(root,'a.txt'),'first\nNeedle here\n');mkdirSync(join(root,'node_modules'));writeFileSync(join(root,'node_modules','hidden.txt'),'Needle');writeFileSync(join(root,'binary'),Buffer.from([0,255]))
  const tools=localTools(root,'full',async()=>{throw Error('unexpected approval')},c=>changes.push(c))
  const run=(name:string,args:object)=>tools.find(t=>t.name===name)!.execute('call',args as never)
  expect(JSON.stringify(await run('ls',{path:'.'}))).toContain('a.txt')
  expect(JSON.stringify(await run('find',{pattern:'*.txt'}))).toContain('a.txt')
  const result=JSON.stringify(await run('search_files',{query:'needle',ignoreCase:true}))
  expect(result).toContain('Needle here');expect(result).not.toContain('hidden.txt')
  await expect(run('search_files',{query:'x',path:'..'})).rejects.toThrow()
  await expect(run('find',{pattern:'../*'})).rejects.toThrow()
  process.env.AILYA_TEST_SECRET='must-not-inherit'
  await run('powershell',{command:"if ($env:AILYA_TEST_SECRET) { throw 'leaked' }; [IO.File]::WriteAllText((Join-Path $PWD 'proof.txt'), 'shell-proof')"})
  expect(readFileSync(join(root,'proof.txt'),'utf8')).toBe('shell-proof')
  expect(changes.some(c=>c.path.endsWith('proof.txt')&&c.kind==='added'&&c.diff.some(l=>l==='+shell-proof'))).toBe(true)
 }finally{delete process.env.AILYA_TEST_SECRET;rmSync(root,{recursive:true,force:true})}
},15000)

test('shell denial has no effects, cancellation kills its process before late writes',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-shell-stop-'))
 try{
  const denied=localTools(root,'default',async()=>{throw Error('denied')},()=>{}).find(t=>t.name==='powershell')!
  await expect(denied.execute('no',{command:"Set-Content denied.txt no"} as never)).rejects.toThrow('denied')
  expect(existsSync(join(root,'denied.txt'))).toBe(false)
  const shell=localTools(root,'full',async()=>{},()=>{}).find(t=>t.name==='powershell')!,abort=new AbortController()
  writeFileSync(join(root,'child.cjs'),"const fs=require('node:fs');fs.writeFileSync('child.pid',String(process.pid));console.log('READY');setTimeout(()=>fs.writeFileSync('late.txt','BAD'),30000)")
  let readyResolve!:()=>void;const ready=new Promise<void>(r=>readyResolve=r)
  const execution=shell.execute('stop',{command:'& node child.cjs'} as never,abort.signal,update=>{if(JSON.stringify(update).includes('READY'))readyResolve()})
  const timer=setTimeout(()=>abort.abort(),5000)
  try{await Promise.race([ready,new Promise((_,reject)=>abort.signal.addEventListener('abort',()=>reject(Error('readiness timeout')),{once:true}))]);const pid=Number(readFileSync(join(root,'child.pid'),'utf8'));abort.abort();let failed=false;try{await execution}catch{failed=true}expect(failed).toBe(true);expect(()=>process.kill(pid,0)).toThrow();expect(existsSync(join(root,'late.txt'))).toBe(false)}finally{clearTimeout(timer);await execution.catch(()=>{})}
 }finally{rmSync(root,{recursive:true,force:true})}
},15000)
