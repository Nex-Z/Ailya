import {test,expect} from 'bun:test'
import {withCore,post,sse} from './helpers'
import {encodeWave} from '../../src/lib/voice-wave'
test('speech forwards actual WAV and selected model; encrypted key stays in Core; failures are truthful',async()=>{
 let n=0,key='',model='',audio:Uint8Array|undefined
 const service=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
  n++;key=req.headers.get('Authorization')??'';const form=await req.formData();model=String(form.get('model'));audio=new Uint8Array(await (form.get('file') as File).arrayBuffer());return n===1?Response.json({text:'请帮我检查明天的安排'}):new Response('secret upstream debug',{status:401})
 }})
 try{await withCore(async(app,base)=>{
  const audio=encodeWave([new Float32Array(16000).fill(0.1)])
  expect((await post(base+'/api/speech/transcribe',{audio,mime:'audio/wav'})).status).toBe(400);expect(n).toBe(0)
  const saved=await post(base+'/api/speech/config',{baseUrl:`http://127.0.0.1:${service.port}/v1`,model:'test-asr',apiKey:'speech-secret'})
  expect(await saved.json()).toEqual({baseUrl:`http://127.0.0.1:${service.port}/v1`,model:'test-asr',hasKey:true})
  expect(app.core.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='speech-key'")!.value).not.toContain('speech-secret')
  const reply=await post(base+'/api/speech/transcribe',{audio,mime:'audio/wav'});expect(await reply.json()).toEqual({text:'请帮我检查明天的安排'});expect(n).toBe(1)
  const failed=await post(base+'/api/speech/transcribe',{audio,mime:'audio/wav'});expect((await failed.json()).error).toBe('语音识别失败（HTTP 401）')
  expect((await post(base+'/api/speech/config',{baseUrl:'https://other.invalid',model:'test-asr'})).status).toBe(400)
  expect((await post(base+'/api/speech/transcribe',{audio:btoa('invalid wav'),mime:'audio/wav'})).status).toBe(400);expect(n).toBe(2)
  expect(app.core.storage.list()).toEqual([])
 },()=>sse({content:'unused'}));expect(key).toBe('Bearer speech-secret');expect(model).toBe('test-asr');expect(audio?.length).toBe(32044)
 }finally{await service.stop(true)}
},15000)
