# 输入框 @ 选择对话对象

2026-09-28，用户明确要求将 Agent/Group 选择从上下文栏移至输入框。移除上方伙伴下拉及 `/agent` 列表入口，保留工作空间、运行机器和模型原布局。复用现有命令菜单，输入独立的 `@` 可按名称搜索 Agent/Group，支持上下键、Enter、点击选择和 Escape；邮箱中的 @ 不触发。选中对象显示为输入框内标签，可以在新会话中取消。选择只替换 @ 查询片段，保留其余消息文字，发送仍通过原 context.agent 字段。

保持首条消息后上下文锁定：已有会话不能通过 @ 绕过锁定。没有改动 Core 的权限/执行逻辑；目前 Core 仅实现 Ailya，其他 Agent/Group 仍明确返回“执行尚未接入”，不会改用 Ailya 假装执行。此次交付为选择入口变更，不是 Agent/Group 运行时实装。

验证：`tests/agent-mention.spec.ts` 真实 Core 检查 Agent/Group 搜索、键盘/点击选择、取消、保留原文、发出的 context.agent 和未实现错误、草稿保留、窄屏及邮箱不误触发；`tests/context-model.spec.ts` 检查已有会话保留上下文锁定和模型切换。2 项通过，build/lint 通过。窄屏截图 `artifacts/browser/agent-mention-narrow.png`。

Self-review：名称来自现有 catalog，不复制第二套配置；菜单复用原组件并按输入项分组；选中角色未绕过服务端尚未实现的拒绝；没有新增页面说明性小字。独立审查未执行，人工复核 pending。
