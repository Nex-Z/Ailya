import { useEffect, useRef, useState } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { useProviders,type Provider } from '../providers'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { MultiSelect } from './ui/multi-select'
import { Dialog,DialogContent,DialogTitle,DialogFooter } from './ui/dialog'
import { AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogFooter,AlertDialogCancel } from './ui/alert-dialog'
const keys=new Map<string,string>()
export function ModelSettings(){
 const {items,save,remove}=useProviders();const [form,setForm]=useState<Provider|null>(null);const [key,setKey]=useState('');const [manual,setManual]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(false);const [deleting,setDeleting]=useState<Provider|null>(null)
 const controller=useRef<AbortController|null>(null)
 useEffect(()=>()=>controller.current?.abort(),[])
 const edit=(p:Provider)=>{setForm({...p});setKey(keys.get(p.id)??'');setMessage('');setManual('')}
 const close=()=>{controller.current?.abort();controller.current=null;setLoading(false);setForm(null)}
 const fetchModels=async()=>{
  if(!form)return
  let url:URL
  try{url=new URL(form.baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error()}catch{setMessage('请输入有效的接口地址');return}
  url.pathname=url.pathname.replace(/\/+$/,'')+'/models'
  const request=new AbortController();controller.current=request;setLoading(true);setMessage('')
  const timer=setTimeout(()=>request.abort(),15000)
  try{
   const response=await fetch(url,{headers:key?{Authorization:`Bearer ${key}`}:{},signal:request.signal,credentials:'omit',redirect:'error'})
   if(!response.ok)throw Error(`拉取失败（HTTP ${response.status}）`)
   const body=await response.json()
   if(!Array.isArray(body.data))throw Error('模型列表格式不正确')
   const ids=[...new Set<string>(body.data.filter((x:unknown):x is {id:string}=>!!x&&typeof x==='object'&&'id' in x&&typeof x.id==='string'&&!!x.id.trim()).map((x:{id:string})=>x.id))]
   if(controller.current!==request)return
   setForm(p=>p?{...p,availableModels:[...new Set([...ids,...p.models])]}:p);setMessage(`已获取 ${ids.length} 个模型`)
  }catch(error){if(controller.current===request)setMessage(error instanceof TypeError?'无法连接，请检查地址及浏览器跨域限制':error instanceof Error&&error.name==='AbortError'?'请求超时，请重试':error instanceof Error?error.message:'拉取失败')}
  finally{clearTimeout(timer);if(controller.current===request){setLoading(false);controller.current=null}}
 }
 return <div className="space-y-4"><div className="flex justify-end"><Button size="sm" onClick={()=>edit({id:crypto.randomUUID(),name:'',baseUrl:'',models:[]})}><Plus/>添加厂商</Button></div>
 {items.map(p=><div key={p.id} className="rounded-lg border p-4"><div className="flex items-center gap-2"><h3 className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</h3><Button variant="ghost" size="icon" aria-label={`编辑 ${p.name}`} onClick={()=>edit(p)}><Pencil className="size-4"/></Button><Button variant="ghost" size="icon" aria-label={`删除 ${p.name}`} onClick={()=>setDeleting(p)}><Trash2 className="size-4"/></Button></div><p className="mt-1 break-all text-xs text-muted-foreground">{p.baseUrl}</p><div className="mt-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">已选 {p.models.length} 个模型</span><Button variant="outline" size="sm" onClick={()=>edit(p)}>选择模型</Button></div></div>)}
 <Dialog open={!!form} onOpenChange={v=>{if(!v)close()}}><DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto"><DialogTitle>{items.some(p=>p.id===form?.id)?'编辑厂商':'添加厂商'}</DialogTitle>{form&&<><label className="space-y-2 text-sm">厂商名称<Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="space-y-2 text-sm">Base URL<Input disabled={loading} placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={e=>setForm({...form,baseUrl:e.target.value})}/></label><label className="space-y-2 text-sm">API Key<Input disabled={loading} type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></label><Button variant="outline" disabled={loading} onClick={fetchModels}>{loading?'正在拉取…':'拉取模型'}</Button><MultiSelect label="模型" value={form.models} options={[...new Set([...(form.availableModels??[]),...form.models])]} onChange={models=>setForm({...form,models})}/><div className="flex gap-2"><Input aria-label="模型 ID" placeholder="模型 ID" value={manual} onChange={e=>setManual(e.target.value)}/><Button variant="outline" disabled={!manual.trim()} onClick={()=>{const id=manual.trim();setForm({...form,models:[...new Set([...form.models,id])],availableModels:[...new Set([...(form.availableModels??[]),id])]});setManual('')}}>添加</Button></div>{message&&<p role="status" className="text-sm">{message}</p>}<DialogFooter><Button variant="outline" onClick={close}>取消</Button><Button disabled={loading} onClick={()=>{try{const url=new URL(form.baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();if(!form.name.trim()){setMessage('请填写厂商名称');return}save({...form,name:form.name.trim(),baseUrl:form.baseUrl.trim()});if(key)keys.set(form.id,key);else keys.delete(form.id);close()}catch{setMessage('请输入有效的接口地址')}}}>保存厂商</Button></DialogFooter></>}</DialogContent></Dialog>
 <AlertDialog open={!!deleting} onOpenChange={v=>{if(!v)setDeleting(null)}}><AlertDialogContent aria-describedby={undefined}><AlertDialogTitle>删除 {deleting?.name}？</AlertDialogTitle><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><Button onClick={()=>{if(deleting){remove(deleting.id);keys.delete(deleting.id)}setDeleting(null)}}>删除</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>
}
