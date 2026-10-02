import { create } from 'zustand'
import { api } from './lib/core-api'
export type Provider={id:string;name:string;baseUrl:string;models:string[];availableModels?:string[];hasKey?:boolean}
export const useProviders=create<{items:Provider[];save:(item:Provider,key?:string)=>Promise<void>;remove:(id:string)=>Promise<void>}>(set=>({items:[],save:async(item,key)=>{const {hasKey:_,...config}=item;await api('/providers',{...config,...(key?{apiKey:key}:{})});set({items:await api<Provider[]>('/providers')})},remove:async id=>{await api('/providers/'+id,{},'DELETE');set({items:await api<Provider[]>('/providers')})}}))
export const modelKey=(providerId:string,modelId:string)=>JSON.stringify([providerId,modelId])
export function modelLabel(value:string){try{const [provider,model]=JSON.parse(value);const name=useProviders.getState().items.find(p=>p.id===provider)?.name??provider;return `${name} / ${model}`}catch{return value}}
