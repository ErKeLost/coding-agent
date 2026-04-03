# Skills And Plugins Architecture

## Goal

为当前这套 Tauri + Next.js + Mastra 应用增加两层扩展能力：

- Skills: 轻量、可组合、以提示词和工作流为主的能力包
- Plugins: 较重、可安装、可启停、可携带 skills/tools/MCP/app 能力的扩展包

这套设计的目标不是复刻 Codex 的全部实现，而是复用当前仓库已经存在的能力边界，补齐缺失的注册、发现、启停、权限和 UI 管理层。

## Current State

当前仓库已经具备一部分 skill 基础设施，但仍然是半成品。

已有能力：

- Mastra 主入口在 `mastra/index.ts`
- 主 agent 在 `mastra/agents/build-agent.ts`
- 工具集合在 `mastra/tools/index.ts`
- 本地 workspace 封装在 `mastra/workspace/local-workspace.ts`
- 会话与线程状态在 `lib/thread-session.ts`
- 流式 API 在 `app/api/agents/[agentId]/stream/route.ts`
- 前端流式消费在 `hooks/use-agent-stream.ts`
- Tauri 负责本地工作区与进程桥接，在 `src-tauri/src/lib.rs`

已有 skill 雏形：

- `mastra/tools/skill.tool.ts` 已经能扫描 `SKILL.md`
- 工作区内已经存在 `.agents/skills/*`

当前缺口：

- skill 发现路径不统一
- 没有统一的 skill registry
- 没有插件 manifest、插件注册表、插件安装目录规范
- 没有插件启停与权限策略
- 没有插件 UI 管理页
- 线程态没有记录已启用 skills/plugins
- 插件能力不能动态注入到 Mastra agent

## Core Design Principles

1. Skills 和 plugins 分层。

   Skill 解决的是“如何做”，偏提示、流程、参考资料、脚本。

   Plugin 解决的是“系统能做什么”，偏能力包、工具包、外部连接器、安装和治理。

2. 运行时能力必须经过 registry，不允许 UI 直接扫盘拼装。

3. 所有扩展都要能映射到当前线程上下文，而不是只做全局开关。

4. 插件默认最小权限，技能默认只读元数据按需加载正文。

5. 先支持本地插件和仓库插件，再考虑远程 marketplace。

## Recommended Layering

### Layer 1: Skill Runtime

职责：

- 发现 skill
- 解析 metadata
- 读取 skill 正文与附属 references/scripts
- 做启用、禁用、线程绑定
- 向 agent 暴露可选技能列表

建议新增模块：

- `mastra/skills/registry.ts`
- `mastra/skills/loader.ts`
- `mastra/skills/types.ts`
- `mastra/skills/policy.ts`

建议保留 `mastra/tools/skill.tool.ts`，但将其改为 skill registry 的消费者，而不是自己直接扫目录。

### Layer 2: Plugin Runtime

职责：

- 发现插件
- 解析插件 manifest
- 管理安装态和启用态
- 装配插件暴露的 skills、tools、MCP、apps
- 控制插件权限和隔离策略

建议新增模块：

- `mastra/plugins/registry.ts`
- `mastra/plugins/loader.ts`
- `mastra/plugins/types.ts`
- `mastra/plugins/policy.ts`
- `mastra/plugins/install.ts`

### Layer 3: Agent Composition

职责：

- 将核心静态 tools 与插件动态 tools 合并
- 将 thread 选中的 skills 注入请求上下文
- 根据插件启用态注册额外 MCP 和 app 连接器

建议新增模块：

- `mastra/agents/runtime/build-agent-runtime.ts`
- `mastra/agents/runtime/resolve-runtime-capabilities.ts`

`mastra/agents/build-agent.ts` 继续做 agent 定义，但工具装配逻辑迁移到 runtime resolver。

### Layer 4: Product Surface

职责：

- Next.js API 暴露 registry 管理接口
- 前端展示 skills 面板与 plugins 面板
- Tauri 处理本地目录、进程、系统权限桥接

## Skill Model

### Skill Package Structure

推荐统一成下面的结构：

```text
.agents/skills/<skill-name>/
  SKILL.md
  agents/openai.yaml
  references/
  scripts/
  assets/
```

兼容读取：

- `.agents/skills`
- `.mastra/skills`
- `.codex/skills`
- `~/.agents/skills`

建议废弃：

- `.howone` 作为 skill 根目录

原因是它当前语义不清晰，不利于长期扩展。

### Skill Metadata

建议抽象：

```ts
export type SkillManifest = {
  id: string
  name: string
  description: string
  scope: 'workspace' | 'user' | 'plugin'
  filePath: string
  dir: string
  tags?: string[]
  inputHint?: string
  userInvocable?: boolean
  dependencies?: {
    plugins?: string[]
    mcps?: string[]
    env?: string[]
  }
}
```

### Skill Resolution Rules

1. 先读线程显式启用 skills
2. 再读 workspace 默认 skills
3. 再读 user 级 skills
4. 同名时优先级：thread override > workspace > plugin > user

