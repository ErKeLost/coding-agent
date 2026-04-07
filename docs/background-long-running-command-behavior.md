# 后台长任务命令行为分析

本文解释当前 Rovix `build-agent` 在启动开发服务器这类“长时间运行命令”时的真实行为，并对比 OpenCode 与 Codex 的做法。

## 1. 结论先看

你看到的这段流：

```json
data: {"type":"stream.event","eventName":"tool.call.completed","toolCallId":"call_f97lNfGbLotbzQIYwbRiwIcf","toolName":"bash","result":{"metadata":{"run_in_background":true,"processId":"shell-...","logPath":"/Users/.../.coding-agent/logs/shell-....log","success":true,"state":"running"}}}
```

说明的不是“bash 没拿到结果”，而是：

1. `bash` 已经**正常完成了一次工具调用**。
2. 这次工具调用返回的结果是“后台进程已启动”。
3. 它返回的是 **运行句柄**，不是最终 stdout/stderr。
4. 所以模型此时手里只有：
   - `state: "running"`
   - `processId`
   - `logPath`
5. 它**没有拿到** Vite 后续打印出来的 `Local: http://localhost:5173/` 那一段日志。

所以它后面只能说“通常是 `http://localhost:5173/`”，而不是“实际就是某个 URL”。

这不是模型瞎说，而是当前工具链路没有把后台日志继续喂回模型。

## 2. 当前 Rovix 是怎么做的

这一节先区分两个阶段：

1. 历史状态
2. 当前已经落地后的状态

前面 1-6 节主要解释的是“为什么之前会出现只会说通常是 5173”。

从本轮改造之后，当前真实行为已经向 Codex 风格推进了一步，下面单独说明。

### 2.1 `bash` 工具的后台模式

当前 `bash` 工具定义在：

- [mastra/tools/bash.tool.ts](/Users/work/coding-agent/mastra/tools/bash.tool.ts)

它支持 `run_in_background: true`。

当这个参数为 `true` 时，底层会走：

- [mastra/tools/local-command-exec.ts](/Users/work/coding-agent/mastra/tools/local-command-exec.ts)

这里的逻辑是：

1. 不等待命令退出。
2. 直接调用 `startManagedProcess(...)`。
3. 立刻返回一个结构化结果：
   - `success: true`
   - `state: "running"`
   - `processId`
   - `logPath`
   - `pid`

也就是说，后台启动类命令在当前实现里，**工具完成 ≠ 进程完成**。

工具完成只代表：

- “我已经成功把这个进程拉起来了。”

而不代表：

- “我已经看到了这个进程后续打印的内容。”

### 2.2 后台进程日志其实被保存了

后台进程输出不是丢了，而是被写进日志文件，并登记到本地进程注册表。

相关实现：

- [mastra/tools/local-process-manager.ts](/Users/work/coding-agent/mastra/tools/local-process-manager.ts)
- [lib/local-process.ts](/Users/work/coding-agent/lib/local-process.ts)

`startManagedProcess(...)` 会：

1. 创建 `processId`
2. 创建 `logPath`
3. 把 stdout/stderr 持续 append 到日志文件
4. 把进程状态记录成 `running`
5. 在进程退出后把状态更新为 `stopped` 或 `failed`

所以从产品层面说，当前系统实际上是“两段式”：

1. `bash` 返回“已启动后台进程”
2. 另一个接口再去读日志

### 2.3 旧版 UI 曾经有读取后台日志的接口

旧版相关代码曾经包括：

- `app/api/local-processes/route.ts`
- `app/api/local-processes/[processId]/logs/route.ts`
- `hooks/use-local-processes.ts`

这说明这套产品历史上其实支持过：

1. 列出本地运行中的后台进程
2. 根据 `processId` 拉取最新日志

不过这条旧版 UI 链路目前已经移除，主路径已经转向 `exec_command`、`write_stdin`、`listLocalProcesses`、`readLocalProcessLogs` 这些直接供 agent 使用的工具。

**当前最新实现里，这套能力已经重新暴露给 `build-agent` 了。**

## 3. 为什么模型会说“通常是 5173”

这是**改造前**的行为分析。

因为当前 `build-agent` 工具集里只有：

- [mastra/agents/build-agent.ts](/Users/work/coding-agent/mastra/agents/build-agent.ts)

实际注册的是：

1. `bash`
2. `glob`
3. `grep`
4. `read`
5. `edit`
6. `write`
7. `apply_patch`
8. 其他搜索/规划类工具

