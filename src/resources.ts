import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export type ResourceKind = 'mcp' | 'skill' | 'task'
export type Resource = { id:string; kind:ResourceKind; name:string; enabled:boolean; transport:'stdio'|'http'; command:string; endpoint:string; instructions:string; frequency:'daily'|'weekly'|'once'; time:string; weekday:string; date:string; timezone:string; agent:string; workspace:string; sourceSession?:string }
export const createResource = (kind:ResourceKind):Resource => ({id:crypto.randomUUID(),kind,name:'',enabled:false,transport:'stdio',command:'',endpoint:'',instructions:'',frequency:'daily',time:'',weekday:'1',date:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,agent:'Ailya',workspace:'Ailya'})
export const useResources=create<{items:Resource[];save:(entry:Resource)=>string|null;remove:(id:string)=>void;toggle:(id:string)=>void}>()(persist((set,get)=>({
 items:[],
 save:entry=>{
  if(!entry.name.trim())return '请输入名称。'
  if(get().items.some(x=>x.id!==entry.id&&x.kind===entry.kind&&x.name.toLowerCase()===entry.name.trim().toLowerCase()))return '名称已存在。'
  if(entry.kind==='mcp'){
   if(entry.transport==='stdio'&&!entry.command.trim())return '请输入启动命令。'
   if(entry.transport==='http'){try{const url=new URL(entry.endpoint);if(!['http:','https:'].includes(url.protocol))return '请输入 HTTP 或 HTTPS 地址。'}catch{return '请输入有效地址。'}}
  }else if(!entry.instructions.trim())return entry.kind==='task'?'请输入任务内容。':'请输入 Skill 内容。'
  if(entry.kind==='task'){
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time))return '请选择执行时间。'
   if(entry.frequency==='once'&&!entry.date)return '请选择日期。'
   if(!entry.agent.trim()||!entry.workspace.trim())return '请选择 Agent 和工作空间。'
  }
  const clean={...entry,name:entry.name.trim()};set({items:get().items.some(x=>x.id===entry.id)?get().items.map(x=>x.id===entry.id?clean:x):[...get().items,clean]});return null
 },
 remove:id=>set({items:get().items.filter(x=>x.id!==id)}),
 toggle:id=>set({items:get().items.map(x=>x.id===id?{...x,enabled:!x.enabled}:x)})
}),{name:'ailya-resources-v1'}))
export function taskFromMessage(text:string,sessionId:string,agent:string,workspace:string):Resource|null{
 if(!(/定时任务/.test(text)||/每天|每周/.test(text)&&/提醒|检查|整理|运行|执行|总结|汇总|帮我/.test(text)))return null
 const time=text.match(/(\d{1,2})(?:[:：](\d{2})|点(?:(\d{1,2})分?)?)/)
 let hour=time?Number(time[1]):-1
 if(/下午|晚上/.test(text)&&hour>=0&&hour<12)hour+=12
 const weekday=text.match(/每周([一二三四五六日天])/)
 return {...createResource('task'),name:text.slice(0,36),instructions:text,sourceSession:sessionId,agent,workspace,frequency:weekday?'weekly':'daily',weekday:weekday?String('日一二三四五六'.indexOf(weekday[1]==='天'?'日':weekday[1])):'1',time:hour>=0&&hour<24?`${String(hour).padStart(2,'0')}:${time?.[2]||time?.[3]?.padStart(2,'0')||'00'}`:''}
}
export const resourceLabel={mcp:'MCP',skill:'Skill',task:'定时任务'}
export function scheduleLabel(entry:Resource){return `${entry.frequency==='daily'?'每天':entry.frequency==='weekly'?'每周'+['日','一','二','三','四','五','六'][Number(entry.weekday)]:entry.date} ${entry.time} · ${entry.timezone}`}
