import {z} from 'zod'
import {randomBytes} from 'node:crypto'
export const WEIXIN_BASE='https://ilinkai.weixin.qq.com'
// Wire format verified against Tencent/openclaw-weixin 2.4.9; implemented independently.
export function weixinBase(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||!['weixin.qq.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('微信返回了不受信任的服务地址');return u.origin}
export class WeixinError extends Error{constructor(public code:number){super(code===-14?'微信登录已失效，请重新扫码':`微信接口错误（${code}）`)}}
const text=z.string().max(100000)
export const updatesSchema=z.object({msgs:z.array(z.object({message_id:z.union([z.string(),z.number().int().safe()]),from_user_id:text,message_type:z.number(),message_state:z.number().optional(),context_token:text.optional(),item_list:z.array(z.object({type:z.number(),text_item:z.object({text}).optional(),voice_item:z.object({text:text.optional()}).passthrough().optional()}).passthrough()).max(100).optional()}).passthrough()).max(1000).default([]),get_updates_buf:text.optional()})
export type WeixinUpdate=z.infer<typeof updatesSchema>['msgs'][number]
export class WeixinApi{
 constructor(private fetcher:typeof fetch=fetch){}
 async request(base:string,path:string,body:unknown|undefined,token:string|undefined,signal:AbortSignal){
  const headers:Record<string,string>={'iLink-App-Id':'bot','iLink-App-ClientVersion':String((2<<16)|(4<<8)|9)}
  if(body!==undefined){headers['Content-Type']='application/json';headers.AuthorizationType='ilink_bot_token';headers['X-WECHAT-UIN']=Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64')}
  if(token)headers.Authorization='Bearer '+token
  let response:Response
  try{response=await this.fetcher(weixinBase(base)+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(token?{...body as object,base_info:{channel_version:'2.4.9',bot_agent:'Ailya/0.0.0'}}:body),signal:AbortSignal.any([signal,AbortSignal.timeout(45000)]),redirect:'error'})}catch{signal.throwIfAborted();throw Error('微信接口网络请求失败')}
  if(!response.ok)throw Error(`微信接口 HTTP ${response.status}`)
  const raw=await response.text();if(raw.length>2_000_000)throw Error('微信响应过大')
  const data=JSON.parse(raw,((key:string,value:unknown,context?:{source:string})=>key==='message_id'&&typeof value==='number'?context?.source??String(value):value) as (key:string,value:unknown)=>unknown) as Record<string,unknown>
  for(const code of [data.ret,data.errcode])if(typeof code==='number'&&code!==0)throw new WeixinError(code)
  return data
 }
 qr(signal:AbortSignal){return this.request(WEIXIN_BASE,'/ilink/bot/get_bot_qrcode?bot_type=3',{local_token_list:[]},undefined,signal).then(v=>z.object({qrcode:z.string().min(1).max(4096),qrcode_img_content:z.string().min(1).max(8192)}).parse(v))}
 status(base:string,qr:string,verify:string,signal:AbortSignal){return this.request(base,'/ilink/bot/get_qrcode_status?qrcode='+encodeURIComponent(qr)+(verify?'&verify_code='+encodeURIComponent(verify):''),undefined,undefined,signal).then(v=>z.object({status:z.string(),bot_token:z.string().optional(),ilink_bot_id:z.string().optional(),ilink_user_id:z.string().optional(),baseurl:z.string().optional(),redirect_host:z.string().optional()}).parse(v))}
 updates(base:string,token:string,cursor:string,signal:AbortSignal){return this.request(base,'/ilink/bot/getupdates',{get_updates_buf:cursor},token,signal).then(v=>updatesSchema.parse(v))}
 async send(base:string,token:string,peer:string,context:string,id:string,value:string,signal:AbortSignal){await this.request(base,'/ilink/bot/sendmessage',{msg:{from_user_id:'',to_user_id:peer,client_id:id,message_type:2,message_state:2,context_token:context,item_list:[{type:1,text_item:{text:value}}]}},token,signal)}
}
