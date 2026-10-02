import {useEffect,useState} from 'react'
import {api} from '../lib/core-api'
import {Input} from './ui/input'
import {Button} from './ui/button'
export function SpeechSettings(){
 const [baseUrl,setUrl]=useState(''),[model,setModel]=useState(''),[key,setKey]=useState(''),[hasKey,setHasKey]=useState(false),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 useEffect(()=>{void api<{baseUrl:string;model:string;hasKey:boolean}>('/speech/config').then(c=>{setUrl(c.baseUrl);setModel(c.model);setHasKey(c.hasKey);setReady(true)}).catch(e=>setMessage(e.message))},[])
 return <section className="mt-6 space-y-3 border-t pt-5" aria-label="语音识别配置"><h3 className="text-sm font-medium">语音识别</h3><Input aria-label="语音服务地址" placeholder="服务地址，例如 https://服务商/v1" value={baseUrl} onChange={e=>setUrl(e.target.value)}/><Input aria-label="语音模型" placeholder="模型名称" value={model} onChange={e=>setModel(e.target.value)}/><Input type="password" aria-label="语音 API Key" placeholder={hasKey?'已保存，留空保留':'API Key（本地免密服务可留空）'} value={key} onChange={e=>setKey(e.target.value)}/><Button size="sm" disabled={!ready||busy||!baseUrl||!model} onClick={()=>{setBusy(true);setMessage('');void api<{hasKey:boolean}>('/speech/config',{baseUrl,model,...key||!hasKey?{apiKey:key}:{}}).then(c=>{setHasKey(c.hasKey);setKey('');setMessage('已保存')}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false))}}>保存语音配置</Button>{message&&<p role="status" className="text-sm">{message}</p>}</section>
}
