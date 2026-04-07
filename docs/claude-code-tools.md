# Claude Code 工具体系说明

这份文档基于当前仓库里的 Claude Code 源码整理，主要参考：

- [cloud-code/claude-code-source/src/tools.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/tools.ts)
- [cloud-code/claude-code-source/src/constants/tools.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/constants/tools.ts)

最核心的一点是：

Claude Code 不是只暴露一小组固定工具，而是有一整套分层工具系统，包括：

- 稳定核心工具
- 依赖运行环境的工具
- feature-gated 工具
- 内部或 Anthropic 专用工具
- 面向不同 agent 模式的 allow/deny 规则

所以如果你问“Claude Code 有哪些工具”，正确答案不是一份简单清单，而是一套带权限、环境、模式切换的工具体系。

## 1. 核心工具族

### Agent 与协作编排工具

这些工具是 Claude Code 多 agent 能力的核心：

- `AgentTool`
- `TaskOutputTool`
- `SendMessageTool`
- `TaskStopTool`

在某些模式或开关打开后，还会出现这些团队协作类工具：

- `TeamCreateTool`
- `TeamDeleteTool`
- `ListPeersTool`

这也是 Claude Code 和普通 chat 产品的重要差别之一。它更像一个 agent runtime，而不是单线程聊天框。

### 计划与任务管理工具

Claude Code 同时有 plan mode 和 task/todo 两套管理语义。

plan mode 相关核心工具：

- `EnterPlanModeTool`
- `ExitPlanModeV2Tool`
- `AskUserQuestionTool`
- `BriefTool`

todo 与 task 相关工具：

- `TodoWriteTool`
- `TaskCreateTool`
- `TaskGetTool`
- `TaskUpdateTool`
- `TaskListTool`
- `VerifyPlanExecutionTool`

这不只是一个简单 todo 功能，更像是执行过程管理层。

### Shell 与命令执行工具

Claude Code 可以直接执行命令，相关工具包括：

- `BashTool`
- `PowerShellTool`
- `REPLTool`

还有一些与终端或运行时采集相关的工具：

- `TerminalCaptureTool`
- `TungstenTool`

这些工具是否可用，取决于环境、平台和 feature flag。

### 文件与代码编辑工具

Claude Code 的核心代码操作工具包括：

- `FileReadTool`
- `FileEditTool`
- `FileWriteTool`
- `NotebookEditTool`

这几类工具让它能够在 workspace 中完成读取、编辑、创建等完整操作。

### 搜索与导航工具

Claude Code 内置了代码库搜索类工具：

- `GlobTool`
- `GrepTool`
- `ToolSearchTool`

还包括一些语言和代码智能相关工具：

- `LSPTool`
- `SnipTool`

另外源码里还能看到一层逻辑：

- 如果运行时已经内嵌了高性能搜索能力，`GlobTool` 和 `GrepTool` 甚至可以被省掉

### Web 与外部信息工具

Claude Code 也可以访问 repo 之外的信息：

- `WebFetchTool`
- `WebSearchTool`
- `WebBrowserTool`

它们代表的是不同能力：

- 已知 URL 抓取
- Web 搜索
- 浏览器式访问或导航

### MCP 与外部资源工具

Claude Code 还暴露了 MCP 资源访问工具：

- `ListMcpResourcesTool`
- `ReadMcpResourceTool`

如果接入了外部 MCP server 或资源系统，这组工具会很关键。

### Skill 与 Workflow 工具

Claude Code 会把可复用指令和流程脚本也纳入工具体系：

- `SkillTool`
- `WorkflowTool`

这意味着“能力扩展”不是藏在系统内部的黑盒，而是工具系统的一部分。

### Worktree 与环境切换工具

在启用相关模式时，Claude Code 可以进入和退出独立 worktree：

- `EnterWorktreeTool`
- `ExitWorktreeTool`

还可能暴露：

- `ConfigTool`

这让它在 workspace 隔离和环境感知上，比简单单目录 agent 更强。

## 2. 调度、监控与后台执行工具

Claude Code 还有一批 feature-gated 工具，用来支持后台执行、自动触发、监控等场景。

定时任务类工具：

- `CronCreateTool`
- `CronDeleteTool`
- `CronListTool`

后台与监控相关工具：

- `RemoteTriggerTool`
- `MonitorTool`
- `SleepTool`
- `PushNotificationTool`
- `SendUserFileTool`
- `SubscribePRTool`
- `SuggestBackgroundPRTool`

这组工具不是每个会话都会有，但它说明 Claude Code 的架构已经预留了主动式、异步式 agent 工作流。

## 3. 测试与内部诊断工具

源码里还能看到一些主要用于测试、诊断或内部开发的工具：

- `TestingPermissionTool`
- `OverflowTestTool`
- `CtxInspectTool`

这类工具本身也能说明系统成熟度。一个成熟的 agent runtime，往往会围绕上下文、权限、失败路径做内部观测和调试工具。

