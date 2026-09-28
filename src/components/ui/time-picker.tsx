import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './select'

export function TimePicker({value,onChange}:{value:string;onChange:(value:string)=>void}) {
 const [hour,minute]=value.split(':')
 const options=(count:number)=>Array.from({length:count},(_,i)=>String(i).padStart(2,'0'))
 return <div className="space-y-2"><span className="text-sm">时间</span><div className="flex items-center gap-1.5">
  <Select value={hour || ''} onValueChange={v=>onChange(`${v}:${minute || '00'}`)}><SelectTrigger aria-label="小时" className="min-w-0 flex-1 tabular-nums"><SelectValue placeholder="时"/></SelectTrigger><SelectContent side="bottom" className="max-h-60">{options(24).map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
  <span className="text-muted-foreground">:</span>
  <Select value={minute || ''} onValueChange={v=>onChange(`${hour || '00'}:${v}`)}><SelectTrigger aria-label="分钟" className="min-w-0 flex-1 tabular-nums"><SelectValue placeholder="分"/></SelectTrigger><SelectContent side="bottom" className="max-h-60">{options(60).map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
 </div></div>
}
