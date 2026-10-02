# 模型思考深度

2026-09-28。复用 Select，在模型左侧显示“思考：默认/关闭/轻度/深度/极深”。桌面保持同一行；390px 窄屏下思考和模型形成上一行，避免工具按钮溢出。不增加常驻说明小字。

能力核对：当前 Pi 0.87.1 的 DeepSeek 目录提供 thinkingLevelMap，Pro 的 low 缺失已按官方能力修正。官方 [思考模式](https://api-docs.deepseek.com/guides/thinking_mode/) 与 [模型元数据](https://api-docs.deepseek.com/api/list-models/) 确认 low/high/max；关闭由 Pi 发送 thinking.disabled。仅对已核实的官方 DeepSeek origin + 目录模型提供控件，未知兼容厂商暂不猜测支持档位。默认沿用原模型配置，不自动改变既有执行行为。

通过 Zod 校验的 `/api/reasoning` 读写设置，在 SQLite core_settings 按厂商、地址、模型保存显式选择；恢复默认删除该覆盖项。Core 启动一次任务时读取并固定 runtimeOptions，通过原 Pi streamSimple 执行并记录请求审计。生成过程中 UI 禁用、服务端拒绝针对运行中会话的修改；保存期间暂禁发送，下一次发送才使用新值。不会显示模型隐藏推理文本。

验证：新增 Core 用例覆盖能力边界、每模型隔离、重启持久化、默认恢复、无效档位/运行中修改拒绝，以及实际 Core→Pi→HTTP 序列化四个档位。真实浏览器验证高档位在线回复、刷新保持、生成禁用和桌面/窄屏布局。首轮窄屏溢出已复现并修复，原断言复跑通过。

在隔离目录使用真实 DeepSeek high 录制 `artifacts/session-candidates/phase3-thinking-high.json`，3 次请求，真实执行 Shell/目录/搜索并写入严格预期文件。`bun scripts/session/phase3.ts replay artifacts/session-candidates/phase3-thinking-high.json` 无模型联网重放；旧默认档位候选保留且继续重放，不自动更新验收基线。新候选人工接受状态 pending。

Self-review：档位不是仅改标签，检查了请求上的 reasoning_effort 和 thinking；没有把未知模型一概赋予能力；已有任务的固定参数不被后来设置影响；测试恢复用户原有设置。独立审查未执行，人工复核 pending。

## 默认关闭（用户后续纠正）

用户明确要求默认关闭。当前未保存选择时返回 off，界面去掉“默认”，直接显示“思考：关闭”；旧 API 的 default 重置操作保留兼容，但重置后实际值为 off。显式保存的 low/high/max 不改写。仅已核实支持关闭的模型应用此默认，未知兼容模型继续按其配置处理。

新录制 `artifacts/session-candidates/phase3-thinking-default-off.json`，三个真实请求均关闭思考、usage.reasoning 为 0，执行四类工具并写入独立预期文件。默认 phase3 重放及负向控制命令改用此新候选；此前 low 默认候选保留为历史，不能继续作为当前默认行为基线。Core 序列化用例增加清除覆盖后的实际 disabled 断言。独立审查未执行，self-review 已核对标签、API 值和真实请求一致性。

## 其他厂商能力识别（2026-09-28）

复用 Pi 0.87.1 的 Moonshot 国际/国内模型目录及 Z.ai 目录，仅对精确官方 API 地址和已知模型启用；Z.ai 同时识别标准 API 与 Coding API。未知中转、未知模型不展示。只有开关能力时显示关闭/开启，不伪装成不同深度；强制思考模型不提供关闭，初始及重置使用第一个实际支持的档位。其他原生协议（例如 Anthropic Messages / Gemini）尚未接入，本次不声称支持。

依据：安装版本 Pi provider catalog 和 openai-completions adapter；Z.ai 官方 https://docs.z.ai/guides/capabilities/thinking-mode 。思考事件当前仅驱动“正在思考”状态，不展示 reasoning 文本；本次没有改变这一行为。

验证：真实 Pi 序列化对接本地 HTTP 服务，覆盖 Kimi 开关、Kimi 深度、Z.ai 开关及深度；未知地址隐藏、强制思考默认与拒绝关闭、SQLite 偏好恢复。DeepSeek 实际模型浏览器测试通过，含刷新、执行中禁用、桌面/窄屏；默认关闭 Session 执行重放通过，隔离目录真实生成 proof.txt。Kimi/Z.ai 未使用实际厂商凭据发起生成，不能视为这些服务的线上验收。自审完成，非独立审查；人工复核待用户操作。

## 思考文本展示（2026-09-28）

用户要求展示厂商返回的思考文本。本次将 Pi thinking_delta 映射到独立 reasoning 字段，随现有 SQLite 会话与事件快照持久化；不是客户端生成的模拟文本，也不暴露 provider 签名字段。消息正文保持独立，思考文本以纯文本可折叠区域显示，默认折叠，长文本限制滚动高度。停止保留已接收内容，重新生成清空旧内容。历史未保存此字段的会话不自动补写。

验证：model-output 测试 8 项 / 53 断言通过（流式思考、停止保留、失败、重试清理）；真实 DeepSeek Playwright 测试通过，验证展开、刷新恢复原文本和窄屏无溢出。深度思考候选 phase3-thinking-high.json 的真实 Core 执行重放通过，3 次请求、隔离目录 proof.txt 文件结果匹配。build/lint 通过（已有 bundle 大小提示）。自审检查了重试覆盖、JSON 兼容性和文本安全渲染，非独立审查。仅展示模型实际返回的文本；厂商未返回则没有思考文本入口。浏览器测试首次因截断标题定位错误超时，修正定位后通过，清理了测试会话并恢复原关闭档位。