## 4. 工具可用性是如何控制的

并不是每个 Claude Code 会话都拥有全部工具。

工具可用性是由多层条件共同控制的，比如：

- runtime feature flags
- 环境变量
- 用户类型判断，例如 `process.env.USER_TYPE === 'ant'`
- 平台支持情况
- 一些 optimistic 或动态启用逻辑

从当前源码里可以直接看到一些例子：

- `ConfigTool` 只在 `USER_TYPE === 'ant'` 时出现
- `TungstenTool` 只在 `USER_TYPE === 'ant'` 时出现
- `LSPTool` 依赖 `ENABLE_LSP_TOOL`
- worktree 工具依赖 worktree mode
- cron 工具依赖 `AGENT_TRIGGERS`
- `WorkflowTool` 依赖 `WORKFLOW_SCRIPTS`
- `WebBrowserTool` 依赖 `WEB_BROWSER_TOOL`
- `SnipTool` 依赖 `HISTORY_SNIP`

所以“Claude Code 到底有哪些工具”这件事，更准确的说法应该是：

- 它有一组稳定核心工具
- 还有一大组按环境和开关动态出现的条件工具

## 5. 不同 Agent 模式下的 allow/deny 规则

Claude Code 不只是罗列工具，它还会根据 agent 的执行模式来约束工具权限。

在 [cloud-code/claude-code-source/src/constants/tools.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/constants/tools.ts) 里可以看到：

- 有些工具对所有 agent 都禁用
- 有些工具对 custom agent 禁用
- 有些工具允许 async agent 使用
- 有些工具只允许 in-process teammate 使用
- coordinator mode 还有自己专属的工具白名单

源码里能直接看到的例子包括：

- `TaskOutputTool` 会对 async agent 屏蔽
- `EnterPlanModeTool` 和 `ExitPlanModeV2Tool` 在一些 agent 场景下不允许使用
- `AgentTool` 会在某些模式下被限制，以避免递归
- `TaskCreateTool`、`TaskGetTool`、`TaskListTool`、`TaskUpdateTool` 允许给 in-process teammate 使用
- coordinator mode 主要保留的是 agent 管理和输出相关工具

这是一个很强的架构选择，说明 Claude Code 把工具权限视为 agent 安全和编排机制的一部分，而不只是 UI 配置。

## 6. 实际总结

和当前 Rovix Mastra 应用相比，Claude Code 的工具体系强在这几个点：

1. 原生工具面更大，覆盖代码、shell、计划、web、MCP、协作编排等多个层次。
2. 它明确区分不同 agent 模式下的工具权限。
3. 它把 workflow、调度、环境切换这些能力都做成了工具级能力。

如果你要拿 Claude Code 当 benchmark，最值得学的并不是“把所有工具都抄过来”，而是这些结构性思路：

- 把核心工具和 feature-gated 工具分层
- 给不同 agent 模式设计明确的 allow/deny 规则
- 把协作编排也纳入工具模型
- 在运行时里内建 overflow、权限、诊断相关工具

## 7. 当前源码快照里的工具清单

基于这次查看到的源码，Claude Code 暴露或按条件暴露的主要工具包括：

- `AgentTool`
- `TaskOutputTool`
- `BashTool`
- `GlobTool`
- `GrepTool`
- `ExitPlanModeV2Tool`
- `FileReadTool`
- `FileEditTool`
- `FileWriteTool`
- `NotebookEditTool`
- `WebFetchTool`
- `TodoWriteTool`
- `WebSearchTool`
- `TaskStopTool`
- `AskUserQuestionTool`
- `SkillTool`
- `EnterPlanModeTool`
- `ConfigTool`
- `TungstenTool`
- `WebBrowserTool`
- `TaskCreateTool`
- `TaskGetTool`
- `TaskUpdateTool`
- `TaskListTool`
- `OverflowTestTool`
- `CtxInspectTool`
- `TerminalCaptureTool`
- `LSPTool`
- `EnterWorktreeTool`
- `ExitWorktreeTool`
- `SendMessageTool`
- `ListPeersTool`
- `TeamCreateTool`
- `TeamDeleteTool`
- `VerifyPlanExecutionTool`
- `REPLTool`
- `WorkflowTool`
- `SleepTool`
- `CronCreateTool`
- `CronDeleteTool`
- `CronListTool`
- `RemoteTriggerTool`
- `MonitorTool`
- `BriefTool`
- `SendUserFileTool`
- `PushNotificationTool`
- `SubscribePRTool`
- `PowerShellTool`
- `SnipTool`
- `TestingPermissionTool`
- `ListMcpResourcesTool`
- `ReadMcpResourceTool`
- `ToolSearchTool`

需要注意：

- 这是一份“当前源码快照下可见的工具列表”
- 不是说任何一个 Claude Code 运行实例都会同时拥有这些工具

真正可用的工具集合，仍然要看 feature、环境、用户类型和 agent 模式。
