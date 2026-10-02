---
name: ailya-review
description: 对 Ailya 改动进行只读代码自审、功能审查，或整理供人工复核的具体结果和证据时使用。
---

读项目根目录 docs/quality/review.md。记录真实 baseline、head 和脏工作区范围，查看接口两端与持久化/事件消费者。作者的通过声明不是证据。

优先数据、权限、生命周期和承诺行为，再看局部 UI。每条 finding 写可复现触发、位置、后果与证据；推测标待验证，风格建议不冒充阻塞缺陷。仅审查时不改代码。

确认测试是否覆盖真实入口与失败路径、是否在当前版本执行；不因通过数量多就判定生产完成。同一 Agent 的复查标 self-review，不冒充独立审查。

依据 docs/quality/templates/human-review.md 给用户具体页面或差异、操作步骤和未覆盖项。没有用户明确回复不记录 accepted；不重复索要既有授权。

涉及 Session 或模型可见内容时读 docs/quality/session-replay.md；检查 prompt/schema、录制流与实际持久化/工作区结果的证据链。按 docs/quality/dsh-comparison.md 区分已补方案与已运行能力，不将未建立 CI 或性能基准写成通过。
