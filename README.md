# Ailya

个人 AI Agent 工作台，正在冻结原型基础上接入正式 Core。React + TypeScript + Vite + Tailwind CSS + shadcn/ui 源码组件 + assistant-ui + Zustand。

当前冻结基线：`prototype-v1.0.0`（2026-09-28）。正式版基于此代码继续开发，界面与交互以冻结版为验收参考。

- [冻结说明与功能验收清单](docs/prototype-freeze-v1.0.0.md)
- [生产实现约束](docs/production-contract.md)

## 开发

```powershell
npm ci
npm run dev
```

```powershell
npm run build
npm run lint
# 启动 localhost:5173 后
npx playwright test
```

首次测试可能需要 `npx playwright install chromium`。

当前提供会话、富文本/工具消息、团队面板、提问、附件、文件差异、Agent/Group、扩展、定时任务和设置的原型交互。未发送附件暂存在浏览器；发送成功后附件字节及归属存入 Core SQLite，可刷新后下载。发送快捷键支持 Enter 或 Ctrl+Enter。

首个真实 Core 会话阶段已接入，详见文末。调度和 MCP 已接入；IM、语音及运行时 Skills/Pi 插件仍未实装。浏览器中的模拟状态不得作为正式功能验收依据。

## 参考版

`releases/prototype-v1.0.0/` 包含源码包、可用 HTTP 静态服务器运行的构建包和校验清单；该目录不纳入 Git。冻结标签包含源码、锁文件、测试和交接文档。后续代码修改不改变冻结标签。

## 正式版开发规则

在当前项目继续实现，不重写前端。请先读 [AGENTS.md](AGENTS.md)。冻结标签不变，新增规范属于后续开发。

**业务数据统一存储在 Core 管理的 SQLite，必须支持向量写入和检索。** 计划使用 Bun + TypeScript、Pi Runtime、Hono、WebSocket、Zod、SQLite + Drizzle；sqlite-vec 为优先验证的向量扩展候选。配置、消息、任务、记忆及向量不得继续以 localStorage 作为正式主库。详见 [存储架构及验收](docs/storage-architecture.md)。当前已接入首个 Core / SQLite 会话链路，其余业务实体仍待逐阶段迁移。

仓库内开发 Skills 位于 `.agents/skills/`，随代码交接；支持该目录的 Agent 可发现并使用，其他工具可按 AGENTS.md 手动读取：

- [真实功能交付](.agents/skills/ailya-feature-delivery/SKILL.md)
- [SQLite 与向量存储](.agents/skills/ailya-sqlite-vector/SKILL.md)
- [冻结原型一致性验收](.agents/skills/ailya-prototype-parity/SKILL.md)

这些是开发此项目的 Skills，不是产品运行时的 MCP/Skills/Pi 插件。

## 自迭代、Review 与 Test

[工程流程](docs/quality/README.md)定义有界实现/自审/修复循环、人工复核和经验候选晋升；[Review](docs/quality/review.md)与[Test](docs/quality/testing.md)区分当前可运行检查和后续 Core 验收。

开发 Skills 新增 `ailya-iterate`、`ailya-review`、`ailya-test`、`ailya-learn`。执行 `powershell -NoProfile -File scripts/quality-check.ps1 -Lane static` 可生成带源码指纹的 lint/build 证据；针对性浏览器运行方式见 Test 文档。自动检查不自动批准代码、发布或规则变更。

Session 测试规划包含 [事件回放与真实执行重放](docs/quality/session-replay.md) 两层；[与 DSH 的差异核对](docs/quality/dsh-comparison.md)记录 CI、性能、录制和迁移的补充要求。当前已实现最小 Session 执行重放，完整格式/并发场景仍待补齐。

[上下文与记忆规范](docs/context-memory.md)定义后台压缩、预算、可追溯摘要，以及 Ailya 自身的记忆/偏好学习、纠正和删除。这是正式版需求，当前尚未实现；与仓库开发经验 Skills 分开。

## 首个真实执行阶段（2026-09-28）

当前代码已在原界面上接入独立 Bun Core：厂商配置、Windows DPAPI 凭据、SQLite 会话/任务/事件/请求、Pi 模型流、停止、WebSocket 重连、工作空间内文本读写及真实差异。其余页面保留原型，不能视作后端已完成。详见 [阶段记录及验收边界](docs/implementation/phase-1.md)。

需要 Bun 1.4.2（本次验证版本）及 Node/npm；安装依赖后，在两个终端运行：

```powershell
npm ci
npm run core
# 另一个终端
npm run dev
```

访问 http://127.0.0.1:5173 。Core 默认监听 127.0.0.1:4317；默认数据位于 `%LOCALAPPDATA%\Ailya\data\ailya.sqlite`，用 `AILYA_DATA_DIR` 自定义目录、`AILYA_WORKSPACE` 指定默认工作空间。Core 进程需持续运行；关闭浏览器不停止任务，尚未安装开机启动服务。不要同时启动两个 Core 访问同一数据库。

