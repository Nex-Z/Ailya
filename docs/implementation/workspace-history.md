# 可搜索的工作空间历史

2026-09-28。原工作空间按钮直接打开系统目录选择器，不保留可复选列表。本次按用户要求复用 Popover/Command 组件，点击后按完整路径搜索，列表下方保留“选择其他文件夹”。只在菜单中显示路径，没有新增页面说明文案。

选过的目录通过 Core 的 `Workspaces` 写入已有 SQLite `core_settings`，键按规范路径的 SHA-256 标识，Windows 忽略大小写去重。记录选择时间，最近使用排前；已有会话工作目录也参与列表，恢复先前使用记录。无需迁移、清库或浏览器 localStorage。新目录和历史目录选择都经 realpath/stat 验证，文件、失效目录和无效请求拒绝；取消不改变选择。选目录/保存过程中禁止发送，避免请求使用尚未切换完成的旧目录。已有会话继续锁定工作空间。

验证：`tests/core/workspaces.test.ts` 2 项覆盖真实目录校验、去重、SQLite 重启恢复、旧会话保留和 API；`tests/workspace-history-live.spec.ts` 对真实 Core 验证路径搜索、选择、刷新、无结果和 390px 窄屏；`tests/workspace-picker.spec.ts` 仅替换原生弹窗边界验证选择/取消/错误。本轮未自动操作系统原生弹窗。截图保存在 `artifacts/browser/workspace-history-*.png`。

Self-review：不删除失效历史（移动磁盘重连后仍可选择），选中时重新校验；记录路径不是对模型执行的额外权限授权；异步回调绑定原会话 ID，不能改动已发消息会话。独立审查未执行，人工复核 pending。
