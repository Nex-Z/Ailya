import {useEffect,useRef,useState} from 'react'
import {ChevronLeft,ChevronRight} from 'lucide-react'
import {Button} from './ui/button'
import {Textarea} from './ui/textarea'
import {api} from '../lib/core-api'
import type {Answers,QuestionRequest} from '../questions'
const positions=new Map<string,number>()
export function QuestionPanel({request,sessionId,disabled,onError}:{request:QuestionRequest;sessionId:string;disabled:boolean;onError:(error:string)=>void}){
 const [now,setNow]=useState(Date.now),[values,setValues]=useState<Answers>(request.drafts),[index,setIndex]=useState(positions.get(request.id)??0),[busy,setBusy]=useState(false)
 const revision=useRef(request.revision),queue=useRef<Promise<void>>(Promise.resolve()),saveError=useRef<Error|null>(null)
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer)},[])
 const base=`/sessions/${sessionId}/questions/${request.id}`
 const remaining=Math.max(0,Math.ceil((request.deadlineAt-now)/1000)),q=request.questions[index],last=index===request.questions.length-1
 const ready=request.questions.every(q=>!!values[q.id]?.selected.length||!!values[q.id]?.text.trim())
 const navigate=(n:number)=>{positions.set(request.id,n);setIndex(n)}
 const update=(id:string,patch:Partial<Answers[string]>)=>{
  const next={...values,[id]:{...(values[id]??{selected:[],text:''}),...patch}};setValues(next)
  queue.current=queue.current.then(async()=>{
   if(saveError.current)return
   try{const saved=await api<QuestionRequest>(base+'/draft',{answers:next,revision:revision.current});revision.current=saved.revision}
   catch(error){saveError.current=error instanceof Error?error:Error('回答保存失败');onError(saveError.current.message)}
  })
 }
 const action=async(kind:'answer'|'refuse')=>{
  if(busy||disabled)return;setBusy(true);onError('')
  try{await queue.current;await api(base+'/'+kind,kind==='answer'?{answers:values}:{})}
  catch(error){onError(error instanceof Error?error.message:'问题提交失败');setBusy(false)}
 }
 if(!q)return null
 return <form aria-label="回答 Agent 问题" className="overflow-hidden rounded-xl border bg-popover shadow-sm" onSubmit={e=>{e.preventDefault();if(last&&ready)void action('answer')}}>
  <div className="flex items-center justify-between border-b px-4 py-3 text-sm font-medium"><span>{request.agent} · {request.status==='interrupted'?'已中断停止':request.status==='timed_out'?'已超时停止':`等待回答 ${remaining}s`}</span><span className="tabular-nums text-muted-foreground" aria-live="polite">{index+1} / {request.questions.length}</span></div>
  <div className="max-h-[45dvh] overflow-y-auto p-4"><fieldset key={q.id} disabled={busy||disabled} className="space-y-3"><legend className="mb-2 text-sm font-medium">{q.title}</legend>
   {q.kind!=='text'&&<div role="group" aria-label={q.title} className="flex flex-col gap-2">{q.options?.map((option,i)=>{
    const selected=values[q.id]?.selected??[],checked=selected.includes(option)
    return <Button key={option} aria-label={option} aria-describedby={q.recommendedOptions?.includes(option)?`${request.id}-${q.id}-${i}-recommended`:undefined} type="button" size="sm" className="h-auto min-h-9 w-full justify-start whitespace-normal py-2 text-left" variant={checked?'default':'outline'} aria-pressed={checked} onClick={()=>update(q.id,{selected:checked?selected.filter(v=>v!==option):q.kind==='multiple'?[...selected,option]:[option]})}><span aria-hidden="true" className={`w-5 shrink-0 ${checked?'text-primary-foreground':'text-muted-foreground'}`}>{String.fromCharCode(65+i)}</span><span>{option}</span>{q.recommendedOptions?.includes(option)&&<span id={`${request.id}-${q.id}-${i}-recommended`} className="ml-1 shrink-0 rounded border border-current/25 px-1.5 py-0.5 text-[11px] font-normal">推荐</span>}</Button>
   })}</div>}
   {(q.kind==='text'||q.kind==='mixed')&&<Textarea aria-label={q.title} placeholder={q.kind==='mixed'?'补充或填写其他回答':'填写回答'} value={values[q.id]?.text??''} onChange={e=>update(q.id,{text:e.target.value})} className="min-h-20"/>}
  </fieldset></div>
  <div className="flex flex-wrap justify-between gap-2 border-t px-4 py-3"><Button type="button" variant="ghost" size="sm" disabled={busy||disabled} onClick={()=>void action('refuse')}>拒答</Button><Button type="button" variant="ghost" size="sm" disabled={index===0||busy} onClick={()=>navigate(index-1)}><ChevronLeft className="size-4"/>上一个</Button>{last?<Button key="submit" type="submit" size="sm" disabled={!ready||busy||disabled}>提交回答</Button>:<Button key="next" type="button" size="sm" disabled={busy} onClick={()=>navigate(index+1)}>下一个<ChevronRight className="size-4"/></Button>}</div>
 </form>
}
