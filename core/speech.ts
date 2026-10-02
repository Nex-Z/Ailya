import {z} from 'zod'
import type {Storage} from './storage'
import {encryptSecret,decryptSecret} from './secrets'
const speechConfig=z.object({baseUrl:z.string().url().refine(v=>{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash}),model:z.string().trim().min(1).max(200),apiKey:z.string().max(10000).optional()}).strict()
export const audioInput=z.object({audio:z.string().min(1).max(8_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),mime:z.literal('audio/wav')}).strict()
export class Speech{
 constructor(private storage:Storage){}
 config(){const r=this.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='speech-config'");return {...r?JSON.parse(r.value):{baseUrl:'',model:''},hasKey:!!this.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='speech-key'")?.value}}
 save(input:unknown){const {apiKey,...config}=speechConfig.parse(input),old=this.config();if(old.hasKey&&old.baseUrl!==config.baseUrl&&apiKey===undefined)throw Error('更换地址时请重新填写凭据');this.storage.db.transaction(()=>{this.storage.db.run("INSERT INTO core_settings VALUES('speech-config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify(config)]);if(apiKey!==undefined)this.storage.db.run("INSERT INTO core_settings VALUES('speech-key',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[apiKey?encryptSecret(apiKey):''])})();return this.config()}
 async transcribe(input:unknown,signal:AbortSignal){
  const body=audioInput.parse(input),bytes=Buffer.from(body.audio,'base64')
  // Browser records 16 kHz mono PCM WAV. Validate structure, size and duration before forwarding.
  if(bytes.length<48||bytes.length>4_000_000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'||bytes.toString('ascii',12,16)!=='fmt '||bytes.readUInt32LE(16)!==16||bytes.readUInt16LE(20)!==1||bytes.readUInt16LE(22)!==1||bytes.readUInt32LE(24)!==16000||bytes.readUInt16LE(34)!==16||bytes.toString('ascii',36,40)!=='data'||bytes.readUInt32LE(40)!==bytes.length-44||(bytes.length-44)%2||bytes.readUInt32LE(4)!==bytes.length-8||bytes.readUInt32LE(28)!==32000||bytes.readUInt16LE(32)!==2)throw Error('录音格式无效或超过两分钟')
  if((bytes.length-44)/32000>120)throw Error('录音不能超过两分钟')
  const config=this.config();if(!config.baseUrl||!config.model)throw Error('请先在设置 → 模型与连接配置语音识别')
  const secret=this.storage.get<{value:string}>("SELECT value FROM core_settings WHERE key='speech-key'")?.value,key=secret?decryptSecret(secret):''
  const data=new FormData();data.set('model',config.model);data.set('file',new File([bytes],'recording.wav',{type:'audio/wav'}));data.set('response_format','json')
  let response:Response
  try{response=await fetch(config.baseUrl.replace(/\/+$/,'')+'/audio/transcriptions',{method:'POST',headers:key?{Authorization:'Bearer '+key}:{},body:data,signal:AbortSignal.any([signal,AbortSignal.timeout(60000)]),redirect:'error'})}catch{signal.throwIfAborted();throw Error('语音识别服务连接失败或超时')}
  if(!response.ok)throw Error(`语音识别失败（HTTP ${response.status}）`)
  const text=await response.text();if(text.length>100000)throw Error('识别结果过大')
  const result=z.object({text:z.string().max(50000)}).parse(JSON.parse(text));if(!result.text.trim())throw Error('未识别到语音，请重试');return result
 }
}
