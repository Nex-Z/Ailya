# 运行时 Skills 首版

日期：2026-10-02。基于 `a4f26d5` 后的工作区实现。这里是 Ailya 产品功能，与仓库 `.agents/skills` 开发辅助规则分开；没有自动导入开发 Skills，也没有修改冻结标签。

## 入口与实际执行

- 「扩展 → Skills」支持新增、编辑、启停、删除，以及「导入本地 Skills」。导入可填写单个包目录，或包含包的父目录；先查找，再逐项导入，默认停用。
- 标准包根目录包含带 `name`、`description` 的 `SKILL.md`。通过已安装的 Pi `0.87.1` 实际 `loadSkills` API 校验，`includeDefaults:false`，不扫描 Pi 默认目录。编辑器也支持简单正文，Core 自动补稳定标识和描述。
- Agent 的 Skills 多选来自真实已启用资源，保存稳定资源 ID，显示名称可修改。内置 Ailya 可使用全部已启用 Skills；自定义 Agent 仅获得所选 Skills。Group 成员执行时按各自 Agent 配置选择。
- 模型先看到 Pi `formatSkillsForPrompt` 生成的名称与简介，用 `load_skill` 按需读取正文或相对路径参考文件，单次最多 12,000 字符，支持继续读取。`disable-model-invocation:true` 从自动目录隐藏，不是额外权限隔离；显式 `/skill:<name>` 会展开所选正文。命令面板只列当前角色可用的 Skills。
- `export_skill` 将随附文件导出到工作空间 `.ailya/skills/<资源 ID>/<内容哈希>/`，随后由已有 Shell 等工具读取或运行。导入和加载本身不执行脚本、不安装依赖。能否完成具体工作仍取决于 Skill 内容、模型和主机已有工具。

## 数据、版本和权限

SQLite 迁移 v10 增加 `skill_packages`、`skill_files`、`task_skills`、`task_skill_files`。包元数据和原始文件字节保存在 Core SQLite；任务开始时复制所选版本，编辑影响后续任务，等待回答后重启续跑仍加载原任务版本。备份包含包和任务副本，升级前保留一致性备份。

每次加载/导出都核实技能仍启用。停用或删除阻止后续加载和导出；删除资源清理当前包，任务审计副本随所属会话删除。已进入会话的文字和已导出到工作空间的文件不会自动抹除，也不撤销已经完成的外部操作。

Skills 不授予工具权限。`load_skill` 只读任务中已选择的包；没有「文件」工具的 Agent 不获得 `export_skill`，没有 Shell 的 Agent 不能因此得到 Shell。默认权限下导出走现有逐次/会话授权；「所有权限」沿用跳过逐次授权的行为。执行脚本另走原 Shell 权限。Shell 是可信主机执行，不是文件系统沙箱。

包内拒绝路径穿越、绝对路径、符号链接/目录联接及非法文件名；导出检查目标各级目录，拒绝覆盖已改变的文件。停止后不继续写入，已完成写入不回滚。正文读取拒绝二进制。单包最多 200 文件、10 MB、12 层目录，`SKILL.md` 最大 100 KB 且受配置正文 50,000 字符限制；一次发现最多 20 个包，每个任务所选包最多 100 个、合计 50 MB。`.git`、`node_modules` 不导入。

## 验证与边界

- 本次 `npm run build`、`npm run lint` 通过；Core 全量 96 测试、726 断言通过，Skills 专项 7 测试、54 断言通过。构建仍有既有的前端大 chunk 提示。
- Core 行为覆盖：实际 Pi 格式解析、导入、正文/参考文件读取、真实 Node 脚本产物、授权拒绝、等待授权时停用、Agent 范围、手动入口、运行中编辑、路径穿越、二进制、目录联接、停止与修改后拒绝覆盖。
- 生命周期覆盖：v9 升级保留记忆、历史及向量，升级前备份可读；等待问题后重启续跑使用原包字节；备份保留任务版本；删资源和删会话的清理边界。
- `scripts/session/skills-browser.ts` 通过正式前端和隔离 Core 检查导入、启用、改名、Agent 多选、`/skill` 实际发送；模型边界使用替身。1465px 与 390px 检查无横向溢出、无页面异常。截图在忽略目录 `artifacts/browser/skills-*.png`。
- 真实 DeepSeek v4 Pro 已完成加载、导出及 PowerShell/Node 执行，独立核对 `proof-receipt.txt` 为 `SKILL-RECEIPT-73`，并核对完整产物目录。成功候选 `artifacts/session-candidates/skills-v2.json` 含 5 次实际请求；一次在线尝试未生成产物、验收失败，不能以单次成功保证所有 Skill 或模型都可靠。
- 离线重放逐次比对模型请求、工具 schema、提示、结果和实际文件；格式、请求、缺少调用、多余调用、错误产物 5 类负向控制均失败。为映射跨 SSE 片段的临时路径，录制器合并同字段的文本片段，保留字段内容；不验证流分片时序。候选未自动提升为受版本控制的基线。
- 本地 Core 已在空闲时重启，健康接口 schema v10、sqlite-vec v0.1.9；升级前后 5 个会话、12 个任务、1 个附件和 5 份 transcript 数量一致，生成 98,914,304 字节的 pre-v10 备份。真实前端 Skills 入口可见，未给用户数据导入验收样例。

```powershell
npm run build
npm run lint
bun test tests/core/runtime-skills.test.ts tests/core/runtime-skills-lifecycle.test.ts
bun scripts/session/skills-browser.ts
# 默认 replay 不访问在线模型，缺少候选即失败
bun scripts/session/skills.ts replay
bun scripts/session/verify-skills.ts
# 显式在线录制，使用本机已保存的 DeepSeek 凭据，写新的候选路径
bun scripts/session/skills.ts record artifacts/session-candidates/skills-new.json
```

尚未实现：远程仓库/压缩包安装、依赖安装器、包更新与版本管理 UI、包内辅助文件编辑、Pi 扩展插件执行、完整发布安装包验收。工作区导出副本和任务版本的存储回收仍依赖当前明确的删除边界，没有自动保留策略。自审由实现者完成，未执行独立审查，也未将用户复核标为已接受。
