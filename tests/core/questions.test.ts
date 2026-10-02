import {test,expect} from 'bun:test'
import {withCore,input,post,settle,call,sse,waitSession} from './helpers'
import {readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import type {Session} from '../../core/contracts'
import type {QuestionRequest} from '../../core/question-contracts'
const batch={questions:[
 {id:'color',title:'选择颜色',kind:'choice',options:['红色','蓝色'],recommendedOptions:['蓝色']},
 {id:'checks',title:'执行检查',kind:'multiple',options:['构建','测试']},
 {id:'note',title:'补充内容',kind:'text'},
 {id:'device',title:'设备',kind:'mixed',options:['桌面','手机']},
]}
const answers={color:{selected:['红色'],text:''},checks:{selected:['构建','测试'],text:''},note:{selected:[],text:'保留数据'},device:{selected:['手机'],text:'390px'}}
const endpoint=(url:string,q:QuestionRequest,action:string)=>`${url}/api/sessions/questions/questions/${q.id}/${action}`
test('questions are persisted, scoped, share a fixed deadline, validate complete answers, and continue the same live task once',async()=>{
 let calls=0
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/questions/send',input())
  const q=(await waitSession(app,'questions',s=>!!s?.questionRequest)).questionRequest!
  const initial=app.core.storage.get<{id:string;started_at:number}>('SELECT id,started_at FROM tasks')!
  expect(q.deadlineAt-q.createdAt).toBe(30000);expect(q.drafts).toEqual({})
  expect((await post(endpoint(url,q,'answer'),{answers:{}})).status).toBe(400)
  expect((await post(endpoint(url,q,'answer'),{answers:{...answers,color:{selected:['无效'],text:''}}})).status).toBe(400)
  expect((await post(url+`/api/sessions/other/questions/${q.id}/answer`,{answers})).status).toBe(400)
  const saved=await post(endpoint(url,q,'draft'),{answers:{color:answers.color},revision:0});expect(saved.status).toBe(200)
  expect((await saved.json()).deadlineAt).toBe(q.deadlineAt)
  expect((await post(endpoint(url,q,'draft'),{answers:{},revision:0})).status).toBe(400)
  const snapshot=await(await fetch(url+'/api/snapshot')).json();expect(snapshot.sessions[0].questionRequest.drafts.color).toEqual(answers.color)
  expect((await post(endpoint(url,q,'answer'),{answers})).status).toBe(200)
  await settle(app)
  expect((await post(endpoint(url,q,'answer'),{answers})).status).toBe(200)
  expect(calls).toBe(2);expect(app.core.storage.all('SELECT * FROM tasks')).toHaveLength(1)
  expect(app.core.storage.get<{id:string;started_at:number}>('SELECT id,started_at FROM tasks')).toEqual(initial)
  const session=app.core.storage.session<Session>('questions')!;expect(session.questionRequest).toBeUndefined();expect(session.messages.at(-1)?.text).toBe('ANSWER_OK')
 },async req=>{const body=await req.json();if(++calls===1)return call('ask_questions',batch,'question-call');expect(JSON.stringify(body.messages)).toContain('保留数据');return sse({content:'ANSWER_OK'})})
})
test('timeout stops execution; late and duplicate submission resume checkpoint without repeating the completed write',async()=>{
 let calls=0
 await withCore(async(app,url,workspace)=>{
  const data=input();data.context.permission='full';await post(url+'/api/sessions/questions/send',data)
  const q=(await waitSession(app,'questions',s=>!!s?.questionRequest)).questionRequest!
  const task=app.core.storage.get<{id:string;started_at:number}>('SELECT id,started_at FROM tasks')!
  app.core.questions.expire(q.id,q.deadlineAt-1);expect(app.core.questions.get(q.id).q.status).toBe('pending')
  app.core.questions.expire(q.id,q.deadlineAt);await settle(app)
  expect(app.core.storage.get<{status:string}>('SELECT status FROM tasks')?.status).toBe('stopped')
  expect(calls).toBe(2);expect(readFileSync(join(workspace,'before.txt'),'utf8')).toBe('once')
  expect(existsSync(join(workspace,'after.txt'))).toBe(false)
  expect((await post(url+'/api/sessions/questions/send',input('new'))).status).toBe(400)
  const responses=await Promise.all([post(endpoint(url,q,'answer'),{answers}),post(endpoint(url,q,'answer'),{answers})]);expect(responses.map(r=>r.status)).toEqual([200,200])
  await waitSession(app,'questions',s=>s?.messages.at(-1)?.text==='DONE'&&!s.messages.at(-1)?.executing)
  expect(calls).toBe(4);expect(readFileSync(join(workspace,'after.txt'),'utf8')).toBe('answered')
  expect(app.core.storage.get<{id:string;started_at:number}>('SELECT id,started_at FROM tasks')).toEqual(task)
  const writeEvents=app.core.storage.all<{data:string}>("SELECT data FROM events WHERE kind='pi.tool_execution_start'").map(e=>JSON.parse(e.data)).filter(e=>e.toolName==='write')
  expect(writeEvents.map(e=>e.args.path)).toEqual(['before.txt','after.txt'])
 },async req=>{const body=await req.json();calls++;if(calls===1)return call('write',{path:'before.txt',content:'once'},'before');if(calls===2)return call('ask_questions',batch,'ask');if(calls===3){expect(JSON.stringify(body.messages)).toContain('保留数据');expect(body.messages.filter((m:{tool_call_id?:string})=>m.tool_call_id==='before')).toHaveLength(1);return call('write',{path:'after.txt',content:'answered'},'after')}return sse({content:'DONE'})})
})
test('refusal and explicit stop invalidate late answers and leave no later writes',async()=>{
 for(const refuse of [true,false]){let calls=0
  await withCore(async(app,url,workspace)=>{
   await post(url+'/api/sessions/questions/send',input());const q=(await waitSession(app,'questions',s=>!!s?.questionRequest)).questionRequest!
   const response=refuse?await post(endpoint(url,q,'refuse'),{}):await post(url+'/api/sessions/questions/stop',{})
   expect(response.status).toBe(200);await settle(app)
   expect(app.core.storage.session<Session>('questions')?.questionRequest).toBeUndefined()
   expect((await post(endpoint(url,q,'answer'),{answers})).status).toBe(400)
   expect(calls).toBe(1);expect(existsSync(join(workspace,'never.txt'))).toBe(false)
  },()=>++calls===1?call('ask_questions',batch):call('write',{path:'never.txt',content:'never'}))
 }
})
test('duplicate answers to an older batch cannot bypass a later timed out question',async()=>{
 let calls=0
 await withCore(async(app,url)=>{
  await post(url+'/api/sessions/questions/send',input())
  const first=(await waitSession(app,'questions',s=>!!s?.questionRequest)).questionRequest!
  await post(endpoint(url,first,'answer'),{answers})
  const second=(await waitSession(app,'questions',s=>!!s?.questionRequest&&s.questionRequest.id!==first.id)).questionRequest!
  app.core.questions.expire(second.id,second.deadlineAt);await settle(app)
  expect((await post(endpoint(url,first,'answer'),{answers})).status).toBe(200)
  expect(calls).toBe(2);expect(app.core.storage.session<Session>('questions')?.questionRequest?.id).toBe(second.id)
  await post(endpoint(url,second,'answer'),{answers})
  await waitSession(app,'questions',s=>s?.messages.at(-1)?.text==='TWO_DONE'&&!s.messages.at(-1)?.executing)
  expect(calls).toBe(3)
 },()=>++calls<=2?call('ask_questions',batch,'question-'+calls):sse({content:'TWO_DONE'}))
})
test('continuation retains the current task permission even when the preceding turn used full permission',async()=>{
 let calls=0
 await withCore(async(app,url,workspace)=>{
  const first=input('first');first.context.permission='full';await post(url+'/api/sessions/questions/send',first);await settle(app)
  await post(url+'/api/sessions/questions/send',input('second'))
  const q=(await waitSession(app,'questions',s=>!!s?.questionRequest)).questionRequest!
  app.core.questions.expire(q.id,q.deadlineAt);await settle(app)
  await post(endpoint(url,q,'answer'),{answers})
  const waiting=await waitSession(app,'questions',s=>!!s?.permissionRequest)
  expect(waiting.context.permission).toBe('default');expect(existsSync(join(workspace,'approved.txt'))).toBe(false)
  await post(url+`/api/sessions/questions/permissions/${waiting.permissionRequest!.id}`,{allow:true})
  await waitSession(app,'questions',s=>s?.messages.at(-1)?.text==='APPROVED'&&!s.messages.at(-1)?.executing)
  expect(readFileSync(join(workspace,'approved.txt'),'utf8')).toBe('approved')
 },()=>{calls++;if(calls===1)return sse({content:'FIRST'});if(calls===2)return call('ask_questions',batch,'ask');if(calls===3)return call('write',{path:'approved.txt',content:'approved'},'write');return sse({content:'APPROVED'})})
})
test('Group member questions route to parent; repeated timeout and immediate late answer resume child then original parent',async()=>{
 let parent=0,worker=0
 await withCore(async(app,url,workspace)=>{
  app.core.catalog.save('agents',{id:'lead',name:'Lead',model:'默认模型',skills:[],tools:[],prompt:'LEAD'})
  app.core.catalog.save('agents',{id:'worker',name:'Worker',model:'默认模型',skills:[],tools:['文件'],prompt:'WORKER'})
  app.core.catalog.save('groups',{id:'team',name:'Team',coordinator:'lead',members:['worker']})
  const data=input();data.context.agent='Team'
  await post(url+'/api/sessions/questions/send',data)
  const q=(await waitSession(app,'questions',s=>!!s?.questionRequest)).questionRequest!
  expect(q.agent).toBe('Worker');app.core.questions.expire(q.id,q.deadlineAt);await settle(app)
  expect(app.core.storage.all<{status:string}>('SELECT status FROM tasks').map(r=>r.status)).toEqual(['stopped','stopped'])
  expect((await post(endpoint(url,q,'answer'),{answers})).status).toBe(200)
  const next=(await waitSession(app,'questions',s=>!!s?.questionRequest&&s.questionRequest.id!==q.id)).questionRequest!
  app.core.questions.expire(next.id,next.deadlineAt)
  expect((await post(endpoint(url,next,'answer'),{answers})).status).toBe(200)
  const permission=await waitSession(app,'questions',s=>!!s?.permissionRequest)
  expect(permission.messages.at(-1)?.executing).toBe(true)
  expect((await post(url+'/api/model-selection',{sessionId:'questions',model:'["test","test"]'})).status).toBe(400)
  await post(url+`/api/sessions/questions/permissions/${permission.permissionRequest!.id}`,{allow:true})
  const result=await waitSession(app,'questions',s=>s?.messages.at(-1)?.text==='TEAM_DONE'&&!s.messages.at(-1)?.executing)
  expect(readFileSync(join(workspace,'child.txt'),'utf8')).toBe('child answer')
  expect(parent).toBe(2);expect(worker).toBe(4);expect(app.core.storage.all('SELECT * FROM tasks')).toHaveLength(2)
  expect(app.core.storage.all<{status:string}>('SELECT status FROM tasks').every(r=>r.status==='completed')).toBe(true)
  expect(result.messages.at(-1)?.fileChanges?.[0].path).toContain('child.txt')
 },async req=>{const body=await req.json();if(JSON.stringify(body.messages).includes('WORKER')){worker++;if(worker<=2)return call('ask_questions',batch,'ask-child-'+worker);if(worker===3)return call('write',{path:'child.txt',content:'child answer'},'child-write');return sse({content:'CHILD_DONE'})}return ++parent===1?call('delegate_agent',{agent:'worker',task:'WORK'},'delegate'):sse({content:'TEAM_DONE'})})
})
test('main-session stop cancels a resumed member waiting for permission and leaves both tasks stopped',async()=>{
 let parent=0,worker=0
 await withCore(async(app,url,workspace)=>{
  app.core.catalog.save('agents',{id:'lead',name:'Lead',model:'默认模型',skills:[],tools:[],prompt:'LEAD'})
  app.core.catalog.save('agents',{id:'worker',name:'Worker',model:'默认模型',skills:[],tools:['文件'],prompt:'WORKER'})
  app.core.catalog.save('groups',{id:'team',name:'Team',coordinator:'lead',members:['worker']})
  const data=input();data.context.agent='Team';await post(url+'/api/sessions/questions/send',data)
  const q=(await waitSession(app,'questions',s=>!!s?.questionRequest)).questionRequest!
  app.core.questions.expire(q.id,q.deadlineAt);await settle(app)
  await post(endpoint(url,q,'answer'),{answers})
  const waiting=await waitSession(app,'questions',s=>!!s?.permissionRequest)
  expect(waiting.messages.at(-1)?.executing).toBe(true)
  await post(url+'/api/sessions/questions/stop',{});await settle(app)
  expect(app.core.storage.all<{status:string}>('SELECT status FROM tasks').map(t=>t.status)).toEqual(['stopped','stopped'])
  expect(app.core.storage.session<Session>('questions')?.messages.at(-1)?.executing).toBe(false)
  expect(existsSync(join(workspace,'never.txt'))).toBe(false);expect(parent).toBe(1)
 },async req=>{const body=await req.json();if(JSON.stringify(body.messages).includes('WORKER'))return ++worker===1?call('ask_questions',batch):call('write',{path:'never.txt',content:'never'});parent++;return call('delegate_agent',{agent:'worker',task:'work'})})
})