但**没有**下面这些“后台进程继续观察”工具：

1. `listLocalProcesses`
2. `readLocalProcessLogs`
3. `stopLocalProcess`
4. `write_stdin`
5. 专用 `startLocalDevServer`

因此模型做完 `bash(run_in_background: true)` 以后，实际上没法再继续做：

- “帮我读这个 `processId` 的最新日志”
- “等 2 秒后再看看 Vite 打印了什么”
- “提取真正的 Local URL”

于是它只能基于 Vite 常识回答：

- “通常是 `http://localhost:5173/`”

这个回答是**经验推断**，不是**运行验证**。

## 4. 当前链路的真实语义

这也是**改造前**的链路语义。

你可以把现在的语义理解成：

### 当前 Rovix `bash(run_in_background: true)`

返回的是：

```ts
{
  success: true,
  state: "running",
  processId: "...",
  logPath: "...",
}
```

它不返回的是：

```ts
{
  verifiedUrl: "http://localhost:5173/",
  verifiedPort: 5173,
  startupOutput: "VITE v... Local: http://localhost:5173/"
}
```

所以如果产品想让模型“直接知道真实端口”，必须补一段：

1. 后台启动
2. 等日志
3. 读日志
4. 解析 URL

目前这段没有自动发生。

## 5. OpenCode 是怎么做的

OpenCode 的工具注册在：

- [opencode/packages/opencode/src/tool/registry.ts](/Users/work/coding-agent/opencode/packages/opencode/src/tool/registry.ts)

它有 `bash`，但没有你这套 `run_in_background + processId + logPath` 设计。

OpenCode 的提示词里会建议模型：

- 对长任务用 `&` 放后台

可见：

- [opencode/packages/opencode/src/session/prompt/gemini.txt](/Users/work/coding-agent/opencode/packages/opencode/src/session/prompt/gemini.txt)

它的 `bash` 定义在：

- [opencode/packages/opencode/src/tool/bash.ts](/Users/work/coding-agent/opencode/packages/opencode/src/tool/bash.ts)

从实现上看，OpenCode 更像是：

1. 用 shell 本身去执行命令
2. 长任务通过 shell 语法后台化
3. 工具本身没有显式的 `processId/logPath` 协议

这意味着：

1. OpenCode 的“后台”更偏 shell 语义，不是产品级后台进程对象。
2. 它也**不天然保证**模型一定能拿到真实启动 URL。
3. 如果命令很快回 shell，但日志还在另一个后台进程里继续刷，模型同样可能只知道“它启动了”，不知道“它最终打印了什么”。

所以在“后台长任务可观测性”这件事上，OpenCode 并不是一个特别强的标准答案。

它更像：

- “允许你把命令放后台”

而不是：

- “为后台命令建立一个后续可追踪、可轮询、可解析的结构化运行协议”

## 6. Codex 是怎么做的

Codex 的工具计划在：

- [codex/codex-rs/tools/src/tool_registry_plan.rs](/Users/work/coding-agent/codex/codex-rs/tools/src/tool_registry_plan.rs)

可以看到它对命令执行有几种后端：

1. `shell`
2. `local_shell`
3. `shell_command`
4. `exec_command`
5. `write_stdin`

其中最关键的是：

- `UnifiedExec` 模式会同时启用 `exec_command` 和 `write_stdin`

在：

- [codex/codex-rs/tools/src/local_tool.rs](/Users/work/coding-agent/codex/codex-rs/tools/src/local_tool.rs)

可以看到 `exec_command` 的输出 schema 里明确有：

1. `session_id`
2. `output`
3. `exit_code`

并且 `write_stdin` 的说明就是继续往这个 still-running session 里写入或轮询。

这套语义比当前 Rovix 更强，因为它把“长任务”定义成：

1. 一次启动
2. 一个可继续交互的执行 session
3. 后续可以持续拿增量输出

所以从能力模型上说：

- **Codex 是真正把长任务当成 first-class execution session 来做。**

这也是为什么 Codex 风格更适合：

1. `npm run dev`
2. `rails s`
3. `python -m http.server`
4. REPL / watch / dev server / interactive command

这类不会自己很快退出的命令。

## 7. 三种方案对比

### Rovix 历史方案

优点：

1. 已经有后台进程注册表
2. 已经有日志文件
3. 已经有日志读取 API

缺点：

1. `build-agent` 无法继续读这些日志
2. 模型拿不到真实启动信息
3. UI 和 agent 是割裂的

### OpenCode 方案

优点：

