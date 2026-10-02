import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from './command'

export function MultiSelect({ label, options, value, onChange,labels={} }: { label: string; options: string[]; value: string[]; onChange: (value: string[]) => void;labels?:Record<string,string> }) {
 const [open, setOpen] = useState(false)
 return <div className="space-y-2 text-sm"><span>{label}</span><Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><Button type="button" variant="outline" aria-label={label} aria-haspopup="dialog" aria-expanded={open} className="h-auto min-h-9 w-full justify-between px-3 py-2 font-normal">
   <span className="flex min-w-0 flex-wrap gap-1 text-left">{value.length ? value.map(item => <span key={item} className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{labels[item]??item}</span>) : <span className="text-muted-foreground">选择 {label}</span>}</span><ChevronDown className="ml-2 size-4 shrink-0 opacity-50"/>
  </Button></PopoverTrigger>
  <PopoverContent align="start" side="bottom" className="w-[var(--radix-popover-trigger-width)] p-0">
   <Command><CommandInput aria-label={`搜索 ${label}`} placeholder="搜索"/><CommandList className="max-h-52"><CommandEmpty>没有匹配项</CommandEmpty><CommandGroup>
    {options.map(item => <CommandItem key={item} value={labels[item]??item} aria-label={labels[item]??item} onSelect={() => onChange(value.includes(item) ? value.filter(v => v !== item) : [...value, item])}>
     <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${value.includes(item) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}><Check className={value.includes(item) ? 'size-3' : 'invisible size-3'}/></span>{labels[item]??item}<span className="sr-only">{value.includes(item) ? '已勾选' : '未勾选'}</span>
    </CommandItem>)}
   </CommandGroup></CommandList></Command>
  </PopoverContent>
 </Popover></div>
}
