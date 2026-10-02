import {useState} from 'react'
import {Button} from './ui/button'
import {api} from '../lib/core-api'
import type {PermissionRequest} from '../store'
export function PermissionPanel({sessionId,request}:{sessionId:string;request:PermissionRequest}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const decide=async(allow:boolean)=>{setBusy(true);setError('');try{await api(`/sessions/${sessionId}/permissions/${request.id}`,{allow})}catch(e){setError(e instanceof Error?e.message:'授权失败');setBusy(false)}}
 return <section aria-label="工具执行授权" className="mb-3 overflow-hidden rounded-xl border bg-popover shadow-sm"><div className="border-b px-4 py-3 text-sm font-medium">允许执行 {request.tool}？</div><div className="max-h-56 overflow-auto p-4"><p className="break-all font-mono text-xs">{request.action}</p><pre className="mt-3 whitespace-pre-wrap break-all text-xs">{JSON.stringify(request.args,null,2)}</pre></div>{error&&<p role="alert" className="px-4 text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void decide(false)}>拒绝并停止</Button><Button size="sm" disabled={busy} onClick={()=>void decide(true)}>允许这一次</Button></div></section>
}
