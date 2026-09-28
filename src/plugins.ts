import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export type Plugin={id:string;source:string;kind:string;enabled:boolean}
export const usePlugins=create<{items:Plugin[];save:(p:Plugin)=>void;remove:(id:string)=>void}>()(persist(set=>({items:[],save:p=>set(s=>({items:s.items.some(x=>x.id===p.id)?s.items.map(x=>x.id===p.id?p:x):[...s.items,p]})),remove:id=>set(s=>({items:s.items.filter(p=>p.id!==id)}))}),{name:'ailya-plugins-v1'}))
