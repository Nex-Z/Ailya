import { useProviders,modelKey,modelLabel } from '../providers'
import { Folder, Bot, Cpu, Terminal, BookOpen } from 'lucide-react'
import type { Context } from '../store'
export const commands = [
 { key: 'workspace' as const, label: '工作空间', command: '/workspace', description: '选择这次会话的工作目录', icon: Folder, values: ['Ailya', 'openEagle', '个人空间'] },
 { key: 'agent' as const, label: '伙伴与团队', command: '/agent', description: '选择 Ailya、专业角色或 Agent 团队', icon: Bot, values: ['Ailya', 'Coder', 'Reviewer', 'Tester', 'Dev Team'] },
 { key: 'model' as const, label: '模型', command: '/model', description: '选择本次对话使用的模型', icon: Cpu, values: ['默认模型', '快速响应', '深度思考'] },
]
export type CommandItem = { id: string; label: string; description: string; icon: typeof Folder; key?: keyof Context; value?: string; section: string; prompt?: string }
const toolItems: CommandItem[] = [
 { id: 'schedule', label: '/schedule', description: '定时任务', icon: Terminal, section: '工具', prompt: '创建定时任务：' },
 { id: 'terminal', label: '/terminal', description: 'Shell 命令', icon: Terminal, section: '工具', prompt: '请帮我规划需要执行的 Shell 命令：' },
 { id: 'skill', label: '/skill', description: '代码审查 Skill', icon: BookOpen, section: '工具', prompt: '请使用代码审查 Skill 检查项目：' },
]
export function getCommandItems(query: string, roles?: string[]): CommandItem[] {
 const text = query.replace(/^\//, '').toLowerCase()
 const category = commands.find(c => text.startsWith(c.command.slice(1) + ' '))
 if (category) { const search = text.slice(category.command.length).trim(); return (category.key === 'agent' && roles ? roles : category.key === 'model' ? ['默认模型',...useProviders.getState().items.flatMap(p=>p.models.map(m=>modelKey(p.id,m)))] : category.values).filter(v => v.toLowerCase().includes(search)).map(value => ({ id: `${category.key}-${value}`, label: category.key==='model'?modelLabel(value):value, description: category.label, icon: category.icon, key: category.key, value, section: '上下文' })) }
 return [...commands.map(c => ({ id: c.key, label: c.command, description: c.description, icon: c.icon, key: c.key, section: '上下文' })), ...toolItems].filter(c => `${c.label} ${c.description} ${c.section}`.toLowerCase().includes(text))
}