1. 简单
2. shell 语义自然

缺点：

1. 后台命令不是结构化对象
2. 对“真实 URL/端口/ready 状态”不友好

### Codex 方案

优点：

1. 长任务是 first-class session
2. 模型可以继续读输出
3. 很适合 dev server / watcher / REPL

缺点：

1. 实现复杂度更高
2. 前后端协议要更严谨

## 8. 你现在看到的问题，本质上是哪一种

你这次看到的核心问题不是：

- “流坏了”

而是：

- “后台长任务被当成一次已完成工具调用结束了，但没有继续把后台输出接回模型上下文。”

所以当前现象完全符合现有实现：

1. `tool.call.completed`
2. `metadata.state = "running"`
3. assistant 只能根据常识说“通常是 5173”
4. `session.ended`

这条链在当前实现里其实是**自洽的**。

只是从产品体验上，它不够好。

## 9. 推荐的产品改法

### 方案 A：保留现有后台进程系统，给 agent 补“追日志”能力

这是最小改动方案。

做法：

1. `bash(run_in_background: true)` 返回 `processId`
2. agent 自动再调用一个新工具：
   - `read_process_logs(processId, waitForMs?: number, lines?: number)`
3. 从日志里解析：
   - 端口
   - URL
   - ready 状态
4. 再回复用户“实际地址是 ...”

优点：

1. 复用你现有 `local-process-manager`
2. 改动小
3. 很快能落地

状态：

- **本轮已经实现了这条方案的第一阶段。**

### 方案 B：把后台命令升级成 Codex 风格的 session

做法：

1. `bash` 不只返回 `processId`
2. 还返回一个可继续读输出的 session handle
3. 新增统一的：
   - `read_background_output`
   - `write_background_stdin`
   - `wait_background_ready`

优点：

1. 体验最好
2. 语义最清晰
3. 后续做 terminal/interactive tools 也更顺

缺点：

1. 改动更大

## 10. 一句话总结

当前 Rovix 对后台长任务的语义是：

- **“启动成功”是工具结果，**
- **“真正打印了什么”在另一条日志链路里。**

所以模型说“通常是 5173”，不是因为它胡说，而是因为它此刻确实只知道“进程启动了”，不知道“Vite 实际打印了哪个地址”。

如果想做到 Codex 那种确定性，就要把“后台运行”从一次性工具调用，升级成“可继续观察的执行会话”。

## 11. 当前已实现状态

这一节描述的是**现在仓库里的真实行为**。

### 11.1 `bash(run_in_background: true)` 已不再只返回空壳句柄

当前实现位置：

- [mastra/tools/local-command-exec.ts](/Users/work/coding-agent/mastra/tools/local-command-exec.ts)

后台命令现在的行为是：

1. 启动 managed process
2. 立刻拿到 `processId`
3. 再短暂等待一小段首屏日志
4. 把这段初始输出一并放回工具结果

当前内置等待参数：

1. `BACKGROUND_INITIAL_WAIT_MS = 1200`
2. `BACKGROUND_INITIAL_LINES = 80`

所以现在的后台命令返回结果更接近：

```ts
{
  success: true,
  state: "running",
  processId: "...",
  logPath: "...",
  stdout: "VITE v...\\nLocal: http://localhost:5173/",
  metadata: {
    background: true,
    initialOutputObserved: true,
    initialWaitMs: 1200
  }
}
```

如果首屏日志来得够快，模型第一次就能直接看到真实 URL。

### 11.2 长任务会话工具已经重新接回 `build-agent`

当前 `build-agent` 已注册这些长任务相关工具：

- [mastra/agents/build-agent.ts](/Users/work/coding-agent/mastra/agents/build-agent.ts)

包括：

1. `listLocalProcesses`
2. `readLocalProcessLogs`
3. `write_stdin`
4. `stopLocalProcess`

对应实现：

- [mastra/tools/list-local-processes.tool.ts](/Users/work/coding-agent/mastra/tools/list-local-processes.tool.ts)
- [mastra/tools/read-local-process-logs.tool.ts](/Users/work/coding-agent/mastra/tools/read-local-process-logs.tool.ts)
- [mastra/tools/write-stdin.tool.ts](/Users/work/coding-agent/mastra/tools/write-stdin.tool.ts)
- [mastra/tools/stop-local-process.tool.ts](/Users/work/coding-agent/mastra/tools/stop-local-process.tool.ts)

这意味着 agent 现在已经具备：

