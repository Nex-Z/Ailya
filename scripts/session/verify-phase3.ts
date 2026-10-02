import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {strict as assert} from 'node:assert'
const source=JSON.parse(readFileSync(resolve(process.argv[2]??'artifacts/session-candidates/phase3-thinking-default-off.json'),'utf8'))
const controls:Record<string,(candidate:typeof source)=>void>={
 'request-mismatch':x=>{x.prompt+=' changed'},
 'missing-response':x=>{x.calls.pop()},
 'unconsumed-response':x=>{x.calls.push(x.calls[0])},
 'unexpected-side-effect':x=>{x.files['extra.txt']='must not exist'},
 'unknown-version':x=>{x.version=99},
}
if(source.team)controls['member-config-mismatch']=x=>{x.team.worker.prompt+=' changed'}
mkdirSync(resolve('artifacts/phase3-tools/negative'),{recursive:true})
for(const [name,change] of Object.entries(controls)){
 const candidate=structuredClone(source);change(candidate)
 const path=resolve(`artifacts/phase3-tools/negative/${name}.json`);writeFileSync(path,JSON.stringify(candidate))
 const child=Bun.spawn([process.execPath,resolve('scripts/session/phase3.ts'),'replay',path],{stdout:'pipe',stderr:'pipe'})
 const [exit]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
 assert.notEqual(exit,0,`${name} was incorrectly accepted`);console.log('negative control passed:',name)
}
