import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { complexSession } from '../demo/complex'
import { useStore, type Message } from '../store'
import { Button } from './ui/button'
const frames:Message[][]=[]
let previous:Message[]=[]
for(const message of complexSession.messages){
 if(message.parts){
  const parts:NonNullable<Message['parts']>[number][]=[]
  for(const part of message.parts){
   if(part.type==='tool-call')frames.push([...previous,{...message,stopped:false,executing:true,parts:[...parts,{...part,result:undefined,args:{...part.args,executionStatus:'running'}}]}])
   parts.push(part);frames.push([...previous,{...message,stopped:false,executing:true,parts:[...parts]}])
  }
 }
 previous=[...previous,message];frames.push(previous)
}
export function ComplexReplay(){
 const [cursor,setCursor]=useState(-1);const [playing,setPlaying]=useState(false)
 const current=useRef(cursor);useEffect(()=>{current.current=cursor},[cursor])
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>{const next=current.current+1;if(next>=frames.length){setPlaying(false);return}useStore.setState(s=>({sessions:s.sessions.map(session=>session.id===complexSession.id?{...session,messages:frames[next]}:session)}));setCursor(next)},1000);return()=>clearInterval(timer)},[playing])
 const restore=()=>{setPlaying(false);setCursor(-1);useStore.setState(s=>({sessions:s.sessions.map(session=>session.id===complexSession.id?{...session,messages:complexSession.messages}:session)}))}
 return <div className="ml-auto flex shrink-0 items-center gap-1"><Button size="sm" variant="ghost" onClick={()=>{if(cursor===-1||cursor>=frames.length-1){setCursor(0);useStore.setState(s=>({sessions:s.sessions.map(session=>session.id===complexSession.id?{...session,messages:frames[0]}:session)}))}setPlaying(!playing)}}>{playing?<Pause className="size-3.5"/>:<Play className="size-3.5"/>}{playing?'暂停回放':cursor>0&&cursor<frames.length-1?'继续回放':'回放过程'}</Button><Button size="icon" variant="ghost" aria-label="查看完整记录" onClick={restore}><RotateCcw className="size-3.5"/></Button></div>
}