1. 启动后台命令
2. 拿到 `processId`
3. 继续追日志
4. 继续向 stdin 写入
5. 停掉会话

### 11.3 prompt 也改了，不再鼓励“猜端口”

当前 `build-agent` 指令里已经明确写了：

1. 长任务启动后，把 `processId` 当 follow-up session handle
2. 启动 dev server / watcher 后，用 `readLocalProcessLogs` 确认实际启动输出
3. 不要靠默认端口猜测结果

也就是说，正确路径已经从：

- “启动后直接回答，通常是 5173”

变成：

- “启动后优先读日志，确认真实 URL/port/failure”

## 12. 现在的最终方案

本轮改造后，Rovix 的默认长任务协议已经切到 **Codex 风格的 `exec_command + write_stdin` 会话模型**。

核心变化有三点：

1. 长任务不再以 `bash + run_in_background` 作为主路径。
2. `exec_command` 会先等待一小段 `yield_time_ms`，尽量拿到首屏输出。
3. 如果进程还活着，就返回 `session_id/sessionId`，后续统一走 `write_stdin` 续读。

也就是说，当前主语义已经从：

- “后台启动一个进程，再想办法读它的日志”

变成：

- “启动一个可续读的命令会话，第一次返回就尽量带上首屏输出，后续继续在同一 session 上轮询”

## 13. 现在如果用户说“帮我启动开发服务器”，流程是什么

下面是当前实现下，agent 应该走的真实流程。

### 13.1 第一步：调用 `exec_command`

模型应优先调用：

```json
{
  "tool": "exec_command",
  "parameters": {
    "cmd": "npm run dev",
    "workdir": "/your/project",
    "yield_time_ms": 1200
  }
}
```

注意这里已经不是旧的：

```json
{
  "tool": "bash",
  "parameters": {
    "command": "npm run dev",
    "run_in_background": true
  }
}
```

### 13.2 第二步：第一次结果就尽量拿首屏输出

`exec_command` 现在会：

1. 启动本地进程
2. 等待一小段时间收集输出
3. 如果命令已结束，直接返回 `completed`
4. 如果命令仍在运行，返回：
   - `state: "running"`
   - `session_id` / `sessionId`
   - 首屏 `stdout`

例如实测长命令会直接返回：

```json
{
  "state": "running",
  "stdout": "READY http://127.0.0.1:4567",
  "sessionId": "unified-exec-..."
}
```

这意味着如果 Vite/Next/dev server 在首屏就打印了地址，模型已经可以直接报告真实 URL，不需要猜。

### 13.3 第三步：如果还没看到 URL，就继续轮询同一个 session

如果第一次结果里只有：

- `state: "running"`
- 但还没有 `Local:` / `localhost:` / ready 信号

模型必须继续调用：

```json
{
  "tool": "write_stdin",
  "parameters": {
    "session_id": "...",
    "chars": "",
    "yield_time_ms": 1500
  }
}
```

这里 `chars: ""` 的含义就是：

- 不写任何输入
- 只是在同一个 session 上继续等一会儿并取新输出

这已经对齐 Codex 的 unified exec 轮询语义。

### 13.4 第四步：对用户的回答

现在理想回答应该是下面两种之一。

成功时：

- “开发服务器已经启动，实际地址是 `http://127.0.0.1:3000/`。”

失败时：

- “开发服务器启动失败，输出里显示端口被占用 / 配置报错 / 依赖缺失。”

如果进程还在运行，但就是还没打印 URL，也应该明确说：

- “进程已经启动并仍在运行，但当前输出里还没有看到实际访问地址。”

不应该再出现：

- “通常是 `http://localhost:5173/`。”

## 14. 会话后续操作

同一个 session 后续可以继续做这些事：

1. 用 `write_stdin(chars: "")` 继续轮询输出
2. 用 `write_stdin(chars: "...\n")` 给交互式进程发输入
3. 用 `stopLocalProcess` 停掉旧会话
4. 用 `readLocalProcessLogs` / `listLocalProcesses` 做兼容性恢复

其中：

- `write_stdin` 是主路径
- `readLocalProcessLogs` 是兼容旧 `bash` 后台进程的 fallback

## 15. 当前与 Codex 的对齐情况

现在已经和 Codex 方案在产品语义上基本一致：

1. 主入口是 `exec_command`
2. 长任务第一次调用就等待首屏输出
3. 仍在运行时返回 `session_id/sessionId`
4. 后续通过 `write_stdin` 在同一 session 上继续轮询
5. agent prompt 明确禁止“猜端口”式回答

