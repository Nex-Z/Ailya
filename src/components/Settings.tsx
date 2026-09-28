import { IMSettings } from './IMSettings'
import { Textarea } from './ui/textarea'
import { ModelSettings } from './ModelSettings'
import { useState, type ReactNode } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import { usePreferences } from '../preferences'
const sections=[{label:'基础',items:['常规','模型与连接']},{label:'使用情况',items:['Token 消耗']},{label:'连接与集成',items:['本地 Core','远程 IM']},{label:'数据',items:['会话与存储']}]
function Row({label,children}:{label:string;children:ReactNode}){return <div className="flex flex-col gap-3 border-b py-5 sm:flex-row sm:items-center sm:justify-between"><span className="shrink-0 text-sm">{label}</span><div className="w-full text-sm sm:max-w-[260px]">{children}</div></div>}
function Choice({label,value,options,onChange}:{label:string;value:string;options:string[];onChange:(v:string)=>void}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>}
export function Settings(){
 const {config,save}=usePreferences();const [draft,setDraft]=useState(config);const [section,setSection]=useState('常规');const [saved,setSaved]=useState(false);const [validation,setValidation]=useState('');const [period,setPeriod]=useState('最近 7 天')
 const patch=(v:Partial<typeof config>)=>{setDraft(d=>({...d,...v}));setSaved(false)}
 const editable=['常规','本地 Core','远程 IM'].includes(section)
 return <Dialog onOpenChange={open=>{if(open){setDraft(config);setSaved(false)}}}><DialogTrigger asChild><Button variant="ghost" size="icon" className="ml-auto size-8 text-muted-foreground" aria-label="设置"><SettingsIcon className="size-4"/></Button></DialogTrigger>
 <DialogContent aria-describedby={undefined} className="flex h-[min(760px,90dvh)] w-[calc(100%-2rem)] max-w-[1040px] flex-col gap-0 overflow-hidden rounded-xl p-0">
 <div className="border-b px-6 py-5"><DialogTitle>设置</DialogTitle></div>
 <div className="flex min-h-0 flex-1"><nav aria-label="设置分类" className="w-28 shrink-0 overflow-y-auto border-r bg-muted/40 p-2 sm:w-52 sm:p-4">{sections.map(group=><div key={group.label} className="mb-5"><div className="mb-2 px-2 text-xs text-muted-foreground">{group.label}</div>{group.items.map(item=><Button key={item} variant={section===item?'secondary':'ghost'} aria-current={section===item?'page':undefined} className="mb-1 h-auto min-h-9 w-full justify-start whitespace-normal px-2 text-left text-xs sm:text-sm" onClick={()=>{setSection(item);setSaved(false)}}>{item}</Button>)}</div>)}</nav>
 <div className="flex min-w-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"><h2 className="mb-3 text-lg font-medium">{section}</h2>
 {section==='常规'&&<><Row label="风险授权白名单"><Textarea placeholder="每行一条正则表达式" className="min-h-28 font-mono" aria-label="风险授权白名单" value={draft.allowlist??''} onChange={e=>patch({allowlist:e.target.value})}/></Row><Row label="语言"><Choice label="语言" value={draft.language} options={['简体中文','English']} onChange={language=>patch({language})}/></Row><Row label="发送快捷键"><Choice label="发送快捷键" value={draft.sendKey} options={['Enter','Ctrl + Enter']} onChange={sendKey=>patch({sendKey})}/></Row><Row label="界面主题">浅色</Row><Row label="默认机器">Local</Row></>}
 {section==='模型与连接'&&<ModelSettings/>}
 {section==='本地 Core'&&<><Row label="服务地址"><Input aria-label="Core 服务地址" value={draft.core} onChange={e=>patch({core:e.target.value})}/></Row><Row label="连接状态">未连接</Row><Row label="版本">—</Row></>}
 {section==='远程 IM'&&<IMSettings items={draft.imConfigs??[{id:'legacy',platform:draft.imChannel,account:draft.imAccount,enabled:draft.imEnabled,scope:draft.imScope}]} onChange={imConfigs=>patch({imConfigs})}/>}
 {section==='会话与存储'&&<><Row label="会话存储">当前浏览器</Row><Row label="配置存储">当前浏览器</Row><Row label="附件存储">未连接</Row><Row label="数据库">未连接</Row></>}
 {section==='Token 消耗'&&<><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-muted-foreground">暂无用量记录</span><div className="w-36"><Choice label="统计周期" value={period} options={['今天','最近 7 天','最近 30 天']} onChange={setPeriod}/></div></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[['输入 Token',0],['输出 Token',0],['缓存 Token',0]].map(([label,total])=><div key={label} className="rounded-lg border p-4"><div className="mb-2 text-xs text-muted-foreground">{label}</div><div className="text-xl tabular-nums">{Math.round(Number(total)*(period==='今天'?0.14:period==='最近 30 天'?4:1)).toLocaleString()}</div></div>)}</div><div className="mt-6 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-3 font-medium">Agent</th><th className="py-3 text-right font-medium">Token 总量</th></tr></thead><tbody>{[['Ailya',0],['Coder',0],['Reviewer',0]].map(([name,total])=><tr key={name} className="border-b"><td className="py-4">{name}</td><td className="text-right tabular-nums">{Math.round(Number(total)*(period==='今天'?0.14:period==='最近 30 天'?4:1)).toLocaleString()}</td></tr>)}</tbody></table></div></>}
 </div>{editable&&<div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 sm:px-8"><span role="status" className="text-xs text-muted-foreground">{validation|| (saved?'已保存':'')}</span><Button size="sm" onClick={()=>{const lines=(draft.allowlist??'').split('\n');for(let i=0;i<lines.length;i++){if(!lines[i].trim())continue;try{new RegExp(lines[i])}catch{setValidation('第 '+(i+1)+' 行正则表达式无效');return}}setValidation('');save(draft);setSaved(true)}}>保存</Button></div>}</div></div>
 </DialogContent></Dialog>
}





