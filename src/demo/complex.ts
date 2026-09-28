import { fileChanges } from './file-changes'
import type { Session, Message } from '../store'
const text=(text:string)=>({type:'text' as const,text})
const call=(id:string,name:string,args:Record<string,string>,result:string,error=false)=>({type:'tool-call' as const,toolCallId:id,toolName:name,args,argsText:JSON.stringify(args),result,isError:error})
const assistant=(id:string,parts:NonNullable<Message['parts']>,extra:Partial<Message>={}):Message=>({id,role:'assistant',text:'',...(id==='cx-a3'?{fileChanges}:{}),durationMs:id==='cx-a1'?32000:id==='cx-a2'?48000:27000,parts,...extra})
export const complexSession:Session={id:'demo-complex',title:'复杂任务 · 项目修复与交付',group:'历史会话',context:{workspace:'Ailya',agent:'Dev Team',model:'默认模型'},messages:[
 {id:'cx-u1',role:'user',text:'修复附件上传偶发丢失的问题，兼顾移动端。先分析，再修改和测试，最后给我交付清单。',files:['bug-report.md','mobile-log.txt']},
 assistant('cx-a1',[
 text('我先检查附件状态和发送路径，再让 Reviewer 与 Tester 分别检查边界和复现条件。'),
 call('cx-1','read_file',{path:'bug-report.md'},'复现：拖入两个文件 → 删除第一个 → 切换会话 → 返回并发送，附件列表偶尔为空。'),
 call('cx-2','shell',{command:'git status --short'},' M src/components/Composer.tsx'),
 text('输入区存在尚未提交的修改。我会先读差异，避免覆盖已有工作。'),
 call('cx-3','shell',{command:'git diff -- src/components/Composer.tsx'},'现有修改：调整麦克风按钮位置；未改变附件状态。'),
 call('cx-4','read_file',{path:'src/components/Composer.tsx'},'附件保存在组件 state 中，切换会话后组件卸载。发送操作引用当前 files 数组。'),
 text('问题集中在会话切换后的附件生命周期。现在并行检查状态隔离和移动端行为。'),
 call('cx-5','delegate_agent',{agent:'Reviewer',task:'检查附件状态边界及会话间隔离'},'建议按 sessionId 保存附件；移除文件时释放预览 URL；发送前复制附件快照。'),
 call('cx-6','delegate_agent',{agent:'Tester',task:'复现切换会话与窄屏附件操作'},'已复现切换会话丢失附件；390px 下长文件名挤压删除按钮。'),
 text('需要确认一个行为：切换会话时，未发送的附件是否保留？')]),
 {id:'cx-u2',role:'user',questionAnswer:true,text:'保留，每个会话独立保存。刷新后的文件恢复暂时不做。'},
 assistant('cx-a2',[
 text('按这个边界实现：保留每个会话的待发附件，刷新不恢复本地文件。先改状态管理，再处理布局。'),
 call('cx-7','delegate_agent',{agent:'Coder',task:'实现会话级附件草稿和窄屏布局'},'新增 attachmentDrafts，以 sessionId 隔离；保持麦克风位置不变；文件名截断，删除按钮固定宽度。'),
 call('cx-8','shell',{command:'npm run build'},'Exit code: 1\nTS2345: File[] is not assignable to AttachmentDraft[].',true),
 text('第一轮构建失败，原因是新旧附件类型不一致。我先修正转换边界，再跑同一条检查。'),
 call('cx-9','read_file',{path:'src/attachments.ts'},'AttachmentDraft = { id: string; file: File; previewUrl?: string }'),
 call('cx-10','apply_patch',{path:'src/components/Composer.tsx'},'将拖入的 File 转成 AttachmentDraft；发送前读取 draft.file。'),
 call('cx-11','shell',{command:'npm run build'},'Exit code: 0\nTypeScript 检查通过，生产构建完成。'),
 text('构建通过。接下来检查实际交互：添加、移除、切换会话、发送以及窄屏布局。'),
 call('cx-12','shell',{command:'npx playwright test attachments'},'Exit code: 1\n5 passed, 1 failed\n移动端：删除按钮被长文件名覆盖。',true),
 call('cx-13','delegate_agent',{agent:'Tester',task:'定位移动端删除按钮遮挡',executionStatus:'error'},'文件项缺少 min-width: 0，长名称撑开容器。需要限制文本宽度。'),
 text('发现一个布局问题，附件状态检查已通过。我会只调整文件名容器。')],{stopped:true}),
 {id:'cx-u3',role:'user',text:'继续，保留之前通过的结果。'},
 assistant('cx-a3',[
 text('从移动端布局修复继续，沿用已通过的状态检查结果。'),
 call('cx-14','apply_patch',{path:'src/components/AttachmentList.tsx'},'文本容器添加 min-w-0 和 truncate，删除按钮添加 shrink-0。'),
 call('cx-15','shell',{command:'npx playwright test attachments --project=mobile'},'Exit code: 0\n2 passed：长文件名、删除最后一个附件。'),
 text('移动端检查通过，现在复核整体回归和资源释放。'),
 call('cx-16','delegate_agent',{agent:'Reviewer',task:'复核最终差异及预览资源释放'},'会话隔离正确；删除和发送后释放 URL；已有麦克风布局修改得到保留。'),
 call('cx-17','shell',{command:'npm run build && npx playwright test attachments'},'Exit code: 0\nBuild passed\n6 passed'),
 text('## 交付结果\n\n- 已修复切换会话丢失待发附件\n- 各会话附件独立保存\n- 已修复窄屏长文件名遮挡删除按钮\n- 保留原有麦克风布局修改\n\n| 验证 | 结果 |\n| --- | --- |\n| 生产构建 | 通过 |\n| 附件交互 | 6 项通过 |\n| 代码复核 | 通过 |\n\n刷新后恢复文件不在本次范围内。修改尚未提交。')])
]}



