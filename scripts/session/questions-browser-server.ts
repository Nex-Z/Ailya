// Isolated browser fixture: only the model HTTP boundary is scripted.
import {startServer} from '../../core/server'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {call,sse} from '../../tests/core/helpers'
const root=mkdtempSync(join(tmpdir(),'ailya-question-browser-'))
const provider=Bun.serve({hostname:'127.0.0.1',port:0,fetch:async req=>{
 const body=await req.json(),messages=body.messages as {role:string;content?:unknown;tool_call_id?:string}[]
 if(messages.some(m=>m.tool_call_id==='write-ui'))return sse({content:'BROWSER_DONE'})
 if(messages.some(m=>m.tool_call_id==='ask-ui'))return call('write',{path:'answered.txt',content:'persisted answer'},'write-ui')
 return call('ask_questions',{questions:[
  {id:'color',title:'选择颜色',kind:'choice',options:['红色','蓝色'],recommendedOptions:['蓝色']},
  {id:'checks',title:'执行检查',kind:'multiple',options:['构建','测试']},
  {id:'note',title:'补充内容',kind:'text'},
  {id:'device',title:'设备',kind:'mixed',options:['桌面','手机']},
 ]},'ask-ui')
}})
const app=startServer({dataPath:join(root,'db'),workspace:root,port:4317})
app.core.saveProvider({id:'test',name:'Test',baseUrl:`http://127.0.0.1:${provider.port}`,models:['test']})
console.log('QUESTION_BROWSER_READY')
let closing=false
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{if(closing)return;closing=true;void (async()=>{await app.close();await provider.stop(true);rmSync(root,{recursive:true,force:true});process.exit(0)})()})
