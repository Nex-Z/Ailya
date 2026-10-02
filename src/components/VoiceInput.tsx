import {encodeWave} from '../lib/voice-wave'
import {useEffect,useRef,useState} from 'react'
import {Mic,LoaderCircle} from 'lucide-react'
import {Button} from './ui/button'
type Capture={abort:AbortController;stream?:MediaStream;context?:AudioContext;node?:AudioWorkletNode;chunks:Float32Array[];samples:number;ready:boolean;timer?:ReturnType<typeof setTimeout>}
export function VoiceInput({sessionId,disabled,onText,onError}:{sessionId:string;disabled:boolean;onText:(text:string)=>void;onError:(error:string)=>void}){
 const [state,setState]=useState<'idle'|'starting'|'recording'|'transcribing'>('idle')
 const capture=useRef<Capture|null>(null),callbacks=useRef({onText,onError});useEffect(()=>{callbacks.current={onText,onError}},[onText,onError])
 const dispose=(c:Capture)=>{clearTimeout(c.timer);c.node?.disconnect();if(c.node)c.node.port.onmessage=null;c.stream?.getTracks().forEach(t=>t.stop());if(c.context&&c.context.state!=='closed')void c.context.close().catch(()=>{})}
 const cancel=()=>{const c=capture.current;if(c){c.abort.abort();dispose(c);capture.current=null}setState('idle')}
 useEffect(()=>{const blur=()=>cancel();window.addEventListener('blur',blur);return()=>{window.removeEventListener('blur',blur);const c=capture.current;if(c){c.abort.abort();dispose(c);capture.current=null}}},[sessionId])
 const finish=async()=>{
  const c=capture.current;if(!c||state==='transcribing')return
  if(!c.ready){cancel();return}
  dispose(c)
  if(c.samples<4000){cancel();callbacks.current.onError('录音太短，请按住说话');return}
  setState('transcribing')
  try{
   const response=await fetch('/api/speech/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio:encodeWave(c.chunks),mime:'audio/wav'}),signal:c.abort.signal})
   const result=await response.json();if(!response.ok)throw Error(result.error??'语音识别失败')
   if(capture.current===c&&!c.abort.signal.aborted)callbacks.current.onText(result.text)
  }catch(e){if(!c.abort.signal.aborted)callbacks.current.onError((e as Error).message)}finally{if(capture.current===c){capture.current=null;setState('idle')}}
 }
 const start=async()=>{
  if(disabled||capture.current)return
  const c:Capture={abort:new AbortController(),chunks:[],samples:0,ready:false};capture.current=c;setState('starting');callbacks.current.onError('')
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.AudioContext)throw Error('浏览器不支持录音，请在本机 localhost 或 HTTPS 打开')
   c.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}})
   if(c.abort.signal.aborted){dispose(c);return}
   c.context=new AudioContext({sampleRate:16000});await c.context.audioWorklet.addModule('/voice-recorder.js')
   if(c.abort.signal.aborted){dispose(c);return}
   c.node=new AudioWorkletNode(c.context,'ailya-voice-recorder');c.node.port.onmessage=(event:MessageEvent<Float32Array>)=>{if(capture.current!==c||c.abort.signal.aborted)return;if(c.samples+event.data.length>16000*120){cancel();callbacks.current.onError('录音不能超过两分钟，请重新录制');return}c.chunks.push(event.data);c.samples+=event.data.length}
   const source=c.context.createMediaStreamSource(c.stream),silent=c.context.createGain();silent.gain.value=0;source.connect(c.node);c.node.connect(silent);silent.connect(c.context.destination);await c.context.resume()
   if(c.abort.signal.aborted){dispose(c);return}
   c.ready=true;setState('recording');c.timer=setTimeout(()=>{if(capture.current===c){cancel();callbacks.current.onError('录音不能超过两分钟，请重新录制')}},120000)
  }catch(e){dispose(c);if(!c.abort.signal.aborted){capture.current=null;setState('idle');callbacks.current.onError((e as Error).name==='NotAllowedError'?'未获得麦克风权限':(e as Error).message)}}
 }
 const label=state==='recording'?'正在录音，松开转文字':state==='starting'?'正在打开麦克风':state==='transcribing'?'正在转文字，点击取消':'按住说话'
 return <Button type="button" variant="ghost" size="icon" aria-label="语音输入" title={label} aria-pressed={state==='recording'} disabled={disabled} className={state==='recording'?'text-red-600 touch-none select-none':'touch-none select-none'} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();if(state==='transcribing'){cancel();return}e.currentTarget.setPointerCapture(e.pointerId);void start()}} onPointerUp={e=>{e.preventDefault();void finish()}} onPointerCancel={cancel} onKeyDown={e=>{if(e.key==='Escape'){cancel();return}if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();if(state==='transcribing')cancel();else void start()}}} onKeyUp={e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();void finish()}}}>{state==='starting'||state==='transcribing'?<LoaderCircle size={18} className="animate-spin"/>:<Mic size={18}/>}</Button>
}
