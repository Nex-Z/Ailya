import {test,expect} from 'bun:test'
import {withCore,post,call,sse,input,settle,waitSession} from './helpers'
test('model-created schedule requires approval, persists context, and send retry does not duplicate it',async()=>{
 let calls=0
 await withCore(async(app,url,workspace)=>{
  const body=input('create one schedule')
  expect((await post(url+'/api/sessions/schedule/send',body)).status).toBe(202)
  const pending=await waitSession(app,'schedule',s=>!!s?.permissionRequest)
  expect(pending.permissionRequest!.tool).toBe('schedule_task');expect(app.core.resources.list()).toHaveLength(0)
  expect((await post(url+'/api/sessions/schedule/permissions/'+pending.permissionRequest!.id,{allow:true})).status).toBe(200)
  await settle(app)
  const resources=app.core.resources.list();expect(resources).toHaveLength(1);expect(resources[0]).toMatchObject({kind:'task',workspace,model:'["test","test"]',permission:'default',sourceSession:'schedule',enabled:true})
  expect((await post(url+'/api/sessions/schedule/send',body)).status).toBe(202);expect(app.core.resources.list()).toHaveLength(1)
 },()=>++calls===1?call('schedule_task',{action:'create',name:'isolated future job',instructions:'reply scheduled',frequency:'once',date:'2030-01-01',time:'09:00',timezone:'Asia/Hong_Kong'}):sse({content:'DONE'}))
})
