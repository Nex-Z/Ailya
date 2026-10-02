# Windows PowerShell 原生命令 stderr 不等于执行失败

- Status: validated
- 日期 / 范围：2026-09-28；scripts/quality-check.ps1 的 Windows PowerShell 运行路径。
- 触发条件：全局 ErrorActionPreference=Stop，原生命令写入 stderr，即使内容只是 Vite 体积警告或 Node 环境变量警告。
- 实际失败：首次 static/browser 运行被误报失败；日志显示构建已经产生文件，但脚本在 stderr 输出处进入 catch。
- 原因：Windows PowerShell 将原生命令 stderr 映射为错误记录；脚本把错误流误当成非零退出码。
- 修复：仅在原生命令调用范围允许错误流继续，读取 LASTEXITCODE，finally 恢复 Stop；非零退出码仍使报告失败。
- 证据：artifacts/quality/20260928-200203-0155b3a3（误报），20260928-200237-ab8f03fd（static 通过），20260928-200242-eaa93fc0（browser 通过）。这些本地日志不入 Git，首次可复现条件见上文。
- 反例：stderr 不应被忽略；日志仍保存，真实非零退出需阻止通过。不能将全局错误策略改成 Continue，也不能推广为所有 PowerShell cmdlet 失败都忽略。
- 建议规则归属：当前脚本局部注释已经足够，暂不增加 AGENTS 全局规则。
- 人工采纳决定：无；本记录不构成强制规则。
