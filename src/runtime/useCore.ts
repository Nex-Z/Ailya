import {useEffect,useState} from 'react'
import {useCatalog} from '../catalog'
import {api} from '../lib/core-api'
import {applySession,useStore,draft,type Session} from '../store'
import {useProviders,type Provider} from '../providers'
export function useCore(){
 const [error,setError]=useState(''),[ready,setReady]=useState(false)
 useEffect(()=>{
  let disposed=false,socket:WebSocket|undefined,timer:ReturnType<typeof setTimeout>|undefined,cursor=0,initial=true
  const connect=async()=>{
   try{
    await useCatalog.getState().load()
    const snapshot=await api<{sessions:Session[];providers:Provider[];preferredModel?:string;cursor:number}>('/snapshot')
    if(disposed)return
    cursor=snapshot.cursor
    useStore.setState(s=>{const drafts=s.sessions.filter(x=>!x.messages.length&&!snapshot.sessions.some(y=>y.id===x.id));const sessions=[...snapshot.sessions,...drafts];if(!sessions.length)sessions.push(draft());const preferred=initial?(sessionStorage.getItem('ailya-active-session')??snapshot.sessions[0]?.id??s.activeId):s.activeId;return sessions.length?{preferredModel:snapshot.preferredModel??'默认模型',sessions,activeId:sessions.some(x=>x.id===preferred)?preferred:sessions[0].id}:s})
    initial=false;useProviders.setState({items:snapshot.providers})
    socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/events?after=${cursor}`)
    socket.onopen=()=>{setReady(true);setError('')}
    socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.seq<=cursor)return;cursor=data.seq;applySession(data.session)}
    socket.onclose=()=>{setReady(false);if(!disposed){setError('Core 连接中断，正在重连');timer=setTimeout(connect,1000)}}
    socket.onerror=()=>socket?.close()
   }catch{setReady(false);setError('无法连接 Core');if(!disposed)timer=setTimeout(connect,1000)}
  }
  void connect()
  return()=>{disposed=true;clearTimeout(timer);socket?.close()}
 },[])
 return {error,setError,ready}
}

