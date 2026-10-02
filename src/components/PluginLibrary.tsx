import {useState,useEffect} from 'react'
import {usePlugins,type Plugin} from '../plugins'
import {Button} from './ui/button'
import {Input} from './ui/input'
import {Dialog,DialogContent,DialogTitle,DialogFooter} from './ui/dialog'
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select'
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogFooter,AlertDialogCancel} from './ui/alert-dialog'
export function PluginLibrary({form,setForm}:{form:Plugin|null;setForm:(value:Plugin|null)=>void}){
 const {items,load,save,remove,toggle,action,error:loadError}=usePlugins()
 const [query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[trusted,setTrusted]=useState(false)
 const [confirm,setConfirm]=useState<{plugin:Plugin;action:'remove'|'update'|'reload'}|null>(null)
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),1500);return()=>clearInterval(timer)},[load])
 const close=()=>{setForm(null);setError('');setTrusted(false)}
 const rows=items.filter(p=>p.source.toLowerCase().includes(query.toLowerCase()))
 const status=(p:Plugin)=>p.job?.status==='running'?p.job.action==='reload'?'检查中':p.job.action==='update'?'更新中':'安装中':!p.active_version?'待安装':p.enabled?'已就绪':'已停用'
 return <><Input className="mb-6 max-w-xs" aria-label="搜索插件" placeholder="搜索" value={query} onChange={e=>setQuery(e.target.value)}/>
 {(loadError||(!form&&!confirm&&error))&&<p role="alert" className="mb-4 text-sm text-destructive">{loadError||error}</p>}
 <div className="grid gap-4 sm:grid-cols-2">{rows.map(p=><article key={p.id} className="min-w-0 rounded-lg border bg-popover p-4"><h2 className="mb-3 break-all text-sm font-medium">{p.source}</h2><div className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{p.kind}</span><span>{status(p)}</span>{p.version&&<span>{p.version} · {p.tools?.length??0} 个工具</span>}</div>{p.error&&<p role="alert" className="mb-3 break-words text-sm text-destructive">{p.error}</p>}<div className="flex flex-wrap gap-1 border-t pt-3">
 <Button size="sm" variant="ghost" disabled={busy||p.job?.status==='running'||!p.active_version} onClick={async()=>setError(await toggle(p)??'')}>{p.enabled?'停用':'启用'}</Button>
 <Button size="sm" variant="ghost" disabled={busy||p.job?.status==='running'} onClick={()=>{setError('');setConfirm({plugin:p,action:'update'})}}>{p.active_version?'更新':'安装'}</Button>
 <Button size="sm" variant="ghost" disabled={busy||p.job?.status==='running'||!p.active_version} onClick={()=>{setError('');setConfirm({plugin:p,action:'reload'})}}>重新加载</Button>
 <Button size="sm" variant="ghost" disabled={busy||p.job?.status==='running'} onClick={()=>{setError('');setTrusted(false);setForm({...p})}}>编辑</Button>
 <Button size="sm" variant="ghost" disabled={busy||p.job?.status==='running'} onClick={()=>{setError('');setConfirm({plugin:p,action:'remove'})}}>卸载</Button></div></article>)}</div>
 {!rows.length&&<div className="py-12 text-center text-sm text-muted-foreground">{query?'没有匹配项':'暂无插件'}</div>}
 <Dialog open={!!form} onOpenChange={v=>{if(!v&&!busy)close()}}><DialogContent aria-describedby={undefined} className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl"><DialogTitle>{items.some(p=>p.id===form?.id)?'编辑插件':'安装插件'}</DialogTitle>
 {form&&<form id="plugin-form" className="space-y-4" onSubmit={async e=>{e.preventDefault();if(busy||!trusted)return;setBusy(true);const result=await save({...form,source:form.source.trim()});setBusy(false);if(result)setError(result);else close()}}>
 <Select value={form.kind} onValueChange={kind=>setForm({...form,kind,source:''})}><SelectTrigger aria-label="来源类型"><SelectValue/></SelectTrigger><SelectContent>{['npm','Git','本地路径'].map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
 <label className="block space-y-2 text-sm">插件来源<Input required value={form.source} placeholder={form.kind==='npm'?'npm:@scope/package@version':form.kind==='Git'?'git:github.com/user/repo@tag':'本地插件文件或目录路径'} onChange={e=>setForm({...form,source:e.target.value})}/></label>
 <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1.5" checked={trusted} onChange={e=>setTrusted(e.target.checked)}/><span>信任此来源，允许安装和检查时在本机运行插件代码。</span></label>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</form>}
 <DialogFooter><Button variant="outline" disabled={busy} onClick={close}>取消</Button><Button type="submit" form="plugin-form" disabled={busy||!trusted}>{busy?'提交中':'安装'}</Button></DialogFooter></DialogContent></Dialog>
 <AlertDialog open={!!confirm} onOpenChange={v=>{if(!v&&!busy){setConfirm(null);setError('')}}}><AlertDialogContent aria-describedby={undefined} className="w-[calc(100%-2rem)] rounded-xl"><AlertDialogTitle>{confirm?.action==='remove'?'卸载此插件？':confirm?.action==='reload'?'重新加载并检查插件？':'安装或更新此插件？'}</AlertDialogTitle>
 <p className="break-all text-sm text-muted-foreground">{confirm?.plugin.source}</p><p className="text-sm">{confirm?.action==='remove'?'停止提供此插件。保留任务审计版本，不删除原始来源目录或回滚已经完成的操作。':'此操作会在本机运行插件代码；更新失败时保留原版本。'}</p>
 {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><Button disabled={busy} onClick={async()=>{if(!confirm)return;setBusy(true);const result=confirm.action==='remove'?await remove(confirm.plugin.id):await action(confirm.plugin.id,confirm.action);setBusy(false);if(result)setError(result);else setConfirm(null)}}>{confirm?.action==='remove'?'卸载':'确认'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </>
}
