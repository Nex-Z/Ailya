# 模型截断 / 空回复修复与自审（2026-09-28）

## 缺陷与范围

原会话 `c89fce2a-4a61-4126-ab50-123dd5855dd7`，输入“帮我做一个鹈鹕骑车的html”，workspace 为 E:\tmp。原请求 59.4 秒，4096 output / 4096 reasoning，stopReason=length，无工具调用和文件，却被记为 completed。保留原会话与事件，不覆盖历史证据。冻结基线仍为 292f432；实现基于包含用户规范和前阶段代码的脏工作区，未重置。

## 修复

- 新增 model-runtime.ts：官方 DeepSeek origin 下复用 Pi 0.87.1 的模型、协议及能力资料；单次输出预算 32768，默认 low 思考。预算受已知模型与上下文上限约束，不将模型最大容量直接作为每次输出额度。
- 2026-09-28 实际 GET /models 返回 Pro 支持 low/high/max；Pi 目录尚将 Pro low 标为不支持，因此只补正 thinkingLevelMap.low，协议仍由 Pi 处理。已通过请求边界测试确认发出 thinking.enabled、reasoning_effort=low、max_tokens=32768。off 也验证发出 thinking.disabled。
- 未识别的兼容厂商保持保守 fallback，不凭同名模型推断协议。厂商配置支持 SQLite 中的 modelOptions[modelId]（maxTokens/contextWindow/reasoning），经 Zod 校验；本轮未增加设置页面控件。完整跨厂商动态目录仍未实现。
- length 和空最终回复均失败，有可见错误及重试入口；截断主动取消后续模型请求。已完成文件保留，不伪装回滚。部分可见文本保留。
- 增加 waiting/thinking/generating/tool 状态。浏览器显示状态，不显示内部思考原文。流中不再逐 token 保存不断增长的 Pi partial，完整原始消息在 message_end 保留；文本/工具参数快照合并到约 100ms，思考约 1s，状态转换立即持久化。完成/停止取消缓冲定时器。

参考：[DeepSeek 思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)、[模型能力接口](https://api-docs.deepseek.com/api/list-models/)，以及本地已安装 Pi adapter/provider 源码；未另写模型协议或工具执行循环。

## 验证

- Core：25 passed / 0 failed，152 断言。新增覆盖真实 wire 参数、4096 个 thinking delta 的快照数量限制、截断/空结果失败、部分回复重试、思考中停止、截断工具零副作用、写入后截断不回滚。
- model-output.spec.ts：桌面/390px、思考状态、刷新恢复、错误及重试入口通过；此层快照替身只验 UI。
- 既有 phase2 Session 重放及 5 项负向控制通过。候选不自动升级为基线。
- pelican.ts 在独立临时目录和 SQLite，使用原始输入、真实 deepseek-v4-pro、默认权限，经正式 API 允许隔离 HTML 写入。最终录制 2 次请求，30577ms，生成 pelican_bike.html。snapshot 239 次；这是与原失败样例的观测对比，不是严格性能基准。
- 对最终录制执行离线 replay：完整 HTTP 请求匹配、响应完全消费、任务完成、授权真实执行、文件集合及每个字节、最终回复一致。凭据不进入候选；候选 artifacts/session-candidates/pelican-low.json 待人工接受。
- 生成 HTML 的桌面/390px 渲染已查看，鹈鹕与自行车可见，未发生脚本错误或外部资源请求。源码及截图在 artifacts/pelican。生成质量是简易动画示例，不意味着产品已经具备浏览器工具或自动视觉审查。
- build/lint 通过；最终源码指纹报告见 artifacts/quality。

## 自审记录

这是实现者自审；独立审查未执行，人工接受 pending。

| ID | 级别 | 发现与修复 | 状态 |
|---|---|---|---|
| R-01 | P1 | length/空回复被标成功；改为可见失败，保留部分结果 | verified |
| R-02 | P1 | 截断工具虽被 Pi 拒绝，却继续模型循环；截断后主动取消，测试零写入/零授权 | verified |
| R-03 | P2 | 每个 thinking delta 保存累计 partial 和完整会话；移除累计 partial，合并快照并保留终态原文 | verified |
| R-04 | P2 | 模型资料与 wire 思考配置不符；复用 Pi、核实 low 支持并增加 wire 测试 | verified |

过程中的失败如实保留：第一轮 high 真实验证到 240s 截止仍未交付，停止；第二轮 low 生成纯 CSS HTML，但验收脚本不当地要求 SVG/Canvas，修正为允许 CSS，未修改模型产物；第三轮 low 录制及重放成功。记录流捕获的取消异常也改为收集失败，避免未处理 Promise。未通过增加重试次数、延长截止时间或改写模型回复掩盖缺陷。

## 人工复核

现有聊天可以重试原请求，等待模型、思考、准备工具、授权和输出均应反映 Core 状态。原失败记录保持不变。隔离生成的 HTML 可直接打开复核；测试没有修改 E:\tmp。现阶段不自动为截断请求追加额度或重复执行写入，用户明确重试才开始新 attempt。

补充审查 R-05（P1，verified）：真实浏览器回归首次为 4/5 通过。失败场景在刷新后的 snapshot 尚未恢复时选附件，文件进入临时会话，正式发送缺附件。修复为 Core/会话未就绪时禁用附件按钮和 input；添加受控 snapshot 屏障测试验证未就绪不可上传、就绪后发送绑定 restored 会话且包含原始字节。两项定向 UI 测试通过，三项真实权限/附件浏览器测试重跑通过；此前首阶段两项真实浏览器回归通过。没有延长等待或增加重试掩盖失败。

复现命令：

```powershell
npm run test:core
npx playwright test tests/model-output.spec.ts tests/attachment-readiness.spec.ts --workers=1
npm run test:browser:live
bun scripts/session/pelican.ts replay artifacts/session-candidates/pelican-low.json
npx playwright test tests/pelican-artifact.spec.ts --workers=1
# 仅明确重新录制时执行：使用当前用户 SQLite 中的 DeepSeek 凭据，调用真实模型
bun scripts/session/pelican.ts record artifacts/session-candidates/pelican-new.json
```

最终生成文件的只读副本：artifacts/pelican/pelican_bike.html；record.json/replay.json 记录各自隔离目录。录制候选缺失时 replay 失败，不会联网补录。
