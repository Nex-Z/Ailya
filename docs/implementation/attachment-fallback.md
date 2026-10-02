# 附件处理与脚本回退

2026-10-02，针对用户反馈“PDF 读取失败就让用户自己转换”修复。此次不改页面布局，不安装新的解析依赖，不改已有权限边界。

## 已复现的原因

- 用户对应任务实际只执行了 `read_attachment`，随后结束。工具只能读取 UTF-8 文本，注入的附件说明却把该限制写成“二进制/文档/图片解析不可用”。
- 附件原始字节保存在 Core SQLite；此前没有工具将它交给工作空间里的程序，所以 Shell 虽然可用，仍缺少正常的附件处理入口。
- 旧内置 Ailya 会话的 transcript 包含旧系统消息，Pi 会优先采用该消息；更新 Core 提示后旧会话不一定生效。
- Windows 本机 `python` 指向商店占位程序，退出码 1 且无输出；可用解释器通过 `py` 启动。原 Shell 反馈没有提供这个实际原因，在线验证中出现反复尝试 `python`。

## 变更

新增 `export_attachment(id,path)`：按当前会话（Group 成员按所属主会话）读取 SQLite 中的原始字节，导出到工作空间路径，返回完整路径、大小和 SHA-256。默认权限通过原授权面板确认写入；工具只属于 Agent 的“文件”能力，不给未配置 Shell 的 Agent 额外执行权。

导出禁止跨会话读取、工作空间越界和符号链接跳转；不覆盖不同内容，相同字节复用已有文件。文件按独占创建方式写入，取消后不再创建文件。真实导出产生文件变更事件，二进制文件明确标记，不伪造文本行数。

导出物是工作空间内的文件产物，不是正式附件主库或隐式缓存。模型优先使用 `.ailya/attachments/<id>/`，该目录已被 Git 忽略。原附件继续由 SQLite 持久化；导出的副本和模型写出的处理脚本保留，后续可明确清理，不因任务结束或删除聊天偷偷删除工作文件。

系统及附件提示现在要求：工具失败后检查原因、现有工具/库，必要时写代码执行，再根据实际结果回答；不能仅因文本读取器不支持一种格式就把工作交给用户。拒绝授权和路径限制仍是边界，不能换 Shell 绕过。附件内容始终是不可信数据。

新任务总是使用当前系统策略并保留原对话历史；任务审计保存此次系统提示，新增任务的续跑复用该提示。Shell 描述根据实际命令解析提供 Python launcher 信息；当命中的商店占位程序执行失败时，返回明确的 `py -3` 替代诊断，不猜测工具成功。

## 验证

- `tests/core/attachment-export.test.ts`：6 项 / 36 断言通过。真实 Pi 工具链、导出和 Shell 分别授权、原始字节一致、禁止覆盖、跨会话/越界/符号链接拒绝、取消和拒绝无副作用、Group 归属和工具范围、旧会话系统策略更新、Windows Python 诊断均覆盖。
- `npm run test:core`：68 项 / 473 断言通过；`npm run build`、`npm run lint` 通过。本次无前端源码改动，原授权面板和文件卡片继续消费 Core 真实事件。
- `bun scripts/session/attachment-fallback.ts record` 使用真实 DeepSeek、独立临时数据库及工作空间、合成的 **Flate 压缩 PDF**。模型自行导出、检查 PDF，再通过 `py -3 -c` 编写并执行解压代码，正确回答项目代号 `ORCHID-42` 和交付时间 Friday。4 次模型请求，导出和 Shell 均经过正式授权 API，无新依赖安装，无用户 PDF 内容进入测试录制。
- `bun scripts/session/attachment-fallback.ts replay` 通过：请求完全匹配、4 次响应全部消费、授权顺序匹配、真实 Shell 执行、导出字节及完整文件集合/回答一致。只规范化测试工作空间路径；跨 SSE 分块的代码参数在完整字符串层规范化。
- `bun scripts/session/verify-attachment-fallback.ts` 的 6 项负向控制通过：请求不符、缺响应、额外响应、额外文件预期、授权参数不符和未知版本必须失败。

验证过程如实保留：最初的未压缩 PDF 场景在人工授权阶段停止，因为它可能直接暴露正文，不能证明解析能力；更换独立的压缩 PDF 后，首轮发现 Python 占位程序问题并停止。补充实际环境诊断后重新录制成功。未增加超时、修改模型回复或自动接受候选来掩盖失败。

新候选 `artifacts/session-candidates/attachment-fallback-v5.json` 仍待人工接受；旧录制和冻结标签不覆盖。本次改变了模型可见提示及工具 schema，旧候选不作为当前版本的匹配基线。

## 复现与边界

在原会话发送“继续处理刚才的 PDF，尝试用现有工具或脚本读取”，附件无需重新上传。默认权限下会出现导出及执行授权。模型可利用已安装的解析库、命令或自行编写代码；本次完成的是附件到通用工具的通路，并非为所有格式、字体或扫描文档内置解析器。复杂 PDF/扫描件仍取决于实际可用的解析或 OCR 工具，失败须报告具体尝试和阻碍。

```powershell
bun test tests/core/attachment-export.test.ts
bun scripts/session/attachment-fallback.ts replay
bun scripts/session/verify-attachment-fallback.ts
# 在线录制需要操作者核对并通过打印的本地 permissionUrl 批准实际动作：
bun scripts/session/attachment-fallback.ts record artifacts/session-candidates/attachment-fallback-new.json
```

本轮为作者自审，未执行独立审查。原工作空间读取限制未放宽；用户先前提供的工作空间外路径仍应通过正常授权/工作空间选择或附件方式处理。
