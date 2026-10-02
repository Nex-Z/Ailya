import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from './button'
import {api} from '../../lib/core-api'

export function DirectoryPicker({value,onChange}:{value:string;onChange:(path:string)=>void}) {
 const [error,setError]=useState('')
 const choose=async()=>{
  setError('')
  try {
   const directory=await api<{path:string|null}>('/workspaces/pick',{})
   if(directory.path)onChange(directory.path)
  } catch(error) {
   if(error instanceof DOMException && error.name==='AbortError')return
   setError('无法打开目录，请重试。')
  }
 }
 return <div className="space-y-2"><span className="text-sm">工作目录</span>
  <Button type="button" variant="outline" aria-label="选择工作目录" onClick={choose} className="w-full justify-start font-normal">
   <FolderOpen className="size-4 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 truncate text-left" title={value}>{value || '选择目录'}</span>
  </Button>
  {error&&<p role="alert" className="text-sm">{error}</p>}
 </div>
}
