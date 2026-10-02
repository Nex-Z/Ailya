import {create} from 'zustand'
import {api} from './lib/core-api'
type AgentConfig={id:string;name:string;model:string;skills:string[];tools:string[];prompt:string}
 type GroupConfig={id:string;name:string;coordinator:string;members:string[]}
export type {AgentConfig,GroupConfig}
type Data={agents:AgentConfig[];groups:GroupConfig[]}
type Catalog=Data&{load:()=>Promise<void>;saveAgent:(v:AgentConfig)=>Promise<string|null>;saveGroup:(v:GroupConfig)=>Promise<string|null>;remove:(kind:'agents'|'groups',id:string)=>Promise<string|null>}
export const useCatalog=create<Catalog>((set)=>({
 agents:[],groups:[],
 load:async()=>{
  const legacy=localStorage.getItem('ailya-catalog-v1')
  if(legacy){const data=JSON.parse(legacy).state;if(data?.agents&&data?.groups)set(await api<Data>('/catalog/import-prototype',{agents:data.agents,groups:data.groups}))}
  set(await api<Data>('/catalog'))
 },
 saveAgent:async value=>{try{set(await api<Data>('/catalog/agents',value));return null}catch(e){return e instanceof Error?e.message:'保存失败'}},
 saveGroup:async value=>{try{set(await api<Data>('/catalog/groups',value));return null}catch(e){return e instanceof Error?e.message:'保存失败'}},
 remove:async(kind,id)=>{try{set(await api<Data>('/catalog/'+kind+'/'+encodeURIComponent(id),{},'DELETE'));return null}catch(e){return e instanceof Error?e.message:'删除失败'}},
}))
