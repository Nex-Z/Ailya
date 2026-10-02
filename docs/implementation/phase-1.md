# Phase 1 — Core 会话闭环

- 授权：当前项目实现、测试及 self-review；人工复核 pending。
- 基线：292f43298c224e120e519afca3526bf5ef7c7fbe；冻结标签解引用一致。
- 开始时已有 README/production-contract 修改及 .agents、AGENTS、context-memory、quality、storage-architecture、scripts 未跟踪文件，全部保留。
- 范围：Bun/Pi/Hono、SQLite 迁移、厂商配置、流式会话、取消、重连、隔离文件工具、最小执行重放与向量兼容性验证。
- 验收：正式 API 驱动 Pi；SQLite 重启可读；断开客户端不取消；停止后不执行新工具；重放匹配请求及真实文件；配置凭据不回传。
- 风险：真实模型/embedding 需要服务配置；其他原型功能逐阶段接入，不能视作生产可用。
- 状态：implementing。

## 阶段顺序
1. 执行与数据底座及首个会话闭环。
2. 权限交互、完整文件/附件、Agent/Group、扩展及子任务。
3. 调度、IM、语音、Token 完整统计。
4. 上下文压缩、长期记忆、偏好学习与生命周期。
5. 发布产物、恢复、完整 UI 和真实服务验收。

## 当前实现及限制

已落地：
- Core 独立进程、Hono + Zod API、SQLite WAL/外键/版本化首次迁移、Drizzle 会话 repository、数据库进程锁。
- Pi `@earendil-works/*` 0.87.1：Agent 循环、OpenAI Completions 适配器、read/write 工具。旧 `@mariozechner/*` 已从依赖移除；npm audit 当次 0 漏洞。实际 API 以安装包 .d.ts 与源码核对。[官方 Agent 文档](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)。
- 厂商/凭据、会话、任务、事件、模型请求快照和 Pi transcript 入 SQLite；前端只保留瞬时会话投影，sessionStorage 保存活动会话 ID（展示偏好）。不导入/删除旧原型 localStorage，也不自动把演示历史当生产历史。
- 真实模型流式回复、停止、刷新/断线重连；断开 WebSocket 不影响 Core；Core 重启把在途任务标记 interrupted，不偷偷重跑工具。
- 重试替换最后可见回复，保留旧任务/事件审计；已写文件不回滚，相同文本覆盖写不重复落盘。复杂外部副作用重试、逻辑任务/attempt 的完整模型仍需后续扩展。
- 工作空间内真实文本 read/write、路径及符号链接限制、实际 diff 行数，复用现有工具折叠及差异弹窗。默认权限拒绝写入，全权限可写；Shell/逐次授权尚未接入。
- sqlite-vec 0.1.9 的 SQLite 距离查询、作用域/模型/修订/维度隔离、更新删除、重启及一致性备份恢复。当前范围查询为精确距离排序，未宣称大规模性能。
- Token 页展示 Pi 返回的真实用量；尚未提供价格结算、独立 Agent 统计及完整时间段时区语义。

尚未完成：
- 附件上传、目录选择完善、默认权限授权/白名单、问题与继续、子 Agent、完整 Agent/Group、MCP/Skills/Pi 扩展、调度、微信/其他 IM、语音、压缩/记忆/偏好学习。
- 上述页面的配置仍是保留的原型，不能作为正式业务主库或执行证据。所有业务迁移到 SQLite 的项目目标尚未全部达成。
- 聊天目前仅接 OpenAI Completions 兼容协议；模型上下文暂用保守元数据，完整预算/超限处理与后台压缩未验收。
- 无真实 embedding 服务配置，未验证在线 embedding；未实现产品记忆索引调度、删除抑制/晚到回写。向量底座通过不等于记忆功能完成。
- 当前 Core 为源码启动；只完成独立向量 smoke 产物验证，尚非完整应用安装包/发布验收，也未部署自启动服务。
- 最小重放在 HTTP 模型边界逐请求匹配并驱动正式 API/Pi/工具/SQLite；仅含单会话两次模型调用。完整 session.vN 格式、稳定 ID 规范化、子任务、时钟、迁移 fixture、refresh 和 CI 尚未完成。
- 录制候选位于忽略的 artifacts，人工审查 pending。没有接受 fixture、规则或冻结基线的自动动作。

## 自审与修复

类型：self-review；未执行独立审查。范围：当前脏工作区新增 Core、前端接线、测试与运行文档；用户原有规范全部保留。

- R-01：Drizzle prepare 句柄使默认 SQLite close 后 Windows 文件仍锁定。改为 close(true)，包括初始化失败路径；临时目录清理、重启/备份测试通过。
- R-02：任务结束事务最初只创建未调用，消息看似完成但 tasks 仍 running。真实执行重放揭示后修正调用；completed 状态与 transcript 用测试验证。
- R-03：页面刷新后选中全新空白草稿而未恢复历史。活动 ID 保存为展示偏好，初始快照恢复选择；浏览器刷新测试通过。
- R-04：文件工具路径检查必须落在 Pi 的绝对路径 operations 边界；读文件亦采用受控 operations，覆盖 ~ 展开、越界与取消测试。
- R-05：环境凭据不能因厂商改地址而被发往任意站点。DeepSeek 环境密钥限官方 origin；加密凭据换地址要求重新填写。
- R-06：第二个 Core 不能将第一个仍运行的任务标 interrupted。增加数据库进程锁，第二进程实例拒绝接管测试通过。

## 验收证据

环境：Windows x64、Bun 1.4.2、Pi 0.87.1、sqlite-vec 0.1.9。基线仍 292f432，证据另含脏工作区指纹。

- `npm run test:core`：10 passed / 0 failed，43 assertions。没有在线模型调用；网络替身只替代模型服务，Core/Pi/权限/文件/SQLite 均真实执行。
- `npm run session:record`：真实 DeepSeek，2 次模型请求，隔离目录产生 `hello.txt`，内容为 `Hello from Ailya!` 加换行，任务 completed。
- `npm run session:replay`、`session:verify`：新数据库/新工作区，实际请求严格匹配；正常重放通过，5 个负向控制均按预期拒绝。
- `npm run test:browser:live`：2 passed；真实模型回复与刷新、厂商 CRUD、密钥不回传、桌面/390px 无横向溢出、真实文件差异弹窗、停止及刷新保持停止。截图在 `artifacts/browser/`。
- `artifacts/vector/vec-smoke.exe` + 同目录 `vec0.dll`：从 Windows 临时目录运行，vec0 最近邻顺序正确；可执行文件不通过 node_modules 寻找 DLL。
- build/lint 及最终指纹以 `artifacts/quality/` 报告为准；Vite 仍有已有的大 chunk 警告，不是构建失败。

状态：首个可运行闭环 ready-for-human；整个第一阶段的完整验收及整个项目均未标记 accepted/completed。人工复核可按 README 启动，聊天、停止、刷新，在隔离工作空间以所有权限写文本并查看差异；不需逐步批准既有授权工作。
