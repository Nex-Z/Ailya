import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button } from './button'

type DirectoryWindow = Window & { showDirectoryPicker?: (options: { mode: 'read' }) => Promise<{ name: string }> }

export function DirectoryPicker({value,onChange}:{value:string;onChange:(path:string)=>void}) {
 const [error,setError]=useState('')
 const choose=async()=>{
  setError('')
  const picker=(window as DirectoryWindow).showDirectoryPicker
  if(!picker){setError('当前浏览器不支持系统目录选择，请使用 Chrome 或 Edge。');return}
  try {
   const directory=await picker.call(window,{mode:'read'})
   onChange(directory.name)
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
