import { create } from 'zustand'
export const useAgentPanel=create<{selected:string|null;session:string;open:(session:string,id:string)=>void;close:()=>void}>(set=>({selected:null,session:'',open:(session,selected)=>set({session,selected}),close:()=>set({selected:null})}))
export function agentStatus(args:unknown,result:unknown,isError?:boolean){
 const state=args && typeof args==='object' && 'executionStatus' in args ? args.executionStatus : undefined
 return isError || state==='error' ? '有问题' : state==='running' || result===undefined ? '进行中' : '已完成'
}
