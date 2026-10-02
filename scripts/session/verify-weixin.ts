import {readFileSync,writeFileSync,unlinkSync} from 'node:fs'
import {resolve} from 'node:path'
import {strict as assert} from 'node:assert'
const source=resolve(process.argv[2]??'artifacts/session-candidates/weixin-v1.json'),fixture=JSON.parse(readFileSync(source,'utf8'))
const run=async(path:string)=>{const proc=Bun.spawn(['bun','scripts/session/weixin.ts','replay',path],{stdout:'pipe',stderr:'pipe'});const [code,out,err]=await Promise.all([proc.exited,new Response(proc.stdout).text(),new Response(proc.stderr).text()]);return {code,out,err}}
const valid=await run(source);assert.equal(valid.code,0,valid.err)
const controls:[string,(f:typeof fixture)=>void][]=[['format',f=>{f.version=99}],['request',f=>{f.calls[0].request.messages[0].content+=' changed policy'}],['missing',f=>{f.calls.pop()}],['extra',f=>{f.calls.push(f.calls.at(-1))}],['files',f=>{f.files['weixin-receipt.txt']='wrong'}]]
for(const [name,mutate] of controls){const copy=structuredClone(fixture);mutate(copy);const path=resolve('artifacts/session-candidates',`weixin-negative-${name}-${crypto.randomUUID()}.json`);writeFileSync(path,JSON.stringify(copy));try{const result=await run(path);assert.notEqual(result.code,0,`Negative control passed: ${name}`)}finally{unlinkSync(path)}}
console.log(JSON.stringify({replay:true,negativeControls:controls.map(([name])=>name)}))
