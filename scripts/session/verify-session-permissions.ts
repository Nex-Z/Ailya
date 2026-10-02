import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {strict as assert} from 'node:assert'
const source=JSON.parse(readFileSync(resolve(process.argv[2]??'artifacts/session-candidates/session-permissions-v1.json'),'utf8'))
const controls:Record<string,(candidate:typeof source)=>void>={
 'request-mismatch':x=>{x.prompts[0]+=' changed'},
 'missing-response':x=>{x.calls.pop()},
 'unconsumed-response':x=>{x.calls.push(x.calls[0])},
 'different-command':x=>{x.calls[0].response=x.calls[0].response.replaceAll('"arguments":" proof"','"arguments":" other"')},
 'wrong-answer':x=>{x.answers[0]='not the recorded answer'},
 'unknown-version':x=>{x.version=99},
}
mkdirSync(resolve('artifacts/session-permissions/negative'),{recursive:true})
for(const [name,change] of Object.entries(controls)){
 const candidate=structuredClone(source);change(candidate)
 assert.notDeepEqual(candidate,source,`${name} did not change the fixture`)
 const path=resolve(`artifacts/session-permissions/negative/${name}.json`);writeFileSync(path,JSON.stringify(candidate))
 const child=Bun.spawn([process.execPath,resolve('scripts/session/session-permissions.ts'),'replay',path],{stdout:'pipe',stderr:'pipe'})
 let timedOut=false;const deadline=setTimeout(()=>{timedOut=true;child.kill()},15000)
 const [exit]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);clearTimeout(deadline)
 assert.equal(timedOut,false,`${name} hung instead of rejecting`);assert.notEqual(exit,0,`${name} was incorrectly accepted`);console.log('negative control passed:',name)
}
