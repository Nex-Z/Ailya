import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { useAnswers,type QuestionRequest } from '../questions'
export function QuestionPanel({request,onSubmit,onRefuse}:{request:QuestionRequest;onSubmit:(answer:string)=>void;onRefuse:()=>void}){
 const {drafts,set,complete,deadlines,start,positions,position,mark}=useAnswers()
 const [now,setNow]=useState(Date.now)
 useEffect(()=>{start(request.id);const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer)},[request.id,start])
 const remaining=Math.max(0,Math.ceil(((deadlines[request.id]??now+30000)-now)/1000))
 const index=positions[request.id]??0
 const setIndex=(update:(i:number)=>number)=>position(request.id,update(index))
 const values=drafts[request.id]??{}
 const answer=(id:string)=>[values[id],values[id+'-text']].filter(v=>v?.trim()).join('；')
 const ready=request.questions.every(q=>!!answer(q.id))
 const q=request.questions[index]
 const last=index===request.questions.length-1
 if(!q)return null
 return <form aria-label="回答 Agent 问题" className="overflow-hidden rounded-xl border bg-popover shadow-sm" onSubmit={e=>{e.preventDefault();if(!last||!ready)return;onSubmit(request.questions.map(q=>`${q.title}\n${answer(q.id)}`).join('\n\n'));mark(request.id,'answered');complete(request.id)}}>
 <div className="flex items-center justify-between border-b px-4 py-3 text-sm font-medium"><span>{request.agent} · {remaining>0?`等待回答 ${remaining}s`:'已超时停止'}</span><span className="tabular-nums text-muted-foreground" aria-live="polite">{index+1} / {request.questions.length}</span></div>
 <div className="max-h-[45dvh] overflow-y-auto p-4"><fieldset key={q.id} className="space-y-3"><legend className="mb-2 text-sm font-medium">{q.title}</legend>{q.kind!=='text'&&<div role="group" aria-label={q.title} className="flex flex-col gap-2">{q.options?.map((option,optionIndex)=><Button key={option} aria-label={option} aria-describedby={q.recommendedOptions?.includes(option)?`${request.id}-${q.id}-${optionIndex}-recommended`:undefined} type="button" size="sm" className="h-auto min-h-9 w-full justify-start whitespace-normal py-2 text-left" variant={(q.kind==='multiple'?(values[q.id]??'').split('、').includes(option):values[q.id]===option)?'default':'outline'} aria-pressed={(q.kind==='multiple'?(values[q.id]??'').split('、').includes(option):values[q.id]===option)} onClick={()=>{const old=(values[q.id]??'').split('、').filter(Boolean);set(request.id,q.id,q.kind==='multiple'?(old.includes(option)?old.filter(v=>v!==option):[...old,option]).join('、'):values[q.id]===option?'':option)}}><span aria-hidden="true" className={(q.kind==='multiple'?(values[q.id]??'').split('、').includes(option):values[q.id]===option)?"w-5 shrink-0 text-primary-foreground":"w-5 shrink-0 text-muted-foreground"}>{String.fromCharCode(65+optionIndex)}</span><span>{option}</span>{q.recommendedOptions?.includes(option)&&<span id={`${request.id}-${q.id}-${optionIndex}-recommended`} className="ml-1 shrink-0 rounded border border-current/25 px-1.5 py-0.5 text-[11px] font-normal">推荐</span>}</Button>)}</div>}{(q.kind==='text'||q.kind==='mixed')&&<Textarea aria-label={q.title} placeholder={q.kind==='mixed'?'补充或填写其他回答':'填写回答'} value={values[q.id+'-text']??''} onChange={e=>set(request.id,q.id+'-text',e.target.value)} className="min-h-20"/>}</fieldset></div>
 <div className="flex flex-wrap justify-between gap-2 border-t px-4 py-3"><Button type="button" variant="ghost" size="sm" onClick={()=>{mark(request.id,'refused');complete(request.id);onRefuse()}}>拒答</Button><Button type="button" variant="ghost" size="sm" disabled={index===0} onClick={()=>setIndex(i=>i-1)}><ChevronLeft className="size-4"/>上一个</Button>{last?<Button key="submit" type="submit" size="sm" disabled={!ready}>提交回答</Button>:<Button key="next" type="button" size="sm" onClick={()=>setIndex(i=>i+1)}>下一个<ChevronRight className="size-4"/></Button>}</div>
 </form>
}









