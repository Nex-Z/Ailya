import { Check, ChevronRight } from 'lucide-react'
import type { Context } from '../store'
import type { CommandItem as Item } from './command-items'
import { Command, CommandList, CommandGroup, CommandItem } from './ui/command'
export function SlashCommand({ items, active, select, context, locked }: { items: Item[]; active: number; select: (item: Item) => void; context: Context; locked: boolean }) {
 return <Command shouldFilter={false} value={items[active]?.id ?? ''} className="slash-menu absolute bottom-[calc(100%+8px)] left-0 z-30 h-auto w-full max-w-sm rounded-lg border p-1 shadow-md"><CommandList id="slash-options" aria-label="命令列表" className="max-h-[min(320px,40dvh)]">{[...new Set(items.map(item=>item.section))].map(section => { const grouped=items.filter(item=>item.section===section); return grouped.length ? <CommandGroup heading={section} key={section} aria-label={section}>{grouped.map(item => <CommandItem key={item.id} value={item.id} id={`slash-option-${items.indexOf(item)}`} disabled={locked && !!item.value} onMouseDown={e=>e.preventDefault()} onSelect={()=>select(item)} className="gap-3 py-2.5 text-xs"><item.icon className="size-4 text-muted-foreground"/><span className="flex-1">{item.label}</span>{item.value && item.key ? context[item.key]===item.value && <Check className="size-3.5"/> : <ChevronRight className="size-3.5 text-muted-foreground"/>}</CommandItem>)}</CommandGroup> : null })}{!items.length && <div className="p-4 text-center text-sm text-muted-foreground">没有匹配的命令</div>}</CommandList></Command>
}


