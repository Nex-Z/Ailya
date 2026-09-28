import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export type AgentQuestion={id:string;title:string;kind:'choice'|'text'|'mixed'|'multiple';options?:string[];recommendedOptions?:string[]}
export type QuestionRequest={startedAt?:number;elapsedBeforeMs?:number;id:string;agent:string;questions:AgentQuestion[]}
export const useAnswers=create<{positions:Record<string,number>;position:(id:string,n:number)=>void;states:Record<string,string>;mark:(id:string,state:string)=>void;drafts:Record<string,Record<string,string>>;deadlines:Record<string,number>;start:(id:string)=>void;done:Record<string,boolean>;set:(id:string,key:string,value:string)=>void;complete:(id:string)=>void}>()(persist(set=>({positions:{},position:(id,n)=>set(s=>({positions:{...s.positions,[id]:n}})),states:{},mark:(id,state)=>set(s=>({states:{...s.states,[id]:state}})),deadlines:{},start:id=>set(s=>s.deadlines[id]?{}:{deadlines:{...s.deadlines,[id]:Date.now()+30000}}),drafts:{},done:{},set:(id,key,value)=>set(s=>({drafts:{...s.drafts,[id]:{...s.drafts[id],[key]:value}}})),complete:id=>set(s=>({done:{...s.done,[id]:true}}))}),{name:'ailya-question-answers-v1'}))