在「设置 → 模型与连接」添加 OpenAI Chat Completions 兼容厂商和模型。若启动环境提供 `DEEPSEEK_API_KEY`，Core 会在缺少 deepseek 厂商时创建环境凭据配置；密钥值不进入前端。手动填写的密钥用 Windows 当前用户 DPAPI 加密；备份在其他 Windows 用户/机器恢复时需重新提供凭据。聊天先用默认权限；默认权限下写入和编辑会等待逐次授权，可在设置中保存风险白名单。「所有权限」跳过逐次授权。文件工具限制在工作空间内；新接入的 Shell 和外部 MCP 是可信主机执行，不是目录沙箱，详见第三阶段边界。

```powershell
npm run build           # 包含 Core 与前端类型检查
npm run lint
npm run test:core       # 无在线模型调用
npm run test:browser:live # 需运行 Core/Vite 及可用 DeepSeek 凭据，会实际调用模型
npm run session:record:phase2  # 真实调用，写 artifacts/session-candidates；需 DEEPSEEK_API_KEY
npm run session:replay:phase2  # 无模型网络调用，候选必须已存在，否则失败
npm run session:verify:phase2  # 重放及负向控制；不刷新预期
```

旧 `tests/*.spec.ts` 的原型场景仍保留，依赖冻结版演示数据/localStorage，不能直接作为当前 Core 的验收；当前正式路径使用 `tests/production-core.spec.ts`、`tests/production-permissions.spec.ts` 和 `tests/production-tools.spec.ts`。没有宣称旧原型全套在正式运行时通过。录制候选需人工审查后再成为受版本管理的重放基线，目前未自动接受或建立 CI。

## 第二阶段：权限与附件

已接入默认权限的单次允许/拒绝、SQLite 白名单与授权记录、刷新恢复授权、停止及重启后的授权失效；附件字节持久化、隔离的文本读取及下载；复用 Pi 精确编辑并生成真实差异。数据库自动迁移至 v2，升级前保留备份。详见 [实现、验证和剩余边界](docs/implementation/phase-2.md)。旧 v1 录制候选保留为历史证据，其工具 schema 与当前版本不同，phase2 命令保留用于历史对比；新增工具后的当前验收使用第三阶段重放，新旧候选不自动替换。
## 第三阶段：基础工具、调度与 MCP

已接入 PowerShell、目录列表、文件名/内容搜索、Tavily 联网搜索、Core 定时任务和 MCP stdio / Streamable HTTP。配置继续使用现有页面，SQLite 自动升级到 v3。Tavily Key 在「设置 → 模型与连接」保存，也可通过 `TAVILY_API_KEY` 提供。详见[实现、测试、自审和边界](docs/implementation/phase-3-tools.md)。

```powershell
bun scripts/session/phase3.ts record  # 在线模型；写新的待审候选
bun scripts/session/phase3.ts replay  # 无模型联网；执行真实工具
bun scripts/session/verify-phase3.ts  # 负向控制，不刷新预期
npx playwright test tests/production-tools.spec.ts --workers=1 # 运行中的 Core/Vite 和 Tavily 凭据
```

## Agent / Group 执行（2026-09-29）

自定义 Agent 与 Group 已接入真实 Pi 执行，配置由 Core SQLite 管理。Group 支持成员独立模型、主会话统一授权、取消传播、只读成员进度与刷新恢复。详见 [Group 实施与验证](docs/implementation/group-execution.md) 和 [单 Agent 阶段](docs/implementation/single-agent.md)。运行时 Skills/Pi 扩展仍未完成；旧样例中的未支持配置不会被当作已实现能力。

## 真实提问与续跑（2026-10-02）

`ask_questions` 已接入 Core/Pi，支持单选、多选、文本、选择加补充及不自动选中的推荐项。SQLite v6 保存问题批次、固定 30 秒截止时间、回答草稿及回答；关闭页面不影响超时停止。超时或 Core 重启后保留问题，完整提交后从工具记录继续原任务，保留任务 ID、原始开始时间和已完成文件操作；拒答回到普通输入框。Group 成员的问题由主会话回答，续跑和停止覆盖主子任务。详见 [实现与验证](docs/implementation/questions-resume.md)。

```powershell
bun test tests/core/questions.test.ts tests/core/questions-restart.test.ts
bun scripts/session/questions.ts record # 真实 DeepSeek，写新的待审候选；默认目标已存在时拒绝覆盖
bun scripts/session/questions.ts replay # 无模型联网，执行真实 Core/Pi/SQLite/文件工具
bun scripts/session/verify-questions.ts  # 请求、响应、文件、截止时间及版本负向控制
```
