import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export type Provider={id:string;name:string;baseUrl:string;models:string[];availableModels?:string[]}
export const useProviders=create<{items:Provider[];save:(item:Provider)=>void;remove:(id:string)=>void}>()(persist(set=>({remove:id=>set(s=>({items:s.items.filter(p=>p.id!==id)})),items:[{id:'deepseek',name:'DeepSeek',baseUrl:'https://api.deepseek.com',models:['deepseek-flash','deepseek-v4-pro']},{id:'compatible-example',name:'兼容厂商示例',baseUrl:'https://example.com/v1',models:['deepseek-flash']}],save:item=>set(s=>({items:s.items.some(p=>p.id===item.id)?s.items.map(p=>p.id===item.id?item:p):[...s.items,item]}))}),{name:'ailya-providers-v1',version:1,migrate:state=>{const old=state as {items:Provider[]};return {...old,items:[...old.items,...(old.items.some(p=>p.id==='compatible-example')?[]:[{id:'compatible-example',name:'兼容厂商示例',baseUrl:'https://example.com/v1',models:['deepseek-flash']}])]}}}))


export const modelKey=(providerId:string,modelId:string)=>JSON.stringify([providerId,modelId])
export function modelLabel(value:string){try{const [provider,model]=JSON.parse(value);const name=useProviders.getState().items.find(p=>p.id===provider)?.name??provider;return `${name} / ${model}`}catch{return value}}

