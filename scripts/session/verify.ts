import {execute} from './runner'
import {readFileSync} from 'node:fs'
import {strict as assert} from 'node:assert'
const fixture=JSON.parse(readFileSync(process.argv[2]??'artifacts/session-candidates/file-write.json','utf8'))
await execute('replay',fixture)
for(const [name,mutate] of [
 ['request mismatch',(x:any)=>{x.prompt+=' changed'}],
 ['missing response',(x:any)=>{x.calls.pop()}],
 ['unconsumed response',(x:any)=>{x.calls.push(x.calls[0])}],
 ['unexpected workspace',(x:any)=>{x.workspaceExpected['extra.txt']='unexpected'}],
 ['wrong version',(x:any)=>{x.scenarioVersion=2}],
] as const){const candidate=structuredClone(fixture);mutate(candidate);await assert.rejects(()=>execute('replay',candidate));console.log('negative control passed:',name)}
