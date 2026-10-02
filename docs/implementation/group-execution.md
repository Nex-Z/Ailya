# Group 真实执行阶段（2026-09-29）

## 可运行范围

现有 Group 页面创建/编辑配置，@ 或详情页新建会话，选定协调者通过 Pi 的 delegate_agent 工具委派配置中的成员。成员有独立的 Pi 上下文和模型配置，使用主会话的工作空间与权限；成员默认模型继承主会话模型，显式模型使用成员配置。成员不得委派到组外或递归生成团队。

主会话统一展示进度、授权、最终结果和真实文件变更；原团队侧面板显示成员任务、回复及工具执行状态。子会话不进入侧栏，不能通过 send/stop/delete/model-selection/reasoning API 单独操作。主会话停止向子任务传递取消，并等待它清理；已提交文件不回滚。主、子 Token 用量都来自各自真实模型事件。

SQLite v5 的 group_runs 保存父会话/父任务/工具调用/子会话/子任务/成员关系，和子任务创建同一事务提交。同一父任务的调用 ID 不能重复执行；HTTP 幂等请求不会再次生成子任务。重试是新的任务，保留旧审计，不假设文件回滚。删除主会话清理所属子任务数据；Core 重启将未完成父子任务标为 interrupted，并恢复成员面板状态，不自动重新执行工具。

## 证据

- `bun test tests/core`：50 项通过，345 断言，包含本次 6 项 Group 回归；之后新增 v4→v5 迁移及成员模型失败测试，与 Group 测试一起运行 8 项 / 46 断言通过。
- `npx playwright test tests/group-live.spec.ts`：最终与单 Agent 真实浏览器测试并行运行，两项通过。真实 DeepSeek，现有 Group 编辑页创建、成员调用、只读面板、刷新恢复、桌面和 390px 窄屏通过。测试对象已删除。
- `bun scripts/session/phase3.ts replay artifacts/session-candidates/group-execution.json`：真实 Core/Pi/SQLite/权限/工具链重放 5 次录制模型请求；独立临时目录生成 proof.txt，内容 phase3-proof，Shell、ls、find、search_files 均真实执行。验证父子 task ID 不同、链接正确、双方 completed、主会话收到变更。
- 录制来自一次真实 DeepSeek 执行；候选文件仍待人工复核，未移动冻结标签、覆盖冻结产物或自动接受候选。
- `bun scripts/session/verify-phase3.ts artifacts/session-candidates/group-execution.json`：请求不匹配、缺响应、多响应、额外文件、未知格式、成员配置不匹配 6 项负向控制均被拒绝。运行器已支持显式候选路径，未误用旧默认场景。
- build/lint 通过；Vite 保留既有 bundle 体积提示。Windows SQLite vec_version v0.1.9，实际 Core 已升级 v5，升级前自动备份。

## 自审与修复

作者自审，不冒充独立审查。基线与冻结标签均为 292f43298c224e120e519afca3526bf5ef7c7fbe；保留此前全部未提交工作。

- R-01：子会话可被普通会话 API 修改。已通过 Core/API 双层检查与只读回归关闭。
- R-02：重启后父面板仍显示成员运行中。已从持久化子任务恢复状态，重启回归通过。
- R-03：自定义模型改写原始请求上下文，使相同 requestId 重发被错误拒绝。已复制执行上下文，协调者独立模型与幂等回归通过。
- R-04：删除 Group 后旧会话可能静默退化为协调者单独运行。现在明确拒绝，回归通过。
- R-05：停止和失败状态/子回复 JSON 展示。面板识别已停止，真实进度存在时展示任务与回复而非重复 JSON。

## 当前边界

协调者按 Pi 顺序执行委派工具，未实现并行成员调度或多层团队树。侧面板为文本记录与工具状态，不是第二个可输入聊天窗口。运行时 Skills/Pi 扩展、压缩/长期记忆、IM、语音不在本阶段完成范围。旧样例含未实现 Skills/Git 时会明确拒绝启动，需要移除这些配置后执行。定时任务暂仍限制内置 Ailya。

人工复核可新建两个 Skills 留空的 Agent，Group 选协调者与成员，然后要求团队委派任务。展开耗时下的成员卡片查看进度；执行时点击停止，再刷新核对状态。人工状态仍 pending。
