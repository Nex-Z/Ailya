# Ailya

个人 AI Agent 工作台的前端交互原型。React + TypeScript + Vite + Tailwind CSS + shadcn/ui 源码组件 + assistant-ui + Zustand。

当前冻结基线：`prototype-v1.0.0`（2026-09-28）。正式版基于此代码继续开发，界面与交互以冻结版为验收参考。

- [冻结说明与功能验收清单](docs/prototype-freeze-v1.0.0.md)
- [生产实现约束](docs/production-contract.md)

## 开发

```powershell
npm ci
npm run dev
```

```powershell
npm run build
npm run lint
# 启动 localhost:5173 后
npx playwright test
```

首次测试可能需要 `npx playwright install chromium`。

当前提供会话、富文本/工具消息、团队面板、提问、附件、文件差异、Agent/Group、扩展、定时任务和设置的原型交互。附件按会话在内存中保留 File，刷新释放。发送快捷键支持 Enter 或 Ctrl+Enter。

真实模型生成、Core 执行、调度、IM、语音、插件加载和文件修改尚未实装。浏览器中的模拟状态不得作为正式功能验收依据。

## 参考版

`releases/prototype-v1.0.0/` 包含源码包、可用 HTTP 静态服务器运行的构建包和校验清单；该目录不纳入 Git。冻结标签包含源码、锁文件、测试和交接文档。后续代码修改不改变冻结标签。
