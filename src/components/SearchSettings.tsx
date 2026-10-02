import {useEffect,useState} from 'react'
import {api} from '../lib/core-api'
import {Input} from './ui/input'
import {Button} from './ui/button'
export function SearchSettings(){
 const [key,setKey]=useState(''),[hasKey,setHasKey]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{void api<{hasKey:boolean}>('/search/config').then(r=>setHasKey(r.hasKey)).catch(e=>setMessage(e.message))},[])
 return <section className="mt-6 border-t pt-5"><h3 className="mb-4 text-sm font-medium">联网搜索 · Tavily</h3><label className="block space-y-2 text-sm"><span>API Key</span><Input type="password" aria-label="Tavily API Key" autoComplete="off" placeholder={hasKey?'已配置':'tvly-…'} value={key} onChange={e=>setKey(e.target.value)}/></label><div className="mt-3 flex gap-2"><Button size="sm" disabled={busy||!key} onClick={async()=>{setBusy(true);try{const result=await api<{hasKey:boolean}>('/search/config',{apiKey:key});setHasKey(result.hasKey);setKey('');setMessage('已保存')}catch(e){setMessage(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}}}>保存搜索配置</Button><Button size="sm" variant="outline" disabled={busy||!hasKey} onClick={async()=>{setBusy(true);try{const results=await api<unknown[]>('/search/test',{query:'TypeScript official documentation'});setMessage(`连接成功，返回 ${results.length} 条结果`)}catch(e){setMessage(e instanceof Error?e.message:'测试失败')}finally{setBusy(false)}}}>测试搜索</Button></div>{message&&<p role="status" className="mt-3 text-sm">{message}</p>}</section>
}