当前这套链路已经可以支撑：

- “帮我启动开发服务器”
- “告诉我真实 URL”
- “继续看看输出”
- “给它发输入”
- “停掉它”

也就是说，长任务主路径已经不再是 OpenCode 式“后台 shell + 日志猜测”，而是 Codex 式“统一执行会话 + 会话续读”。

## 16. 例子：用户说“帮我启动开发服务器”时，系统会怎么做

这一节专门按真实执行顺序，把整条链路拆细。

假设用户消息是：

- “帮我启动开发服务器”

且当前工作目录是一个典型前端项目，比如 Next/Vite/React 项目。

### 16.1 第 0 步：agent 先判断这是不是长任务

agent 会先把这类请求识别成：

1. 需要运行命令
2. 命令大概率不会立刻退出
3. 后续还需要继续观察输出
4. 很可能要从输出里提取真实 URL、端口或报错

所以它**不应该**优先使用：

- `bash` 一次性跑完
- `bash + run_in_background` 然后直接回答“通常是 5173”

它应该优先进入：

- `exec_command` 会话模式

### 16.2 第 1 步：决定要跑什么命令

agent 会先基于项目上下文决定启动命令。

常见情况：

1. 如果用户明确说了命令，比如“运行 `npm run dev`”，那就直接用这个命令。
2. 如果用户没明确说，但仓库里常规脚本清楚，agent 一般会推断最可能的启动脚本。
3. 如果仓库里存在多个候选脚本，比如：
   - `npm run dev`
   - `bun run dev`
   - `pnpm dev`
   - `npm run site:dev`
   - `npm run desktop:dev`
   
   那 agent 应该基于当前任务和项目结构选最贴近“开发服务器”的那个。

在这个例子里，最典型的是：

```json
{
  "tool": "exec_command",
  "parameters": {
    "cmd": "npm run dev",
    "workdir": "/your/project",
    "yield_time_ms": 1200
  }
}
```

### 16.3 第 2 步：`exec_command` 启动命令

`exec_command` 收到请求后，不是简单“开个后台进程然后立刻返回”，而是会做这些事：

1. 在指定 `workdir` 启动本地命令
2. 建立一个统一执行会话
3. 为这次会话生成可复用的 `session_id/sessionId`
4. 先等待一小段时间
5. 尝试收集首屏输出

这一小段等待非常关键，因为它直接决定：

1. 能不能第一次就看到 dev server 打印出来的 URL
2. 能不能避免 agent 后面“猜端口”
3. 能不能把短命令和长命令分开处理

### 16.4 第 3 步：第一次结果返回时，可能出现三种情况

#### 情况 A：命令很快失败

比如：

1. 端口被占用
2. `node_modules` 没装
3. `package.json` 里没有 `dev` 脚本
4. 配置文件语法错

这时第一次 `exec_command` 结果通常就会是：

1. `state: "failed"` 或 `completed` 但带非零退出码
2. `stderr/stdout` 里直接有报错内容
3. 不会进入真正的长会话

agent 此时应该直接告诉用户：

- 启动失败了
- 失败原因是什么
- 报错来自哪一段输出

它**不应该**再继续猜：

- “也许已经启动了”
- “通常地址是……”

#### 情况 B：命令很快成功并退出

这类情况比较少见，但有可能发生，比如用户其实让你运行的是某个一次性准备命令。

这时 `exec_command` 会返回：

1. `state: "completed"`
2. `exitCode: 0`
3. 不带可续用的 session

这意味着：

- 这不是一个需要继续轮询的后台开发服务器

#### 情况 C：命令还在运行，这是最常见情况

这才是开发服务器最典型的路径。

此时第一次结果通常类似：

```json
{
  "state": "running",
  "stdout": "ready in 800ms\nLocal: http://127.0.0.1:3000/",
  "sessionId": "unified-exec-..."
}
```

或者：

```json
{
  "state": "running",
  "stdout": "Starting dev server...",
  "sessionId": "unified-exec-..."
}
```

区别在于：

1. 第一种已经拿到了真实 URL
2. 第二种还只是知道“服务在启动中”

### 16.5 第 4 步：如果第一次已经看到 URL，会怎么回复

如果第一次 `stdout` 里已经有明确地址，比如：

1. `Local: http://127.0.0.1:3000/`
2. `http://localhost:5173/`
3. `Network: http://192.168.1.5:3000/`

那么 agent 这时就已经有充分依据告诉用户：

