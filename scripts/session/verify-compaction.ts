import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {strict as assert} from 'node:assert'
const source=resolve(process.argv[2]??'artifacts/session-candidates/compaction-v1.json')
const fixture=JSON.parse(readFileSync(source,'utf8'))
const run=(file:string)=>Bun.spawnSync([process.execPath,resolve('scripts/session/compaction.ts'),'replay',file],{stdout:'pipe',stderr:'pipe',timeout:30000})
const positive=run(source);assert.equal(positive.exitCode,0,positive.stderr.toString())
const directory=resolve('artifacts/compaction-negative');mkdirSync(directory,{recursive:true})
const cases:[string,(f:typeof fixture)=>void][]=[
 ['request-tamper',f=>{f.calls[0].request.model='tampered'}],
 ['missing-summary',f=>{f.calls.splice(f.calls.findIndex((c:{role:string})=>c.role==='compaction'),1)}],
 ['extra-response',f=>{f.calls.push(f.calls.at(-1))}],
 ['wrong-file',f=>{f.files['after.txt']='wrong'}],
 ['wrong-summary',f=>{f.summary='invented'}],
 ['unknown-version',f=>{f.version=999}],
]
for(const [name,mutate] of cases){const value=structuredClone(fixture);mutate(value);const path=join(directory,name+'.json');writeFileSync(path,JSON.stringify(value));const result=run(path);assert.notEqual(result.exitCode,0,`${name} was not detected`);writeFileSync(join(directory,name+'.log'),result.stderr.toString())}
console.log(JSON.stringify({ok:true,positive:true,negativeControls:cases.map(([name])=>name)}))
