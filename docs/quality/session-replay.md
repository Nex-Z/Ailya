# Session 重放测试设计

状态：已实现首个单会话 HTTP 边界重放运行器，详见 [阶段记录](../implementation/phase-1.md)；以下完整格式和并发场景仍为目标。不得把当前 ComplexReplay 动画或已有 Playwright 测试记为本层通过。不新增虚假的 npm 重放命令。

## 两层回放

| 层 | 注入内容 | 真实路径 | 验证 |
|---|---|---|---|
| 事件回放 | 已记录的 Core 事件和工具结果 | 正式前端事件消费、状态投影和渲染 | 中间状态、交互、ARIA/界面、最终状态 |
| Session 执行重放 | 录制的模型响应流和用户动作 | 正式 Core 启动、Pi 循环、工具、SQLite、API/WebSocket | 新生成的会话、请求、工具副作用、数据库关系与界面 |

第二层不能直接把期望事件塞入数据库冒充执行。只替换模型/显式外部依赖边界，核心状态机、权限检查、持久化和恢复路径必须真实运行。第一层不证明执行正确，第二层不证明在线模型质量，仍需真实服务 e2e。

## 场景文件（目标结构）

每个场景置于 snapshots/session/<name>/，UI 独立事件回放放 snapshots/events/<name>/；与 Session 无关的组件快照仍随 tests 的所属测试保存。

- scenario.json：严格 schema，scenarioVersion、sessionFormatVersion、entrypoint、adapter、角色关系、模型录制文件、环境、平台、允许的工具、外部替身、时钟和预期产物。
- session.vN.jsonl：从测试 SQLite 导出的脱敏父会话事件；child.<role>.vN.jsonl 保存子会话。JSONL 是测试交换格式，生产持久化仍为 SQLite。
- requests.expected.json：模型实际收到的消息、工具 schema、系统提示和参数；大型提示可引用唯一所属的可读文件，引用必须解析。
- actions.json（仅需要时）：外部停止、权限回应、问题回答、断线重连等刺激。普通用户输入可从会话导出推导，不维护重复副本。
- overrides.json（仅需要时）：记录无法从最终结果推导的首块前错误、挂起、中途断流、取消与重试；明确 session role、request/attempt 和触发点。
- workspace/ 与 workspace.expected/：初始目录和独立编写/审查的完整最终目录（包括删除、二进制哈希及空目录约定）。
- state.expected.json / ui.expected.*：稳定业务投影及关键 UI 检查点；不用二进制 SQLite 文件逐字节对比。

版本号 N 指格式世代，不指运行次数。已提交历史世代不覆盖；普通输出变化由 Git 差异审查管理，格式升级新增世代。迁移场景明确固定输入版本，使用独立当前 writer 输出预期，不能把旧格式输入直接作为新格式输出 oracle。

## Record / Replay / Refresh

- Record：显式选场景与真实模型，凭据来自运行环境；在隔离环境录制流和事件，先脱敏再生成候选文件。真实调用需要可用凭据和任务授权；缺失报告未运行。
- Replay（默认，未来 CI 唯一模式）：无模型密钥，读取已审查 fixture，以临时数据库/目录启动正式服务，返回录制流，执行动作并比较输出；禁止修改基线。
- Refresh：仍使用旧模型录制输入，仅重新产生派生输出候选；不能通过刷新掩盖新增请求、输入不匹配或未消费脚本。改变模型轨迹需重新 Record。

Record/Refresh 的输出先写 artifacts 候选目录；人工审查差异后明确接受才更新 fixture。两者均不得自动更新 workspace.expected，真实副作用预期独立维护。CI 缺 fixture、未知版本或不匹配应失败，不能自动录制、联网或跳过。

## 确定性与模型请求

每个模型调用先匹配实际请求，再交付录制流。至少比较角色序列、工具 schema、系统提示、配置及稳定内容；仅显式声明的非确定字段可规范化。额外请求、缺失请求、额外/缺失响应、未消费录制脚本全部失败，不能用一个通用成功回答兜底。

ID 按类型规范化，保留 session/task/attempt/toolCall、父子关系和引用一致性；随机工作目录映射到逻辑路径，不删除任意看似 UUID 的用户文本。规范化器必须幂等且有反例测试，不能过滤权限状态、错误或语义差异。

绝对时间可锚定可控时钟，但事件顺序、截止时间差、持续时间和停止/恢复间隔保留；不把所有时间归零来通过 30 秒问题测试。事件回放另行注入乱序、重复和缺口；执行回放保持调用因果关系。

子会话使用稳定角色/委派关系及调用序号绑定录制，不按首次请求到达顺序匹配；并发兄弟任务分别消费脚本。顺序若属于需求则验证，否则只规范化独立事件，不掩盖因果错乱。

## 副作用隔离和真实入口

每次运行创建独立临时 Workspace、SQLite、附件根目录与端口；只向测试根目录授予写权限。真实文件工具和安全 Shell 可在此执行；不得接入个人目录、真实 IM 账号或真实调度目标。

外部网络服务默认拒绝；场景明确声明的本地替身只替换网络边界，保留序列化、权限与错误传播。不能通过测试专用捷径绕过正式 Core 初始化、迁移、Pi 配置或权限系统。

检查完整目录树、数据库业务投影、事件和资源清理；模型说“修改成功”不构成证据。停止后观察无晚到写入，退出等待子进程/数据库句柄释放。打包层另做正式产物入口 smoke，源码路径通过不代表发布通过。

## 优先场景与落地顺序

1. Core 首个真实会话闭环时建设最小运行器：一次文本回复、一次真实临时文件修改、SQLite 导出比较，先加入反例确保错误会失败。
2. 工具失败后重试、停止及晚到事件、30 秒批次超时/拒答/迟到提交、同一任务恢复、父子任务与并发脚本绑定。
3. 浏览器重连、Core 重启、重复请求幂等、权限拒绝、迁移与向量隔离；通过正式 Web/API 适配器驱动。
4. 真实服务 e2e 和发布产物验证独立执行；版本验收组合三类证据。

运行器本身需负向控制：篡改请求、遗漏一次调用、额外写文件、错绑子会话、修改截止时间、错误 schema 版本均导致失败。只做 fixture 自洽校验不足以证明执行重放。

## 资料与适配说明

参考版本固定为 DSH 21638c56315ae6a2b552d6091945d3144c9af32e：

- [session-snapshot](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/packages/test-support/session-snapshot/README.md)
- [llm-replay](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/packages/test-support/llm-replay/README.md)
- [fixture 规则](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/snapshots/AGENTS.md)

以上结构、SQLite 投影和并发角色匹配是 Ailya 的设计，不是对上游实现完整复刻。

