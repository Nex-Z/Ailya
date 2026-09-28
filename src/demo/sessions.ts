import { complexSession } from './complex'
import type { Session, Message } from '../store'
const context = { workspace: 'Ailya', agent: 'Ailya', model: '默认模型' }
const user = (id: string, text: string, files?: string[]): Message => ({ id, role: 'user', text, files })
const reply = (id: string, text: string, extra: Partial<Message> = {}): Message => ({ id, role: 'assistant', text, ...extra })
const tool = (id: string, toolName: string, args: Record<string, string>, result: string, isError = false) => ({ type: 'tool-call' as const, toolCallId: id, toolName, args, argsText: JSON.stringify(args), result, isError })
export const demoSessions: Session[] = [complexSession,
 {id:'demo-questions',title:'提问 · 多问题确认',context,group:'历史会话',questionRequest:{id:'demo-questions-request',agent:'Ailya',questions:[
 {id:'scope',recommendedOptions:['聊天交互'],title:'这次先完成哪部分？',kind:'choice',options:['聊天交互','Agent 管理','定时任务']},
 {id:'checks',recommendedOptions:['构建','交互测试'],title:'需要执行哪些检查？',kind:'multiple',options:['构建','代码审查','交互测试']},
 {id:'requirements',title:'有哪些必须保留的交互？',kind:'text'},
 {id:'validation',recommendedOptions:['都需要'],title:'优先验证哪些设备？',kind:'mixed',options:['桌面','手机','都需要']}
 ]},messages:[user('questions-u','开始之前，先和我确认这次迭代的范围。'),reply('questions-a','有三个问题需要你确认。')]},
 { id:'demo-team-progress',title:'团队 · 工作状态',context:{...context,agent:'Dev Team'},group:'历史会话',messages:[
 user('progress-u','让团队检查这次修改，展示各自的工作进度。'),
 reply('progress-a','团队正在处理任务。', {parts:[
 tool('progress-c','delegate_agent',{agent:'Coder',task:'实现输入框调整'},'已完成组件修改，交给 Reviewer 检查。'),
 tool('progress-r','delegate_agent',{agent:'Reviewer',task:'审查输入与上下文边界',executionStatus:'running',progress:'已检查上下文锁定，正在核对中文输入法处理。'},''),
 tool('progress-t','delegate_agent',{agent:'Tester',task:'验证窄屏和键盘操作',executionStatus:'error'},'窄屏下发现工具列表遮挡发送按钮，需要调整后重新验证。',true)
 ]})
 ]},
 { id: 'demo-markdown', title: '排版 · 项目计划与对比', context, group: '历史会话', messages: [
  user('md-u', '帮我把 Ailya 第一版的范围整理成计划，带对比表和验收清单。'),
  reply('md-a', `## 先把一次对话做好

第一版聚焦 **会话 → 执行 → 交付**。把复杂能力收进按需入口，保持聊天界面安静。

### 实现顺序
1. **前端体验**：上下文选择、流式消息、工具过程。
2. **本地 Core**：连接工作目录，提供明确的执行边界。
3. **Agent 协作**：主会话统一汇总，内部过程可以展开。

| 能力 | 第一版 | 后续 |
| :--- | :--- | :--- |
| 工作目标 | Local 本机 | 可选远程 Runner |
| 会话体验 | 单 Agent + 团队展示 | 真实团队调度 |
| 文件操作 | 附件 | Core 文件访问 |

> 会话是工作的入口。上下文应当稳定，执行过程应当可追踪。

### 验收清单
- [x] 独立选择工作空间与角色
- [x] 输入框右侧选择模型
- [ ] 接入真实模型与 Core
- [ ] 验证断线恢复

本文为**项目计划**。技术参考：[assistant-ui 文档](https://www.assistant-ui.com/docs)。`),
  user('md-u2', '哪些事情暂时不做？'),
  reply('md-a2', '暂缓远程机器管理、常驻右侧信息栏和复杂 Dashboard。\n\n先确保这条路径顺畅：`新建会话 → 选择上下文 → 发送 → 查看过程 → 恢复会话`。')
 ] },
 { id: 'demo-code', title: '代码 · 实现与修改对比', context: { ...context, agent: 'Coder' }, group: '历史会话', messages: [
  user('code-u', '给我一个锁定会话上下文的 TypeScript 示例，顺便展示修改对比。'),
  reply('code-a', `可以把限制放在状态更新入口，让所有界面入口遵循同一规则。

### TypeScript
~~~typescript
type Context = { workspace: string; agent: string };
type Session = { context: Context; messages: unknown[] };

function updateContext(session: Session, patch: Partial<Context>) {
  if (session.messages.length > 0) return session;
  return { ...session, context: { ...session.context, ...patch } };
}
~~~

### 修改对比
~~~diff
- set({ context: nextContext });
+ if (session.messages.length === 0) {
+   set({ context: nextContext });
+ }
~~~

### 验证命令
~~~powershell
npm run build
npm run lint
npx playwright test
~~~

这里只展示代码，没有修改文件或运行命令。试试代码块右上角的复制按钮。`)
 ] },
 { id: 'demo-tools', title: '工具 · 文件、Shell 与失败', context, group: '历史会话', messages: [
  user('tools-u', '看看项目结构，再检查构建情况。'),
  reply('tools-a', '查看项目结构和构建结果。', { parts: [
   { type: 'text', text: '先查看目录，再检查项目配置与构建。' },
   tool('read-1', 'read_directory', { path: './src' }, 'components/\nruntime/\ndemo/\nApp.tsx\nstore.ts'),
   tool('read-2', 'read_file', { path: './package.json' }, '{ "scripts": { "build": "tsc -b && vite build" } }'),
   tool('shell-1', 'shell', { command: 'npm run build' }, 'Exit code: 1\nTS2307: Cannot find module ./missing-module', true),
   { type: 'text', text: '### 检查结果\n\n构建遇到了一个**缺失模块**错误。应先确认导入路径或恢复文件，再重新验证。\n\n' }
  ] })
 ] },
 { id: 'demo-team', title: '团队 · Coder / Reviewer / Tester', context: { ...context, agent: 'Dev Team' }, group: '历史会话', messages: [
  user('team-u', '让团队评估这次输入框调整，最后给我统一结论。'),
  reply('team-a', '', { parts: [
   { type: 'text', text: '把评估分给三个角色，结果统一汇总在这里。' },
   tool('agent-1', 'delegate_agent', { agent: 'Coder', task: '实现上下文下拉与模型选择' }, '将 ContextBar 和 Composer 分离；模型选择位于发送按钮前。'),
   tool('agent-2', 'delegate_agent', { agent: 'Reviewer', task: '检查边界和一致性' }, '首条消息后锁定上下文；所有入口使用同一状态更新方法。'),
   tool('agent-3', 'delegate_agent', { agent: 'Tester', task: '验证键盘与窄屏交互' }, '建议覆盖 Enter、Shift+Enter、中文输入法、Esc、390px 宽度与长模型名。'),
   { type: 'text', text: '## 团队结论\n\n方案可以继续迭代。界面保持 **独立下拉 + 按需命令列表**，需要重点检查中文输入法和窄屏布局。\n\n- Coder：组件边界清晰\n- Reviewer：锁定规则一致\n- Tester：补齐交互场景\n\n' }
  ] })
 ] },
 { id: 'demo-attachments', title: '附件 · 图片与文档', context, group: '历史会话', messages: [
  user('file-u', '参考这张布局草图和需求文档，整理界面建议。', ['layout-sketch.svg', 'Ailya-requirements.pdf']),
  reply('file-a', '', { parts: [
   { type: 'text', text: '这是一张内置的**布局示意图**，用来验证图片消息的展示。' },
   { type: 'image', image: '/demo-layout.svg' },
   { type: 'text', text: '### 布局建议\n\n1. 会话列表固定在左侧。\n2. 主区域聚焦消息内容。\n3. 上下文在输入框上方轻量展示。\n4. 模型下拉靠近发送按钮。\n\n你也可以添加自己的附件，当前只保留文件名，不会上传或解析文件。' }
  ] })
 ] },
 { id: 'demo-error', title: '异常 · 连接失败与重试', context, group: '历史会话', messages: [
  user('error-u', '继续整理这份项目计划。'),
  reply('error-a', '已收到你的需求，正在准备回复。', { error: '连接超时：未能完成回复。你的消息已保留，可点击重试。' })
 ] },
 { id: 'demo-stopped', title: '中断 · 停止后继续', context, group: '历史会话', messages: [
  user('stop-u', '写一份详细的实现步骤。'),
  reply('stop-a', '## 实现步骤\n\n1. 明确会话的数据结构。\n2. 接入聊天运行时。\n3. 将消息划分为文本、工具调用和附件。\n\n接下来准备进一步展开验证方案……', { stopped: true })
 ] },
 { id: 'demo-long', title: '长对话 · 多轮上下文', context, group: '历史会话', messages: Array.from({ length: 8 }, (_, i) => [
  user(`long-u${i}`, ['先从会话开始吧。', '工作空间怎么选？', '本机执行放在哪里？', '团队会不会挤满聊天？', '命令入口怎么做？', '工具失败怎么办？', '刷新后还能继续吗？', '帮我总结一下。'][i]),
  reply(`long-a${i}`, ['会话是这次工作的容器。创建时可以选工作空间和角色，首条消息发出后固定。', '通过输入框上方的工作空间下拉选择，也可以输入 `/workspace`。', '浏览器负责界面，本地 Core 负责文件、Shell 和工具执行。目前 Core 尚未连接。', '团队内部过程折叠展示，最终结果留在一个主会话中。无需变成多人聊天室。', '输入 `/` 打开命令列表，上下文和工具分区展示。支持筛选与键盘选择。', '保留失败信息与已完成的结果，让你看清哪一步需要重试。不会把失败显示成成功。', '当前会话保存在浏览器 localStorage。真实执行的恢复机制需要后续 Core 支持。', '### 已确定\n\n- 会话为核心，本地优先\n- 简洁聊天界面，独立上下文下拉\n- 多 Agent 内部协作，统一交付\n- 错误、中断和工具过程可见\n\n这段长对话用于检查滚动、阅读和继续输入的体验。'][i])
 ]).flat() }
]