- 开发服务器已启动
- 实际访问地址是什么
- 这个地址来自命令的真实输出

这时 agent 可以结束本轮说明，但会保留会话句柄，方便后续继续观察或停止它。

### 16.6 第 5 步：如果第一次还没看到 URL，会怎么继续

如果第一次只拿到了：

1. `state: "running"`
2. 一些启动中的日志
3. 但还没有看到 `Local:`、`localhost:`、`ready` 后的地址

那么 agent **不能停在这里**。

它应该立刻继续调用：

```json
{
  "tool": "write_stdin",
  "parameters": {
    "session_id": "unified-exec-...",
    "chars": "",
    "yield_time_ms": 1500
  }
}
```

这里要注意两点：

1. `session_id` 指向的是刚才那次 `exec_command` 返回的会话
2. `chars` 传空字符串，意思不是报错，而是“只轮询，不写输入”

这一步的语义其实就是：

- “在同一个正在运行的命令上，再等一会儿，把新输出拿给我”

### 16.7 第 6 步：轮询之后会发生什么

`write_stdin(chars: "")` 返回后，也会分几种情况。

#### 情况 A：现在看到 URL 了

比如新输出里出现：

- `Local: http://127.0.0.1:3000/`

这时 agent 就应该立刻告诉用户：

- 开发服务器已经启动
- 实际地址就是这个

#### 情况 B：现在看到明确错误了

比如：

1. 端口冲突
2. 编译失败
3. 缺失环境变量
4. TypeScript/ESLint 报错阻塞启动

这时 agent 应该告诉用户：

- 服务没有成功启动
- 当前真实错误是什么

#### 情况 C：还在运行，但仍未打印地址

比如输出只有：

- `compiling...`
- `warming up...`
- `building dependency graph...`

这时 agent 可以再做一到多次合理轮询，但目标始终是：

1. 拿到真实 URL
2. 或拿到真实报错
3. 或明确知道“它还没吐出来”

### 16.8 第 7 步：什么时候应该停止轮询

一般应在下面几种情况停止：

1. 已拿到明确 URL
2. 已拿到明确失败原因
3. 轮询数次后，进程仍在运行但没有产生足够信息

第三种情况下，agent 的正确回答应当类似：

- “开发服务器进程已经启动并保持运行，但当前输出里还没有打印实际访问地址。”

而不是：

- “通常是 5173”

### 16.9 第 8 步：回答用户时，应该怎么组织信息

理想回答顺序是：

1. 先说当前状态
2. 再说真实地址或真实错误
3. 最后说明接下来还可以继续做什么

例如：

成功时：

- “开发服务器已经启动，实际地址是 `http://127.0.0.1:3000/`。如果你要，我可以继续帮你看实时输出或停掉它。”

失败时：

- “开发服务器没有成功启动。当前输出显示端口 `3000` 已被占用。你要的话我可以继续帮你查是谁占了这个端口，或者帮你换一个端口重启。”

运行中但地址未出现时：

- “开发服务器进程已经启动并在运行，但当前输出里还没看到实际访问地址。我可以继续在这个 session 上等一会儿并追后续日志。”

### 16.10 第 9 步：这之后同一个会话还能做什么

用户后续如果继续说：

1. “再看看输出”
2. “给它按一下回车”
3. “停掉这个服务”
4. “这个地址到底出来没有”

agent 应继续使用同一个 session，而不是重新启动一次。

典型操作是：

1. `write_stdin(session_id, chars: "")`
   - 继续轮询
2. `write_stdin(session_id, chars: "\n")`
   - 发送回车
3. `stopLocalProcess(processId)`
   - 停掉会话对应进程

### 16.11 这条流程里，系统明确不会做什么

为了和 Codex 行为对齐，当前设计刻意避免这些旧行为：

1. 不把“后台启动成功”误当成“已经知道真实 URL”
2. 不把“通常是 5173”当成验证结果
3. 不在第一次没拿到结果时立刻让用户自己贴终端输出
4. 不丢掉这次长任务的会话句柄
5. 不把后续轮询变成一个全新的、无上下文的命令

### 16.12 用一句话概括这条链路

当用户说“帮我启动开发服务器”时，当前系统的正确行为是：

- 先用 `exec_command` 启动一个可续读会话，尽量在第一次结果里拿到真实启动输出；如果还没拿到，就继续用同一个 `session_id` 通过 `write_stdin(chars: "")` 轮询，直到得到真实 URL、真实报错，或者明确告诉用户“进程在跑，但地址还没打印出来”。
