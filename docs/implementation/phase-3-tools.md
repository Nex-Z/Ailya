# 第三阶段：基础工具、调度与 MCP

2026-09-28；在现有前端继续实现。HEAD 与冻结标签均为 `292f43298c224e120e519afca3526bf5ef7c7fbe`，开发成果仍在原脏工作区；未重置、提交或移动标签。

## 已接入

| 能力 | 实际执行 | 入口 |
| --- | --- | --- |
| Shell | Pi PowerShell，工作目录、默认 120 秒/上限 600 秒、进程树取消、受限环境继承 | `powershell` |
| 目录/文件名 | Pi ls/find，工作空间边界、拒绝符号链接、限定遍历量 | `ls`、`find` |
| 文件内容搜索 | UTF-8 字面量匹配、行号、大小/数量限制，不依赖 rg | `search_files` |
| 联网搜索 | Tavily 官方 Search API，来源 URL、摘要、超时/响应上限，DPAPI 保存 Key 或环境变量 | `web_search`；设置 → 模型与连接 |
| 定时任务 | SQLite 调度器，每次独立会话，日/周/单次、IANA 时区，离线错过不补跑 | `schedule_task`；原定时任务页面 |
| MCP | 官方 SDK，stdio / Streamable HTTP，动态工具发现、调用、取消和会话结束清理 | `mcp_list_servers`、`mcp_list_tools`、`mcp_call_tool`；原扩展页面 |

默认权限下 Shell、调度修改、MCP 连接/调用复用 Core 审批和持久化白名单；所有权限跳过逐次审批。Shell 和外部 MCP 是可信主机执行，**不是目录沙箱**。Shell 差异只涵盖工作空间内扫描到的文件；单文件超过 512 KiB、总量超过 16 MiB、超过 3000 文件或排除目录时不保证完整差异。目录/搜索排除 `.git`、`node_modules`、`.ailya` 和符号链接。远端 MCP 取消不保证远端操作回滚。

SQLite v3 增加 `resources`、`schedule_runs`，迁移前自动备份。任务/扩展配置从原 localStorage 按 ID 导入并停用，原数据保留；每条有导入标记，删除后不因刷新复活，其他浏览器的配置仍可继续导入，同名配置保留副本。Skills 仅持久化配置，启用返回尚未接入，未冒充运行时功能。

调度创建继承当前工作空间和模型，新任务默认权限；模糊时间需澄清，相对日期先查询 Core 时间。Core 必须常驻，尚未安装开机服务。启动前已到期或超过一分钟执行窗口的任务记录 missed；连续离线错过多次周期会合并为一次 missed 并推进到下个未来执行时间，不批量补跑。运行中 Core 重启标 interrupted。停用/删除调度不回滚已启动会话，可在该会话停止执行。

MCP 环境变量/请求头可在原编辑器填写 JSON 字符串对象，配置整体用当前 Windows 用户 DPAPI 加密；模型的服务列表不含这些配置。MCP roots 是工作目录提示，不是强制隔离。

## 验证

- `npm run test:core`：真实 Pi Shell 写文件和差异、拒绝无副作用、取消后子进程已退出；MCP Node 子进程真实发现/调用/报错/退出，真实本地 HTTP 服务器及鉴权头；Tavily HTTP 边界替身验证；调度独立 Core 会话、重启 missed、模型发起调度审批、重复请求不重复创建；v1/v2 数据迁移、升级前备份与恢复。
- Tavily 在线：当前环境已有可用凭据，真实 `/api/search/test` 返回 3 条 TypeScript 搜索结果，包括官方文档。没有将密钥打印、录制或写入 Git。
- 浏览器：`tests/production-core.spec.ts`、`production-permissions.spec.ts`、`production-tools.spec.ts`，覆盖真实聊天/文件/权限、资源 CRUD/刷新、在线搜索及 390px 窄屏；截图在 `artifacts/browser/tools-desktop.png`、`tools-narrow.png`。
- `bun scripts/session/phase3.ts record`：真实 DeepSeek v4 Pro 经正式 Core/Pi 调用 PowerShell、ls、find、search_files；3 次模型请求，在独立目录生成唯一 `proof.txt`，内容严格为 `phase3-proof`。最终候选为 `artifacts/session-candidates/phase3-tools-final.json`。
- `bun scripts/session/phase3.ts replay`：替换模型 HTTP 流，重新执行真实工具、授权、SQLite 和文件写入，逐请求完全匹配、全部录制消费、独立预期文件核对。其余外网依赖拒绝。不是 UI 事件动画。
- `bun scripts/session/verify-phase3.ts`：请求篡改、缺响应、多响应、错误文件预期、未知版本均必须失败。旧候选保持原样，因工具 schema/系统提示变化不能视为当前重放基线；新候选仍待人工接受。

## Self-review

本轮为同一作者自审；独立审查未执行，人工复核 pending。

| Finding | 触发/后果 | 处理及证据 |
| --- | --- | --- |
| R3-01 | 首个空浏览器导入设置全局标记，后续浏览器的原型配置无法迁移 | 改为逐 ID 标记、同名保留；资源测试覆盖空导入、后续导入、删除不复活 |
| R3-02 | 原型停用草稿含不存在目录或旧 Agent，严格启用验证导致整批无法导入 | 停用草稿保留，启用时验证实际目录/Agent/时间；回归覆盖 |
| R3-03 | MCP SDK 标准 close 只终止父进程，Windows 后代可能残留 | 关闭持有的 stdio PID 时使用系统 taskkill /T，再交由 SDK 清理；检查真实进程已退出 |
| R3-04 | Shell 扫描失败掩盖原执行错误，或扫描不完整却报告完整差异 | 保留原错误；结果明确部分/不可用，不构造不存在的文件变化 |
| R3-05 | MCP 恶意空分页可持续请求 | 10 页/200 工具/128000 字符上限 |
| R3-06 | 资源由本地缓存迁至 API 后，直接打开 Agent 编辑器的 MCP 选项为空 | 页面挂载加载资源；浏览器刷新后直接进入 Agent 校验实际 MCP 选项，未改变 Agent 执行仍未接入的边界 |

测试过程中还定位了 Bun `.rejects.toThrow` 在该 stdio 异步错误路径上的挂起：同一 SDK 调用在普通脚本正常，改为先 await/catch 后断言错误内容正常；未增加超时或弱化断言。浏览器第一次失败是测试清理 DELETE 缺少 JSON 请求头，Core 正确拒绝；修正测试并删除仅该测试创建的配置后通过。

## 人工复核与剩余边界

访问 `http://127.0.0.1:5173`，新会话可要求列目录、搜索文件、执行指定 PowerShell、联网查资料、创建未来定时任务；默认权限下检查批准/拒绝。扩展页新增 MCP 后启用，聊天可发现并调用；设置中可替换 Tavily Key 并测试连接。

没有验证任意第三方 MCP 服务或所有日历/DST 组合；当前验证平台为 Windows、Bun 1.4.2 / Node 24。Core 发布打包、后台系统服务、完整 CI、Agent/Group、运行时 Skills/Pi 插件、IM、语音、上下文压缩及长期记忆仍未完成。本阶段交付不代表整个项目完成。

最终验证计数：Core 34/34、212 个断言；真实浏览器 6/6，R3-06 修复后重跑受影响的 tools 用例 1/1；最终 Session 录制/重放各 3 请求、4 种真实工具，5 项负向控制全部检出。build/lint 通过；Vite 仍有既有单包超过 500 KiB 的体积提示，未作为已优化宣称。
