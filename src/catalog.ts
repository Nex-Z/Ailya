import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { agents as initialAgents, groups as initialGroups } from './demo/agents'
export type AgentConfig = typeof initialAgents[number] & { id: string }
export type GroupConfig = { id: string; name: string; coordinator: string; members: string[] }
type Catalog = { agents: AgentConfig[]; groups: GroupConfig[]; saveAgent: (value: AgentConfig) => string | null; saveGroup: (value: GroupConfig) => string | null; remove: (kind: 'agents' | 'groups', id: string) => string | null }
const agents = initialAgents.map(a => ({ ...a, id: a.name }))
export const useCatalog = create<Catalog>()(persist((set,get) => ({
 agents,
 groups: initialGroups.map(g => ({ ...g, id: g.name })),
 saveAgent: value => {
  const name=value.name.trim(); const state=get()
  if(!name) return '请输入名称。'
  if([...state.agents,...state.groups].some(x=>x.name.toLowerCase()===name.toLowerCase() && x.id!==value.id)) return '名称已存在。'
  const old=state.agents.find(a=>a.id===value.id)
  set({agents:old?state.agents.map(a=>a.id===value.id?{...value,name}:a):[...state.agents,{...value,name}]})
  return null
 },
 saveGroup: value => {
  const name=value.name.trim(); const state=get()
  if(!name) return '请输入名称。'
  if([...state.agents,...state.groups].some(x=>x.name.toLowerCase()===name.toLowerCase() && x.id!==value.id)) return '名称已存在。'
  if(!state.agents.some(a=>a.id===value.coordinator)) return '请选择协调者。'
  if(!value.members.length || value.members.some(id=>!state.agents.some(a=>a.id===id))) return '请选择有效成员。'
  set({groups:state.groups.some(g=>g.id===value.id)?state.groups.map(g=>g.id===value.id?{...value,name}:g):[...state.groups,{...value,name}]})
  return null
 },
 remove: (kind,id) => {
  if(kind==='agents' && get().groups.some(g=>g.coordinator===id || g.members.includes(id))) return '该 Agent 正被 Group 使用，请先调整 Group。'
  if(kind==='agents') set({agents:get().agents.filter(a=>a.id!==id)})
  else set({groups:get().groups.filter(g=>g.id!==id)})
  return null
 }
}),{name:'ailya-catalog-v1'}))
