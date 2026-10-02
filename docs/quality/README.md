# Ailya 自迭代、审查与学习流程

这是开发 Ailya 的工程流程，不是已经接入产品的自学习 Agent。运行时如需同类能力，必须另行实现于 Core/SQLite；仓库 Markdown 是开发规范和脱敏决策，不是业务数据库。

## 来源与取舍

参考 deepseek-ai/deepseek-harness，读取时 master 指向 `21638c56315ae6a2b552d6091945d3144c9af32e`。以下为参考机制，具体流程是 Ailya 的设计，不声称上游提供了自动学习闭环：

- [code-review](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/.agents/skills/dsh-code-review/SKILL.md)：核实审查范围及版本，优先审查真实行为、生命周期和证据。
- [pre-push-checks](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/.agents/skills/dsh-pre-push-checks/SKILL.md)：按改动选择相关验证，已有有效证据不重复跑。
- [ci-test-reliability](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/.agents/skills/dsh-ci-test-reliability/SKILL.md)：隔离资源、明确同步条件、完整清理，不能用重试掩盖不稳定性。
- [agent-experience](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/.agents/skills/agent-experience/SKILL.md)：按需读取上下文，返回有限结果及详细证据位置。
- [Agent Notes](https://github.com/deepseek-ai/deepseek-harness/blob/21638c56315ae6a2b552d6091945d3144c9af32e/.agents/notes/README.md)：区分提议、已实现及被否决的决策，只记录有长期价值的原因。

不移植 Cordis、其目录结构、双语机制或全文件 100% 覆盖要求；保留 Ailya 的 Pi/Bun/SQLite 方向。Skills 是执行指导，不是强制沙箱或已部署 CI。

## 一个工作单元

一次只处理一个可验收行为，记录任务 ID、目标、授权范围、基线 commit、改动文件、验收条件和风险。普通局部修正可在回复中记录；跨模块、持久化或生命周期任务使用 [工作记录模板](templates/work-item.md)。

状态流：`scoped → implementing → self-review → testing → ready-for-human → accepted`。审查或测试发现缺陷进入 `repairing`，修复后回到相关审查与测试；没有证据或外部条件缺失为 `blocked`，不能标 accepted。

1. **定范围**：读取 AGENTS 和所需规范，选相关已验证经验；先写用户能观察到的验收条件。已获授权的工作直接做。
2. **实现**：遵循现有功能交付 Skill，不改冻结标签或借机扩大范围。
3. **自审**：按 [review 方案](review.md) 追踪调用者、数据与事件，不只看修改行。
4. **测试**：按 [test 方案](testing.md) 执行足以检出缺陷的验证。记录成功、失败、跳过和未运行。
5. **修复循环**：默认最多 3 轮针对同一问题的修复尝试（不是产品并发上限）。每轮记录假设、新证据和结果。同一失败连续两轮无新证据，或达到上限，停止盲改并提交明确阻塞/方案供用户选择。用户可调整本次预算。
6. **人工复核**：自动检查通过后提交具体差异、操作入口、截图/日志和未覆盖项；使用 [人工复核模板](templates/human-review.md)。不要提前让用户批准空方案，也不反复请求已给出的权限。
7. **学习**：把已复现问题、真实修复和人类反馈形成候选；按 [经验生命周期](../../.agents/lessons/README.md) 验证和晋升。接受代码不自动接受一条永久规则。

## 人工与自动的分工

Agent 可自主执行已授权范围内的实现、自审、测试和修复。用户未明确要求停审的日常修复可以交付；人工反馈尚未收到时写 ready-for-human，不虚称人工通过。该状态不阻止继续不依赖它的已授权任务。

正式版本发布验收、改变已确认产品规则、持久数据破坏性迁移、改变权限边界或把经验提升成约束性规则，需向用户展示具体结果与后果，并取得对应授权。既有明确授权有效，不重复询问。未得到回答不是同意，人工复核没有 30 秒自动通过；产品提问的 30 秒规则不适用于开发审批。

审查可以由同一个 Agent 切换为只读视角完成，但必须标记 self-review；只有实际独立审查者给出证据才写 independent-review。没有明确授权时不自动创建子 Agent。独立审查如被授权，向审查者提供目标、规范、范围与原始证据，避免先塞入作者“已正确”的结论。

## 证据与版本

每次证据包含 commit、工作区改动摘要/文件指纹、命令、时间、环境及日志路径。工作区不干净时不能仅记录 HEAD；测试后相关文件改变，该项证据失效。人工意见绑定复核版本，后续改变相关行为需重新复核。

自动结果与人工结果分开：build/lint 通过不代表任务正确；25 个原型测试通过不代表 Core 已实装。可执行检查器 scripts/quality-check.ps1 保存文件指纹和命令退出码，但不替代语义审查、测试数量核对或人工批准。

## 完成标准与持续改进

完成需要目标行为达成、相关检查通过、阻塞缺陷关闭、剩余限制如实记录；正式验收再加人工确认和真实 Core 证据。

学习效果看同类缺陷复发率、首次验收通过率、测试不稳定率、人工打回原因与无效规则数量。不以经验条数或文档长度为成果。无新增证据则不新增规则；旧经验不再适用就标记 superseded/rejected，不能永久叠加。

## 重放与上游差异

[Session 重放设计](session-replay.md)区分前端事件回放和真实 Core 执行重放；[DSH 差异核对](dsh-comparison.md)逐项记录补齐项、有意差异和当前未实施层级。运行器尚不存在，现有检查脚本仅支持 static/browser。