### Skill Loading Strategy

分三层加载：

- 列表阶段：只读 metadata
- 触发阶段：读取 SKILL.md 正文
- 深入阶段：按需读取 references/scripts

这和你现在 `skill.tool.ts` 的方向是一致的，但需要上移到 registry 做统一治理。

## Plugin Model

### Plugin Package Structure

建议使用应用自己的插件规范，不直接照搬 Codex 的 `.codex-plugin` 命名。

推荐结构：

```text
plugins/<plugin-id>/
  plugin.json
  skills/
  tools/
  prompts/
  references/
  assets/
  mcp.json
  app.json
```

如果你希望兼容 Codex 风格，可以在 loader 内同时兼容：

- `plugin.json`
- `.codex-plugin/plugin.json`

但对你自己的产品，建议统一收敛到 `plugin.json`。

### Plugin Manifest

建议定义为：

```ts
export type AppPluginManifest = {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  enabledByDefault?: boolean
  entrypoints?: {
    skillsDir?: string
    toolsDir?: string
    mcpConfig?: string
    appConfig?: string
  }
  capabilities?: {
    skills?: boolean
    tools?: boolean
    mcp?: boolean
    appConnectors?: boolean
  }
  permissions?: {
    filesystem?: 'none' | 'read' | 'write'
    network?: 'none' | 'allowlist' | 'full'
    commands?: string[]
    env?: string[]
  }
  ui?: {
    displayName?: string
    icon?: string
    category?: string
  }
}
```

### Plugin States

建议状态机：

- `discovered`
- `installed`
- `enabled`
- `disabled`
- `error`

### Plugin Sources

第一阶段只做两类：

- workspace local: `./plugins/*`
- user local: `~/.coding-agent/plugins/*`

第二阶段再加：

- marketplace remote manifest

## API Design

建议新增以下 API 路由。

### Skills

- `GET /api/skills`
  - 返回 metadata 列表
- `GET /api/skills/[skillId]`
  - 返回 skill 正文和依赖信息
- `POST /api/skills/resolve`
  - 输入 threadId、workspaceRoot、query，返回建议启用的 skills
- `POST /api/threads/[threadId]/skills`
  - 设置线程启用 skills

### Plugins

- `GET /api/plugins`
  - 返回 discovered plugins 和状态
- `GET /api/plugins/[pluginId]`
  - 返回插件详情
- `POST /api/plugins/[pluginId]/enable`
- `POST /api/plugins/[pluginId]/disable`
- `POST /api/plugins/install`
  - 第一阶段仅支持本地目录导入
- `POST /api/plugins/rescan`

### Runtime

- `GET /api/runtime/capabilities?threadId=...`
  - 返回当前线程有效的 skills/plugins/tools/MCP

## Session And Persistence Design

当前 `lib/thread-session.ts` 还没有扩展配置位，建议增加：

```ts
type ThreadExtensionState = {
  enabledSkillIds: string[]
  pinnedSkillIds: string[]
  enabledPluginIds: string[]
  disabledPluginIds?: string[]
  capabilitySnapshot?: {
    tools: string[]
    mcps: string[]
    apps: string[]
  }
}
```

建议挂到：

```ts
ThreadSessionState['extensions']
```

这样流式路由在 `app/api/agents/[agentId]/stream/route.ts` 内构造 request context 时，可以把 thread 的扩展态一起注入。

## Mastra Integration

### What Belongs In Agent

放在 agent runtime：

- tool 装配
- skill 注入
- prompt augmentation
- plugin capability merge

### What Belongs In Workflow

放在 workflow：

- 插件安装流程
- 插件校验流程
- skill 推荐流程
- 扩展权限审批流程

当前 `mastra/workflows` 还是空的，正好适合承接这类结构化流程。

建议先新增：

- `mastra/workflows/install-plugin-workflow.ts`
- `mastra/workflows/resolve-skills-workflow.ts`

### Dynamic Tool Composition

当前 `build-agent.ts` 里是固定 `staticTools`。建议改成：

1. 核心内置工具始终保留
2. 根据线程启用 plugins 动态合并 plugin tools
3. 根据权限策略过滤不可用工具
4. 将最终工具集传给 agent

建议保留内置工具最小集合：

- 文件读写
- shell/bash
- todo
- web
- skill loader

插件工具不要直接写死在主 agent 文件里。

## Tauri Responsibilities

Tauri 不应该承担扩展编排逻辑，只负责本地宿主能力。

建议职责：

- 选择插件目录
- 允许导入本地插件包
- 提供插件需要的系统级能力桥接
- 暴露安全受控的本地进程启动能力

建议不要做：

- 在 Rust 侧实现 skill/plugin registry
- 在 Tauri 侧做插件业务逻辑解析

原因是你当前 agent 和流式会话主逻辑都在 Next.js + Mastra 层，扩展系统也应该留在同一层，减少双端状态同步复杂度。

