import {useEffect,useState} from 'react'
import {api} from '../lib/core-api'
import {Input} from './ui/input'
import {Button} from './ui/button'
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select'
export type IMConfig={id:string;platform:string;account:string;enabled:boolean;scope:string}
type Account=IMConfig&{botId:string|null;ownerId:string|null;status:string;error:string|null;deliveryIssues:number;login?:{image?:string;status:string;error?:string}}
const labels:Record<string,string>={unbound:'未绑定',disabled:'已停用',connected:'已连接',error:'连接失败',loading:'获取二维码',wait:'等待扫码',scaned:'已扫码，请在微信确认',confirmed:'绑定成功',expired:'二维码已过期',need_verifycode:'请输入微信显示的验证码',verify_code_blocked:'验证次数过多，请重新扫码',binded_redirect:'微信已绑定，请重新连接'}
function AccountCard({item,refresh}:{item:Account;refresh:()=>Promise<void>}){
 const [account,setAccount]=useState(item.account),[scope,setScope]=useState(item.scope),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const action=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const save=(enabled=item.enabled)=>api('/im',{id:item.id,platform:'微信',account,scope,enabled})
 return <section className="space-y-4 rounded-lg border p-4" aria-label="微信配置"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm">微信 · {labels[item.status]??item.status}</span><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void action(()=>api('/im/'+item.id,{},'DELETE'))}>移除</Button></div>
 <Button variant="outline" disabled={busy} onClick={()=>void action(async()=>{await save(false);await api('/im/'+item.id+'/login',{})})}>{item.botId?'重新扫码':'扫码绑定'}</Button>
 {item.login&&item.login.status!=='confirmed'&&<div role="status" className="space-y-2 text-sm">{item.login.image&&<img src={item.login.image} alt="微信绑定二维码" className="h-auto w-60 max-w-full"/>}<p>{labels[item.login.status]??'正在验证'}</p>{item.login.status==='need_verifycode'&&<div className="flex flex-wrap gap-2"><Input aria-label="微信验证码" value={code} onChange={e=>setCode(e.target.value)}/><Button disabled={busy} onClick={()=>void action(()=>api('/im/'+item.id+'/verify',{code}))}>验证</Button></div>}{item.login.error&&<p className="text-destructive">{item.login.error}</p>}</div>}
 <label className="block text-sm">允许的用户 ID<Input aria-label="允许的用户 ID" value={account} onChange={e=>setAccount(e.target.value)}/></label>
 <Select value={scope} onValueChange={setScope}><SelectTrigger aria-label="访问范围"><SelectValue/></SelectTrigger><SelectContent>{['仅允许指定用户','仅允许私聊'].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
 <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void action(()=>save())}>保存</Button><Button size="sm" variant="outline" disabled={busy||!item.botId} onClick={()=>void action(()=>save(!item.enabled))}>{item.enabled?'停用':'启用'}</Button></div>
 {(error||item.error)&&<p role="alert" className="break-words text-sm text-destructive">{error||item.error}</p>}{item.deliveryIssues>0&&<p role="status" className="text-sm text-destructive">{item.deliveryIssues} 条回复未确认送达，请在 Ailya 会话查看结果。</p>}
 </section>
}
export function IMSettings(){
 const [items,setItems]=useState<Account[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const load=async()=>{setItems(await api<Account[]>('/im'))}
 useEffect(()=>{let live=true;const refresh=()=>void api<Account[]>('/im').then(v=>{if(live){setItems(v);setError('')}}).catch(e=>{if(live)setError(e.message)});refresh();const timer=setInterval(refresh,1500);return()=>{live=false;clearInterval(timer)}},[])
 return <div className="space-y-4"><Button variant="outline" size="sm" disabled={busy} onClick={()=>{setBusy(true);void api('/im',{id:crypto.randomUUID(),platform:'微信',account:'',scope:'仅允许指定用户',enabled:false}).then(load).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}>添加 IM</Button>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{items.map(item=><AccountCard key={JSON.stringify([item.id,item.account,item.scope])} item={item} refresh={load}/>)}</div>
}
