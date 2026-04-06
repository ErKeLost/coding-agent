# Build Agent / OpenCode / Codex 工具对比与优化建议

## 1. 结论先看

- 你的 `build-agent` 现在是**静态工具集合**，覆盖面够用，但有明显的“多执行面并存”问题（`bash/shell/exec_command/unified_exec` 同时存在），策略不统一时就容易出现首调失败、回退不一致、结果形态不一致。
- `opencode` 的特点是**工具注册中心 + 按模型/特性动态过滤**，例如 `apply_patch` 和 `edit/write` 互斥选择，减少重复能力冲突。
- `codex` 的特点是**plan builder（按 config 组装工具）+ handler-kind 分发**，同一能力可切换后端（`shell/local_shell/shell_command/exec_command`），并且保留标准化事件/输出通路。
- 你当前最该优化的是：**收敛命令执行入口**与**统一结果结构**，其次再做“工具启用策略”。

---

## 2. 盘点来源（代码位置）

- Build Agent 定义：`/Users/work/coding-agent/mastra/agents/build-agent.ts`
- Build Agent 工具导出：`/Users/work/coding-agent/mastra/tools/index.ts`
- OpenCode 工具注册：`/Users/work/coding-agent/opencode/packages/opencode/src/tool/registry.ts`
- Codex 工具 plan 组装：`/Users/work/coding-agent/codex/codex-rs/tools/src/tool_registry_plan.rs`
- Codex 工具类型导出：`/Users/work/coding-agent/codex/codex-rs/tools/src/lib.rs`

---

## 3. 你的 Build Agent 工具（当前实际启用）

来自 `staticTools`（`mastra/agents/build-agent.ts`）：

1. `apply_patch`
2. `bash`
3. `clean_background_terminals`
4. `edit`
5. `exec_command`
6. `imageGenerate`
7. `list`
8. `listLocalProcesses`
9. `read`
10. `readLocalProcessLogs`
11. `shell`
12. `skill`
13. `startLocalDevServer`
14. `stopLocalProcess`
15. `todoread`
16. `todowrite`
17. `tool_search`
18. `tool_suggest`
19. `unified_exec`
20. `webfetch`
21. `websearch`
22. `write_stdin`
23. `write`

补充：`mastra/tools/index.ts` 还导出了 `listDirTool` 与 `runWorkspaceCommandTool`，但当前 **build-agent 未注册这两个工具**。

---

## 4. OpenCode 工具（核心与条件启用）

来自 `opencode/.../tool/registry.ts`：

核心集合（常规）：

1. `invalid`
2. `bash`
3. `read`
4. `glob`
5. `grep`
6. `edit`
7. `write`
8. `task`
9. `webfetch`
10. `todowrite`
11. `websearch`
12. `codesearch`
13. `skill`
14. `apply_patch`

条件集合（按 flag/config/model）：

1. `question`（客户端或 flag）
2. `lsp`（实验开关）
3. `batch`（实验开关）
4. `plan`（实验开关 + CLI）
5. `custom tools`（目录扫描与插件注入）

关键策略：

- `apply_patch` 与 `edit/write` 按模型能力做互斥切换，降低重复编辑面冲突。
- `websearch/codesearch` 会按 provider/flag 过滤。

---

## 5. Codex 工具（按配置组装）

来自 `codex-rs/tools/src/tool_registry_plan.rs`，是“可配计划”而非固定清单。

基础能力（视 config）：

1. `update_plan`
2. `shell` / `local_shell` / `shell_command` / `exec_command`（按 `shell_type`）
3. `write_stdin`（`UnifiedExec` 模式）
4. `apply_patch`
5. `view_image`
6. `web_search`
7. `image_generation`
8. `list_dir`
9. `test_sync_tool`
10. `request_user_input`
11. `request_permissions`
12. `tool_search`
13. `tool_suggest`
14. `js_repl` / `js_repl_reset`

协作能力（collab）：

1. `spawn_agent`
2. `send_input` / `send_message`
3. `wait_agent`
4. `close_agent`
5. `resume_agent`（v1）
6. `followup_task` / `list_agents`（v2）
7. `spawn_agents_on_csv`
8. `report_agent_job_result`

扩展能力：

1. MCP 工具自动注入
2. Dynamic tools 自动注入

关键策略：

- 先 build plan，再根据 `ToolHandlerKind` 绑定 handler，结构清晰。
- 同一类能力可以切后端，但工具命名和 handler 映射是显式的。

