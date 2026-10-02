# Test 方案

## 当前可执行与未来验收

实施更新：首个 Core 与最小 Session 重放现已可运行；新增命令、真实证据和边界见 [阶段记录](../implementation/phase-1.md)。以下原型测试分类保留作冻结基线参考；不表示新增 Core 能力已覆盖所有未来场景。

当前可运行 `npm run build`、`npm run lint`、`bun test tests/core` 及按场景选择的 Playwright 测试。真实浏览器测试需启动 Core 与 Vite；冻结原型用例不能全部直接用于生产接线验收。Core/SQLite、模型边界、真实服务及 Session 重放已部分建立，具体证据见阶段记录和 [Group 阶段](../implementation/group-execution.md)，不代表未来场景全部完成。

| 层级 | 用途 | 什么时候运行 |
|---|---|---|
| 文档/Skills | 链接、frontmatter、事实与命令 | 规范变更 |
| build/lint | 类型、构建、静态问题 | TypeScript/配置变更 |
| 原型 Playwright | 键盘、会话隔离、提问、折叠、目录选择 | 对应 UI/状态变化 |
| Core 行为测试（已建） | 状态转换、事件排序、权限、调度边界 | 对应逻辑变化 |
| SQLite 集成（已建） | 迁移、事务、重启、向量作用域及恢复 | 存储变化 |
| 无密钥事件回放（部分） | Core 事件经真实前端消费后输出 | 事件/消息渲染变化 |
| Session 执行重放（部分） | 录制模型驱动真实 Core/Pi/工具/SQLite | 执行、工具、请求、持久化及恢复变化 |
| 真实服务端到端（部分） | 模型、MCP/Pi、IM、文件实际执行 | 对应真实能力验收 |
| 发布产物 smoke（待建） | 打包后扩展、路径、进程与数据目录 | 构建/发布路径变化 |

## 现有测试选择

- 输入/附件/快捷键：composer-drop、review-followup、prototype。
- 提问/时间/拒答：questions、task-rules、review-followup。
- 工具/团队/耗时/差异：assistant-ui、complex、agent-panel、file-diff。
- 设置/厂商/资源：settings、providers、resources、review-fixes。
- Agent/Group：agent-library、agent-multiselect。

文件均为 tests/ 下的 `.spec.ts`。先选相关测试；共享状态、公共渲染改变或版本冻结时运行全套。通过后没有新变化不重复跑。计数只是一次运行事实，不是永久质量指标。

## 运行与证据

```powershell
# 静态检查：执行 lint + build
powershell -NoProfile -File scripts/quality-check.ps1 -Lane static
# 针对性浏览器检查：需已启动当前项目页面
powershell -NoProfile -File scripts/quality-check.ps1 -Lane browser -TestFiles tests/questions.spec.ts
# 需要全套浏览器验证时显式选择
powershell -NoProfile -File scripts/quality-check.ps1 -Lane browser -AllBrowser
```

脚本默认不跑全套，不安装依赖、不启动服务、不提交/发布。结果保存在忽略目录 artifacts/quality/，包括运行命令、退出码、源码指纹和日志。命令成功不代表无跳过，审查者仍需核对日志测试数量/skip。缺少依赖或服务时如实失败，不降低断言。

## 测试强度和稳定性

验收先于实现；回归测试应能在有缺陷版本失败（可在隔离副本验证，不能破坏工作区）。不测试“函数返回自己刚写入的常量”来证明业务正确。权限拒绝需观察外部操作未发生；文件差异需对比真实文件；向量检索需独立已知排序。

计时用可控时钟，竞态用屏障或事件制造真实重叠；不用 sleep 碰运气。测试资源私有临时目录、独立数据库和端口；立即注册清理并等待进程/句柄退出。恢复时间、环境变量和网络拦截。

不能以加重试、串行全部测试、放宽断言、更新全部快照掩盖缺陷。真实服务瞬时失败可在记录原因后有界重试，报告次数和首次失败。没有凭据标未运行，不能伪造成通过；不得把凭据写入报告。

## Core 必须补齐的场景

正常完成；第一次工具失败后修复；用户停止和子任务取消；问题超时/拒答/迟到回答；重试不重复外部写；浏览器关闭后任务继续；Core 重启后任务恢复或准确终止；WebSocket 断线/重复/乱序；SQLite 迁移失败保持原库；向量维度错误、工作空间隔离、原文删除；定时任务跨时区与离线错过；IM 重复投递与多账号权限隔离。

记录事件回放输入与预期输出版本，脱敏并保留时间关系，不自动覆盖基线。人工复核后才能接受刻意改变的行为；mock 回放不替代上述真实执行证据。

## Session 与其他质量层

两层重放、fixture、录制/刷新和反例要求见 [Session 重放](session-replay.md)。模型可见或执行行为的非平凡变化必须随功能交付对应 Session 场景；没有运行器时应在该能力接入中补建，不能永久用 UI mock 顶替。

CI、覆盖、性能和上游差异见 [DSH 核对](dsh-comparison.md)。这些层级尚未实现，不要调用不存在的命令或报告其通过。


上下文与学习能力接入时，落实 [记忆验收场景](../context-memory.md)：压缩竞态、约束保留、显式/推断偏好冲突、删除与晚到索引、作用域隔离、开关和恢复。Session 重放固定摘要/提取模型响应并检查实际请求及 SQLite；真实摘要质量单独评估。

