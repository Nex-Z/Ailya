import { create } from 'zustand'
import { api } from './lib/core-api'
export type ResourceKind = 'mcp' | 'skill' | 'task'
export type Resource = { id:string; kind:ResourceKind; name:string; enabled:boolean; transport:'stdio'|'http'; command:string; endpoint:string; instructions:string; frequency:'daily'|'weekly'|'once'; time:string; weekday:string; date:string; timezone:string; agent:string; workspace:string; sourceSession?:string; model?:string;permission?:'default'|'full';env?:Record<string,string>;headers?:Record<string,string>;nextRun?:number|null;lastRun?:{status:string;session_id:string|null;error:string|null;due_at:number}|null }
export const createResource = (kind:ResourceKind):Resource => ({id:crypto.randomUUID(),kind,name:'',enabled:false,transport:'stdio',command:'',endpoint:'',instructions:'',frequency:'daily',time:'',weekday:'1',date:'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,agent:'Ailya',workspace:'Ailya'})
let imported=false
export const useResources=create<{items:Resource[];error:string;load:()=>Promise<void>;save:(entry:Resource)=>Promise<string|null>;remove:(id:string)=>Promise<void>;toggle:(id:string)=>Promise<void>}>((set,get)=>({
 items:[],error:'',
 load:async()=>{try{if(!imported){const raw=localStorage.getItem('ailya-resources-v1');const legacy=raw?JSON.parse(raw)?.state?.items??[]:[];await api('/resources/import-prototype',legacy);imported=true}set({items:await api<Resource[]>('/resources'),error:''})}catch(e){try{set({items:await api<Resource[]>('/resources')})}catch{}set({error:e instanceof Error?e.message:'配置加载失败'})}},
 save:async entry=>{try{const {nextRun:_,lastRun:__,...data}=entry;await api('/resources',data);await get().load();return null}catch(e){return e instanceof Error?e.message:'配置保存失败'}},
 remove:async id=>{try{await api('/resources/'+id,{},'DELETE');await get().load()}catch(e){set({error:e instanceof Error?e.message:'删除失败'})}},
 toggle:async id=>{const entry=get().items.find(x=>x.id===id);if(entry){const error=await get().save({...entry,enabled:!entry.enabled});set({error:error??''})}},
}))
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