---

## 6. 三者对比（聚合视角）

### 6.1 命令执行面

- Build Agent：`bash + shell + exec_command + unified_exec + startLocalDevServer`
- OpenCode：主执行面偏 `bash`（另有 batch/插件扩展）
- Codex：按 `shell_type` 只启一个主执行模型，统一到 plan/config

判断：Build Agent 的执行面最“宽”，但也最容易出现策略不一致。

### 6.2 编辑面

- Build Agent：`apply_patch + edit + write` 并存
- OpenCode：`apply_patch` 与 `edit/write` 有策略互斥
- Codex：`apply_patch` 为核心编辑通路，其他多为运行/编排能力

判断：Build Agent 可借鉴 OpenCode 的“互斥启用”策略，减少模型选择抖动。

### 6.3 发现与建议能力

- Build Agent：`tool_search + tool_suggest`（已具备）
- OpenCode：有同类能力 + 插件注入
- Codex：有同类能力 + MCP/Dynamic 注入

判断：你已经有基础，但缺“统一 catalog 驱动启用策略”。

---

## 7. 当前重复点与可优化点（重点）

### [P0] 收敛命令执行入口（最优先）

问题：

- 现在并行暴露 `bash/shell/exec_command/unified_exec/startLocalDevServer`，模型在不同回合可能走不同路径。
- 导致现象：同一任务第一步走壳命令，第二步走 session 命令，错误和结果结构不一致。

建议：

1. 保留 `exec_command + write_stdin` 作为主执行面（交互/长任务友好）。
2. `bash/shell/unified_exec` 改为兼容层或内部路由，不再鼓励直接调用。
3. 在 prompt 合约里明确“默认只用 `exec_command`，需要兼容时才降级”。

---

### [P0] 统一工具结果结构（成功/失败都结构化）

问题：

- 你历史问题里出现“有 tool result 但前端判定 missing result”。
- 根因通常是不同工具返回结构字段不一致（`success/state/error/stderr/metadata` 混用）。

建议：

1. 统一输出 envelope：`{ success, state, stdout, stderr, exitCode, timedOut, metadata }`。
2. 前端只读一套标准字段，再做兼容回退。
3. 对 spawn ENOENT、cwd 无效、权限拒绝，全部落入结构化失败而非抛异常中断。

---

### [P1] 编辑工具策略互斥

问题：

- `apply_patch + edit + write` 都可改文件，模型常会“风格漂移”。

建议：

1. 默认仅启用 `apply_patch`（结构化变更可审计）。
2. `edit/write` 作为 fallback，仅在 patch 不适用时启用。
3. 在 system/instructions 内加“优先 apply_patch，不得混用”。

---

### [P1] 减少“名字相近能力”并存

问题：

- `list` 与潜在 `list_dir`、`webfetch` 与 `websearch`、`tool_search` 与自然语言解释容易混淆。

建议：

1. 对每个工具给“首选场景”一句硬规则（写入 prompt）。
2. 前端工具栏展示分组标签：执行、文件、网络、编排。

---

### [P2] 清理未接线导出，避免维护债

现状：

- `mastra/tools/index.ts` 导出 `listDirTool` 与 `runWorkspaceCommandTool`，但 `build-agent` 未注册。

建议：

1. 要么接入并定义明确用途。
2. 要么移除导出并在文档注明弃用。

---

## 8. 建议的落地顺序（可执行）

1. 第一阶段（当天可做）
2. 把默认执行路径收敛到 `exec_command/write_stdin`。
3. 保证所有执行失败都返回统一结构字段。
4. 第二阶段（1-2 天）
5. 编辑策略改为 `apply_patch` 主通道，`edit/write` 受控回退。
6. 清理未接线工具导出，补一份工具能力清单自动生成脚本。
7. 第三阶段（持续）
8. 引入“tool policy 层”（类似 OpenCode/Codex 的 config-based 启用计划）。
9. 按模型/环境动态启用工具，避免全量暴露。

---

## 9. 你现在这套 Build Agent 的定位建议

- 如果目标是“稳定执行 + 少惊喜”，建议向 Codex 风格靠：`plan + config + handler-kind`。
- 如果目标是“扩展插件生态”，建议向 OpenCode 风格靠：`registry + dynamic filter + plugin injection`。
- 你当前最实用路线：先做 Codex 风格的**执行面收敛与结果标准化**，再逐步补 OpenCode 风格的**动态启用策略**。

