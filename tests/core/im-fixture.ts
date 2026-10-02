import {strict as assert} from 'node:assert'
import {IM} from '../../core/im'
import {WeixinApi} from '../../core/weixin-api'
import type {App} from './helpers'
export async function until(predicate:()=>boolean,ms=8000){const end=Date.now()+ms;while(!predicate()){if(Date.now()>end)throw Error('Timed out waiting for IM state');await Bun.sleep(25)}}
export async function imFixture(app:App){
 const queue=new Map<string,unknown[]>(),sent:{token:string;msg:{to_user_id:string;context_token:string;item_list:{text_item:{text:string}}[]}}[]=[],requests:string[]=[];let owner='owner',token='token1',bot='bot1',uncertain=false
 const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){
  const path=new URL(req.url).pathname;requests.push(path)
  if(path.endsWith('get_bot_qrcode'))return Response.json({qrcode:'QR',qrcode_img_content:'https://weixin.qq.com/qr/test'})
  if(path.endsWith('get_qrcode_status'))return Response.json({status:'confirmed',bot_token:token,ilink_bot_id:bot,ilink_user_id:owner,baseurl:'https://ilinkai.weixin.qq.com'})
  const credential=req.headers.get('Authorization')?.replace('Bearer ','')??'',body=await req.json() as Record<string,unknown>
  assert.deepEqual(body.base_info,{channel_version:'2.4.9',bot_agent:'Ailya/0.0.0'})
  if(path.endsWith('getupdates')){const msgs=queue.get(credential)??[];queue.set(credential,[]);return Response.json({ret:0,msgs,get_updates_buf:'cursor:'+credential})}
  if(path.endsWith('sendmessage')){sent.push({token:credential,msg:body.msg as typeof sent[number]['msg']});return uncertain?new Response('ambiguous',{status:502}):Response.json({ret:0})}
  return new Response('',{status:404})
 }})
 const fetcher=((url:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(String(url));return fetch(`http://127.0.0.1:${server.port}`+u.pathname+u.search,init)}) as typeof fetch
 await app.core.im.close();app.core.im=new IM(app.core,new WeixinApi(fetcher))
 return {sent,requests,fetcher,async bind(next='token1',peer='owner',botId='bot1'){
  token=next;owner=peer;bot=botId;const id=crypto.randomUUID();await app.core.im.save({id,platform:'微信',account:'',scope:'仅允许指定用户',enabled:false});await app.core.im.login(id);await until(()=>app.core.im.list().some(a=>a.id===id&&a.login?.status==='confirmed'));return id
 },push(id:string,text:string,peer='owner',credential='token1'){const batch=queue.get(credential)??[];batch.push({message_id:id,from_user_id:peer,message_type:1,message_state:2,context_token:'context:'+peer,item_list:[{type:1,text_item:{text}}]});queue.set(credential,batch)},uncertain(){uncertain=true},async close(){await app.core.im.close();await server.stop(true)}}
}
