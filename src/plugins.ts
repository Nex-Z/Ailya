import {create} from 'zustand'
import {api} from './lib/core-api'
export type Plugin={id:string;source:string;kind:string;enabled:boolean;active_version?:string|null;version?:string|null;error?:string|null;tools?:{name:string}[];job?:{action:string;status:string;error:string|null}|null}
let imported=false
export const usePlugins=create<{items:Plugin[];error:string;load:()=>Promise<void>;save:(p:Plugin)=>Promise<string|null>;remove:(id:string)=>Promise<string|null>;toggle:(p:Plugin)=>Promise<string|null>;action:(id:string,action:'update'|'reload')=>Promise<string|null>}>((set,get)=>{
 const perform=async(path:string,body:unknown,method='POST')=>{try{await api(path,body,method);await get().load();return null}catch(e){return e instanceof Error?e.message:'插件操作失败'}}
 return {items:[],error:'',load:async()=>{try{if(!imported){const raw=localStorage.getItem('ailya-plugins-v1'),rows=raw?JSON.parse(raw)?.state?.items??[]:[];await api('/plugins/import-prototype',rows);imported=true}set({items:await api<Plugin[]>('/plugins'),error:''})}catch(e){set({error:e instanceof Error?e.message:'插件加载失败'})}},
 save:p=>perform('/plugins',{id:p.id,kind:p.kind,source:p.source,enabled:p.enabled,trusted:true}),remove:id=>perform('/plugins/'+id,{},'DELETE'),toggle:p=>perform('/plugins/'+p.id+'/enabled',{enabled:!p.enabled}),action:(id,action)=>perform('/plugins/'+id+'/action',{action,trusted:true})}
})