---

## 10. 最新状态（2026-04-06，已实现）

这一节是“当前真实代码状态”，用于覆盖前文中的历史分析结论。

### 10.1 当前 Build Agent 的整体逻辑

当前 `build-agent` 已改成 **opencode 风格核心工具集**，并且按“文件检索 → 编辑 → 验证”的路径引导。

当前实际注册工具（`mastra/agents/build-agent.ts`）：

1. `apply_patch`
2. `batch`
3. `bash`
4. `codesearch`
5. `edit`
6. `glob`
7. `grep`
8. `question`
9. `read`
10. `skill`
11. `task`
12. `todowrite`
13. `webfetch`
14. `websearch`
15. `write`

当前执行策略：

1. 首选 `read/glob/grep/codesearch` 获取上下文。
2. 编辑优先 `apply_patch`，其次 `edit/write`。
3. 命令执行主入口为 `bash`。
4. 多个独立工具调用用 `batch` 并行执行。
5. 必要时才用 `question` 向用户追问。

---

## 11. 本轮已完成优化

### 11.1 工具面收敛到 opencode 核心集合

已完成：

1. `build-agent` 工具清单切换为 opencode 核心风格。
2. 新增并接入 `glob/grep/codesearch` 工具能力。
3. 同步更新工具描述加载与导出。

相关文件：

- `mastra/agents/build-agent.ts`
- `mastra/tools/index.ts`
- `mastra/tools/glob.tool.ts`
- `mastra/tools/grep.tool.ts`
- `mastra/tools/codesearch.tool.ts`
- `mastra/tools/rg-runner.ts`
- `mastra/tools/sandbox-helpers.ts`

### 11.2 删除未使用或已弃用工具

已完成删除（代码文件层面）：

1. `clean-background-terminals.tool.ts`
2. `exec-command.tool.ts`
3. `unified-exec.tool.ts`
4. `write-stdin.tool.ts`
5. `shell.tool.ts`
6. `start-local-dev-server.tool.ts`
7. `stop-local-process.tool.ts`
8. `list-local-processes.tool.ts`
9. `read-local-process-logs.tool.ts`
10. `list-dir.tool.ts`
11. `run-workspace-command.tool.ts`
12. `tool-search.tool.ts`
13. `tool-suggest.tool.ts`
14. `image-generate.tool.ts`
15. `firecrawl-crawl-start.tool.ts`
16. `firecrawl-crawl-status.tool.ts`

并同步清理了 `index.ts` 导出和 `tool-catalog.ts` 条目，避免旧工具被继续发现与调用。

### 11.3 `P0` 结果结构统一（已落地主干）

已完成：

1. 底层执行结果标准化为 envelope：
   `{ success, state, stdout, stderr, exitCode, timedOut, metadata }`
2. stream 路由失败判定统一：
   `success === false` 或 `state in {failed, timed_out}` 均视为失败。
3. stream 失败事件优先透出结构化错误首行（不再只给 “Tool failed”）。
4. 前端增加统一 envelope 读取函数，先读统一字段，再兼容旧字段回退。

相关文件：

- `mastra/tools/local-command-exec.ts`
- `app/api/agents/[agentId]/stream/route.ts`
- `app/[id]/page.tsx`

---

## 12. 仍可继续优化的点（下一步）

### [P1] 编辑工具互斥策略还可更严格

当前状态：

- 已引导“优先 apply_patch”，但 `edit/write` 仍同时可用。

建议：

1. 增加模型级工具过滤策略（类似 opencode）：
   某些模型只暴露 `apply_patch`，另一些场景才开放 `edit/write`。

### [P1] 增加 `invalid` 工具占位

当前状态：

- 还没有 opencode 那种 `invalid` 工具（用于兜底错误工具调用）。

建议：

1. 增加 `invalid`，把未知/错误工具调用统一转成可解释的结构化返回。

### [P1] 工具注册从静态对象升级为策略层

当前状态：

- 仍是 `staticTools` 直接注册。

建议：

1. 提供 `tool policy resolver`：
   按模型、客户端、环境动态决定启用哪些工具。

### [P2] 补充自动化回归

建议新增测试：

1. “tool.call.completed 不丢失结果”回归用例。
2. “失败工具必有结构化 stderr/state”回归用例。
3. “missing result UI 提示可读且包含首行错误”回归用例。
