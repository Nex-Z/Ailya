import {test,expect} from 'bun:test'
import {withCore,post,input,sse,settle} from './helpers'
import {Core} from '../../core/core'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import type {Session} from '../../core/contracts'

test('explicit model preference survives restart, preserves session context, invalid model cannot overwrite it',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-model-choice-')),path=join(root,'db');let core=new Core(path,root)
 try{
  core.storage.db.run("DELETE FROM providers WHERE id='deepseek'");core.saveProvider({id:'p',name:'P',baseUrl:'http://127.0.0.1:9999',models:['first','chosen']})
  core.storage.saveSession({id:'s',title:'existing',group:'今天',messages:[],context:{model:'["p","first"]',workspace:root,agent:'Ailya',permission:'default'}})
  core.selectModel('["p","chosen"]','s');await core.close();core=new Core(path,root)
  expect(core.preferredModel()).toBe('["p","chosen"]');expect(core.storage.session<Session>('s')!.context.model).toBe('["p","chosen"]')
  expect(()=>core.selectModel('["p","missing"]','s')).toThrow();expect(core.preferredModel()).toBe('["p","chosen"]')
  core.storage.db.run("DELETE FROM providers WHERE id='deepseek'");core.saveProvider({id:'p',name:'P',baseUrl:'http://127.0.0.1:9999',models:['first']});expect(core.preferredModel()).toBe('["p","first"]')
  expect(core.storage.session<Session>('s')!.context.model).toBe('["p","chosen"]')
 }finally{await core.close();rmSync(root,{recursive:true,force:true})}
})

test('API selection drives actual next model request; running task cannot change preference',async()=>{
 let seen=''
 await withCore(async(app,url)=>{
  app.core.saveProvider({...app.core.providers().find(p=>p.id==='test')!,models:['test','chosen']})
  expect((await post(url+'/api/model-selection',{model:'["test","chosen"]'})).status).toBe(200)
  const body=input();body.context.model='默认模型'
  expect((await post(url+'/api/sessions/s/send',body)).status).toBe(202)
  await settle(app);expect(seen).toBe('chosen')
  app.core.active.set('busy',{} as never)
  try{expect((await post(url+'/api/model-selection',{model:'["test","test"]',sessionId:'busy'})).status).toBe(400);expect(app.core.preferredModel()).toBe('["test","chosen"]')}finally{app.core.active.delete('busy')}
  expect((await post(url+'/api/model-selection',{model:'["test","test"]',sessionId:'s'})).status).toBe(200)
  expect(app.core.storage.session<Session>('s')!.context.model).toBe('["test","test"]')
 },async req=>{seen=(await req.json()).model;return sse({content:'chosen response'})})
})
