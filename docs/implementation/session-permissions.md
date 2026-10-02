# 会话内授权

2026-10-02。授权面板新增“会话内允许”，保留“拒绝并停止”和“允许这一次”。

## 行为

- 默认权限下，选择会话授权后，同一会话后续相同工具、完整参数及操作描述自动放行。对象键顺序不影响匹配；命令内容、路径、超时或其他参数改变会重新询问，不做前缀或正则扩权。
- 刷新、后续消息、Core 重启保留已确认授权。其他会话不共享；删除会话级联删除。Group 沿用主会话授权归属，成员工具范围仍由 Agent 配置限制。
- 相同命令仍会实际执行；此功能只省去重复确认，不对副作用去重。相同脚本调用不会锁定脚本文件的内容。
- 已取消、过期、跨会话或已处理但范围不同的决定被拒绝；重复提交同一决定幂等。旧的“允许一次”不能事后升级。拒绝不能同时保存会话授权。
- 当前未提供单条会话授权的撤销管理页面。授权范围仅限该会话及相同调用，长期全局白名单仍为独立设置。

## 持久化与兼容

SQLite v7 新增 `session_permission_grants`，`permission_requests.scope` 记录范围。决定和授权在同一事务写入，后续自动执行仍产生审计记录。升级前自动备份，旧记录全部保留为 `once`，不追认历史会话授权。接口 `POST /api/sessions/:id/permissions/:permissionId` 新增可选 `scope: "once" | "session"`，省略时保持旧行为，Zod 严格校验。

## 验证

- `npm run test:core`：71 项、507 断言通过。包含真实 Shell 重复执行、后续任务、参数变化、跨会话、拒绝、取消、幂等、删除清理，以及 v6 升级、旧附件/向量保留、备份和重启。
- `npm run build`、`npm run lint` 通过。构建仍有现有的大包提示。
- `bun scripts/session/session-permissions.ts record`：真实 DeepSeek 驱动两轮任务、3 次实际命令执行，只授权 1 次；临时文件精确包含 3 行预期内容。4 次模型请求。
- `bun scripts/session/session-permissions.ts replay`：匹配完整请求、完全消费响应、校验授权范围、任务及工具数量、完整文件集合和内容。候选位于忽略目录 `artifacts/session-candidates/session-permissions-v1.json`，未自动接受为基线。
- `bun scripts/session/verify-session-permissions.ts`：6 项负向控制通过。第一次命令篡改未触及跨 SSE 分块的实际内容，被验证器发现；修正篡改并增加“必须改变 fixture”的断言后，确认错误命令无法通过。
- `bun scripts/session/session-permissions-browser.ts`：构建后的页面与隔离的真实 Core/Pi/SQLite 联通，只有模型 HTTP 边界使用脚本响应。桌面及 390px 窄屏、刷新、失败后重试、按钮请求范围、两次实际执行和改变命令后的拒绝均通过。测试页面通过路由加载本地产物，单独授予测试浏览器回环网络权限以连接真实 WebSocket；未修改产品网络策略。

本轮为作者自审，未执行独立审查。没有改动冻结标签或用户原会话内容。

本地运行版本已升级到 v7；重启前确认无执行中任务和待授权请求。升级备份 98,803,712 字节，前后核对保留 5 个会话、12 个任务、1 个附件、1 个厂商和 13 条授权记录。Core 健康检查及当前 Vite 页面连接通过。