## UI Design

### Left Sidebar Additions

建议新增两个一级入口：

- Skills
- Plugins

### Skills Panel

展示：

- 当前线程启用技能
- 推荐技能
- workspace 技能
- user 技能

操作：

- 启用到当前线程
- 固定为当前 workspace 默认
- 查看 skill 正文

### Plugins Panel

展示：

- 已安装
- 已启用
- 可发现但未启用
- 错误插件

操作：

- 启用/禁用
- 查看权限
- 查看插件带来的 skills/tools/MCP/apps
- 从本地目录导入

### Composer Integration

建议在输入区上方增加 capability chips：

- `skills: 3`
- `plugins: 2`

点击可展开编辑当前线程扩展态。

## Security Model

### Skill Security

skill 默认不直接获得执行权。

skill 只是说明书，真正的执行依赖：

- 内置工具
- 插件工具
- MCP 连接器

### Plugin Security

plugin 必须显式声明权限。

建议最小策略：

1. 默认禁写文件
2. 默认禁外网
3. 默认禁任意命令执行
4. 需要命令执行时走 allowlist
5. 需要 env 时走显式 allowlist

### Trust Zones

建议三层：

- core trusted: 你仓库内置能力
- workspace trusted: 当前仓库 `plugins/*`
- user imported: 用户本地导入插件

对 `user imported` 默认更严格。

## Immediate Gaps To Fix First

这是第一批必须先改的地基问题。

1. `mastra/workspace/local-workspace.ts` 当前 skill 路径不包含 `.agents/skills`，但 `mastra/tools/skill.tool.ts` 会扫 `.agents/skills`。

   这会导致 workspace 自带技能在不同入口下行为不一致。

2. `skill.tool.ts` 现在直接自己扫目录，不经过 registry。

   后面一旦接入 plugin skills、线程启用态、权限过滤，会越来越难维护。

3. `build-agent.ts` 当前工具列表是静态的。

   不改成 runtime composition，就无法做真正的插件化。

4. `ThreadSessionState` 没有 extensions 字段。

   没有线程态扩展配置，skills/plugins 就只能做全局开关。

5. `mastra/workflows` 目录为空。

   插件安装、扩展解析、权限确认这类结构化流程没有落点。

## Recommended Implementation Phases

### Phase 0: Align Skill Foundation

- 引入 `mastra/skills/*`
- 统一 skill 目录发现逻辑
- 让 `skill.tool.ts` 改走 registry
- 给线程状态增加 `extensions`

### Phase 1: Thread-Level Skills

- 新增 skills API
- 新增前端 skills 面板
- 支持线程启用 skills
- 在 stream route 注入启用的 skill context

### Phase 2: Local Plugins

- 引入 `mastra/plugins/*`
- 定义 `plugin.json`
- 扫描 `plugins/*`
- 支持插件启用/禁用
- 支持插件携带 `skills/` 与 `mcp.json`

### Phase 3: Dynamic Agent Runtime

- 主 agent 改为动态工具装配
- 插件 tools 注入
- 插件 MCP 注入
- capability snapshot 写入线程状态

### Phase 4: Plugin Management UX

- 插件管理页
- 权限提示
- 本地导入向导
- 错误插件诊断

### Phase 5: Marketplace

- marketplace manifest
- 远程索引拉取
- 安装包校验
- 插件更新检查

## Recommended First Delivery

第一版建议只做下面这条最小闭环：

1. workspace/user skill registry
2. thread 级 skill 启用
3. 本地 plugin 扫描
4. plugin 携带 skills 和 MCP
5. 简单的 skills/plugins 管理面板

先不要在第一版做：

- 远程 marketplace
- 插件脚本热更新
- 插件独立前端 iframe 沙箱
- 多租户插件权限模型

## Suggested File Additions

建议新增这些文件：

```text
mastra/skills/types.ts
mastra/skills/loader.ts
mastra/skills/registry.ts
mastra/plugins/types.ts
mastra/plugins/loader.ts
mastra/plugins/registry.ts
mastra/plugins/install.ts
mastra/agents/runtime/resolve-runtime-capabilities.ts
app/api/skills/route.ts
app/api/skills/[skillId]/route.ts
app/api/plugins/route.ts
app/api/plugins/[pluginId]/route.ts
app/api/plugins/[pluginId]/enable/route.ts
app/api/plugins/[pluginId]/disable/route.ts
components/rovix/skills-panel.tsx
components/rovix/plugins-panel.tsx
```

## Final Recommendation

对你这套产品，最稳妥的路径是：

- 用 skill 解决 agent 的经验和流程扩展
- 用 plugin 解决工具、MCP、连接器和可安装能力扩展
- 保持所有编排逻辑在 Next.js + Mastra 层
- 让 Tauri 只做本地宿主和权限桥接

不要把 skill 和 plugin 统一成一个概念，也不要把 Codex 的目录规范原样搬过来。可以兼容 Codex 风格，但你的产品内部要有自己稳定的扩展契约。