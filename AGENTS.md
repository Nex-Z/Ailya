# Ailya 项目开发约定

## 开始工作

先读 README.md、docs/production-contract.md；修改交互时读 docs/prototype-freeze-v1.0.0.md；涉及数据读写时读 docs/storage-architecture.md。以当前代码核实状态，不把规划文档当成已实现功能。

在现有项目上继续实现正式版，复用页面和组件，不另起一套前端。冻结标签 prototype-v1.0.0（292f432）和 releases/prototype-v1.0.0 不移动、不覆盖。新开发不要求修改冻结版本号。

## 产品和技术边界

- Web-first、本地优先。浏览器负责展示，常驻 Core 负责执行；默认本机，远程机器为后续能力。
- 前端沿用 React、TypeScript、Vite、Tailwind、shadcn/ui、assistant-ui；Zustand 管理瞬时 UI 状态，接入服务端后可用 TanStack Query。
- Core 计划使用 Bun + TypeScript、Pi Runtime、Hono、WebSocket、Zod、SQLite + Drizzle。验证实际 Pi API 后接入，不凭猜测搭替代运行时。Python 仅用于需要它的工具。
- 正式业务数据必须在 Core 管理的 SQLite 中持久化，必须支持向量写入、检索及生命周期管理。不得以 localStorage、JSON 文件或内存替代正式数据库。
- 本项目的 .agents/skills 是开发辅助 Skills，不是 Ailya 产品中用户安装的运行时 Skills；两者不要混用。

## 界面和执行约束

保持冻结版布局和交互，使用现有组件；未经要求不新增说明性小字，不改整体配色。真实数据替换样例，不能删掉对应功能来完成接入。运行时规则以 production-contract.md 为准。

关闭浏览器继续执行、停止无回滚、重试覆盖、问题超时、子任务、权限、真实差异必须由 Core 状态和事件支持。前端定时器和模拟回复不能作为生产验收。

## 实现与交付

按可验证的端到端功能推进：数据迁移、Core 服务、事件/API、前端接线、验证。新增接口用 Zod 校验，错误和未实现能力如实反馈。不得把真实密钥、数据库、用户附件、向量或日志提交到 Git。

数据库升级必须有版本化迁移和旧数据保留验证；不能用清库或重置浏览器数据掩盖问题。备份应能恢复业务关系和向量索引。

代码变更运行适用的 build、lint 和行为测试；涉及界面检查桌面/窄屏。文档变更检查链接和事实即可，不为低影响文案写镜像测试。报告已实现、验证结果和未完成边界。

Windows 使用 PowerShell，不使用 rg；查找用 Get-ChildItem / Select-String。补丁分批落地，避免命令长度限制。保留用户未提交修改。

## 项目 Skills

按任务读取对应文件，不要求每次加载全部：

- .agents/skills/ailya-feature-delivery/SKILL.md：把原型功能接成真实端到端能力。
- .agents/skills/ailya-sqlite-vector/SKILL.md：数据库、迁移、向量检索与备份。
- .agents/skills/ailya-prototype-parity/SKILL.md：对照冻结版做交互实现和验收。

## 自迭代与审查

工程流程见 docs/quality/README.md，审查见 docs/quality/review.md，验证见 docs/quality/testing.md。按需使用 ailya-iterate、ailya-review、ailya-test、ailya-learn。已授权工作自主实现和修复；人工复核面向具体结果，不逐步索要许可。自审与独立审查如实区分。

变更时结合当前代码、相关文档和验证结果辨别文档及 Skills 是否需要同步，按 [按需同步文档与 Skills](docs/quality/README.md#按需同步文档与-skills) 执行。需要更新时先说明范围、原因和具体内容，获得用户明确确认后再写入，事实纠错也一样；已有明确授权覆盖的范围不重复询问，新增范围另行确认。无影响则直接继续，不询问、不记录，也不为每次改动遍历全部文档和 Skills。

经验按 .agents/lessons/README.md 管理：候选先验证，未经用户明确采纳不提升为约束性规则。不自动修改全局记忆、冻结基线或验收门槛；不以通过测试取代真实功能验收。

## 产品上下文与记忆

实现上下文、压缩、用户偏好或长期学习前读取 docs/context-memory.md。产品记忆属于 Core/SQLite，与 .agents/lessons 开发经验分离。压缩不得改变权限、截止时间和任务状态；推断偏好不得覆盖用户明确纠正，删除必须覆盖向量、缓存和派生摘要。
