# Codex / OpenCode / Claude Code / 当前 Mastra 实现对比

这份文档对比了仓库里四套与上下文管理、长会话处理相关的实现：

- `codex` 子模块
- `opencode`
- `cloud-code/claude-code-source`
- 当前 Rovix 的 Mastra 实现

目标是回答 5 个核心问题：

1. 每套系统是如何构造模型上下文的？
2. 当线程变长之后，各自会发生什么？
3. 它们分别如何压缩、保留、延续上下文？
4. 哪一套更容易出现偶发性的上下文相关错误？
5. 在上线生产前，我们最该补哪些能力？

## 执行结论

`codex` 是四者里最“转录驱动”的设计。它把历史当成一等公民来管理，可以把旧历史压缩成新的替代转录，并且在压缩本身超出上下文时继续裁剪和重试。

`opencode` 是“会话驱动”的设计。它有明确的 compaction 服务，会先裁掉旧工具输出，再生成摘要边界，后续会话从压缩后的边界继续。

`Claude Code` 也已经具备完整的长会话处理主链路。基于这次查看到的源码，它现在的核心路径是：

- 基于 token 阈值的 auto-compact
- 独立的 compaction 流程和重试逻辑
- 独立的 session memory 提取机制，把关键信息写入持久化的 markdown memory 文件

需要特别说明的是：在这次查看到的源码版本里，`contextCollapse` 实际上是关闭状态，所以 Claude Code 当前真正生效的主路径仍然是 `auto-compact + compaction + session memory`，而不是另一套正在运行的 collapse 引擎。

当前 Rovix 的 Mastra 实现还没有真正意义上的 session compaction。它现在依赖的是：

- 最近消息历史
- 向量库语义召回
- working memory
- continuation 提示
- token limiting

这套组合对短线程、中等长度线程是有价值的，但它和“真正的长会话压缩”不是一回事。线程一旦变长，它是四套里最容易出现偶发错误、并且最难排查根因的一套。

## 1. Codex

### 关键文件

- [codex/codex-rs/core/src/compact.rs](/Users/work/coding-agent/codex/codex-rs/core/src/compact.rs)
- [codex/codex-rs/core/src/context_manager/history.rs](/Users/work/coding-agent/codex/codex-rs/core/src/context_manager/history.rs)
- [codex/codex-rs/core/templates/compact/prompt.md](/Users/work/coding-agent/codex/codex-rs/core/templates/compact/prompt.md)
- [codex/codex-rs/core/templates/compact/summary_prefix.md](/Users/work/coding-agent/codex/codex-rs/core/templates/compact/summary_prefix.md)

### Codex 如何构造上下文

Codex 通过 `ContextManager` 显式维护模型可见历史。它保存的是规范化后的 `ResponseItem`，持续估算 token 使用量，并且可以按需删除、替换历史项。

它的几个关键特点：

- 历史记录是“被管理的转录”，不是简单消息数组
- token 用量是持续追踪和估算的
- 上下文规范化是主流程的一部分
- 非模型可见项可以在构造 prompt 前被过滤

### Codex 如何处理长线程

Codex 在 `compact.rs` 里实现了一条真正的 compaction 流程。

当 compaction 触发时，它会：

- 发起一个专门的 compact turn
- 用 compaction prompt 让模型生成摘要
- 收集 compact turn 产出的摘要文本
- 基于以下内容构建新的替代历史：
  - 摘要文本
  - 选中的用户消息
  - 可选的初始上下文重新注入
- 用 compact 后的历史替换旧历史
- 重新计算 token 使用量

一个非常关键的设计点：

- Codex 会区分哪些 compaction 模式应该重新注入初始上下文，哪些不应该。这样既能避免把启动阶段的重要上下文丢掉，也能避免在错误位置重复注入。

### 如果 compaction 自己也超长怎么办

Codex 对这个场景也做了处理。

如果 compaction prompt 本身超过模型上下文窗口，它会：

- 裁掉最旧的历史项
- 重试 compaction
- 一直持续到 prompt 能塞进窗口，或者历史已经没有可继续裁的有效内容

### 实际结论

Codex 是为长生命周期线程设计的。它具备：

- 显式的 transcript 控制
- 显式的 compaction
- 替代历史生成
- compaction 过程中的重试和裁剪

在这四套实现里，它是长会话维度上最强、也最接近生产级的方案。

## 2. OpenCode

### 关键文件

- [opencode/packages/opencode/src/session/compaction.ts](/Users/work/coding-agent/opencode/packages/opencode/src/session/compaction.ts)
- [opencode/packages/opencode/src/session/summary.ts](/Users/work/coding-agent/opencode/packages/opencode/src/session/summary.ts)
- [opencode/packages/opencode/test/session/compaction.test.ts](/Users/work/coding-agent/opencode/packages/opencode/test/session/compaction.test.ts)

### OpenCode 如何构造上下文

OpenCode 把对话建模成一个 session，内部有 message、part、summary metadata 以及 compaction boundary。

它和 Codex 架构不同，但同样明显是“有意识地为长上下文设计”的系统。

### OpenCode 如何处理长线程

OpenCode 有专门的 `SessionCompaction` 服务，主要做这几件事：

- 检查当前 session 是否已经接近或超过上下文容量
- 清理旧的已完成工具输出
- 生成 compaction 用的摘要 prompt
- 把摘要消息写回 session
- 以后续会话把这个摘要作为新的 continuation boundary

这里“清理旧工具输出”非常重要，因为在 coding agent 场景里，旧工具输出通常就是上下文膨胀的主要来源之一。

### 摘要是怎么保存的

`SessionSummary` 不只是存一段文本，还会记录一些摘要元数据，比如：

- additions
- deletions
- file counts
- diffs

这不只是给 UI 展示用，而是让系统拥有一个可持续复用的压缩态会话表示。

### 失败路径

OpenCode 的测试里明确覆盖了这些场景：

- overflow 检测
- compaction 失败路径
- 摘要消息标记为 error 的情况
- compaction 之后的恢复行为

这说明它是把长会话处理当成主系统能力来建设的，而不是临时补丁。

### 实际结论

OpenCode 在长会话场景下同样具备生产可用性，只是架构路线和 Codex 不同。

和 Codex 相比：

- 它没那么 transcript-centric
- 更偏向 session/service 组织方式
- 但依然有真正的 compaction 和 pruning

和当前 Rovix 实现相比：

- 长上下文处理更强
- overflow 语义更清晰
- 会话变大后更容易排查和解释问题

## 3. Claude Code

### 关键文件

- [cloud-code/claude-code-source/src/tools.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/tools.ts)
- [cloud-code/claude-code-source/src/services/compact/compact.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/services/compact/compact.ts)
- [cloud-code/claude-code-source/src/services/compact/autoCompact.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/services/compact/autoCompact.ts)
- [cloud-code/claude-code-source/src/services/contextCollapse/index.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/services/contextCollapse/index.ts)
- [cloud-code/claude-code-source/src/services/SessionMemory/sessionMemory.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/services/SessionMemory/sessionMemory.ts)
- [cloud-code/claude-code-source/src/services/SessionMemory/sessionMemoryUtils.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/services/SessionMemory/sessionMemoryUtils.ts)

### Claude Code 如何构造上下文

Claude Code 并不是只靠某一种 memory 技巧，它实际上叠了多层机制：

1. 当前活跃消息历史
2. 工具可见的运行时状态
3. 显式 compaction 支持
4. 后台 session memory 提取，把关键信息写入持久化 markdown 文件

最重要的一点是：

- session memory 不等于 compaction
- Claude Code 两者都有

### Claude Code 如何处理长线程

Claude Code 在 `autoCompact.ts` 里实现了明确的 auto-compact 机制。

几个关键特征：

- 它会先为 compaction 预留输出 token 预算，再计算有效上下文窗口
- 它会在真正撞上模型硬上限前主动触发 auto-compact
- 它会保留 `13_000` token 的安全缓冲区
- 它会追踪连续 compaction 失败次数
- 连续失败达到 `3` 次后停止继续 auto-compact，避免死循环式空耗请求

这是一个非常重要的生产级设计细节。它意味着线程过长时，系统不会无限地去打注定失败的请求。

### Claude Code 的 compaction 到底做了什么

`compact.ts` 里的 compaction 并不只是“总结一下聊天记录”。

它会处理这些事情：

- 构建 compaction prompt
- 在摘要前先剥离 image 和 document 内容
- 剥离那些本来会在 post-compact 阶段重新注入的 attachment，避免污染摘要
- 在 compaction 过程中出现 prompt-too-long 时重试
- 在 compact 完之后恢复关键运行状态，比如文件、计划、部分 runtime context

所以它的真实思路是：

- 先缩历史
- 再保关键工作态
- 然后从压缩边界继续执行

这条路径明显更接近 Codex 和 OpenCode，而不是当前 Rovix 实现。

### Session memory 的行为

Claude Code 还有一套独立的 session memory 系统，位于 `SessionMemory`。

从当前源码可以明确看到：

- session memory 只有在线程达到一定 token 阈值后才会初始化
- 默认 `minimumMessageTokensToInit` 为 `10000`
- 默认 `minimumTokensBetweenUpdate` 为 `5000`
- 默认 `toolCallsBetweenUpdates` 为 `3`
- 只有在 token 增长条件满足时才会触发提取
- 它还会优先选择更安全的时机触发，比如上一轮 assistant 不再包含 tool calls 时

这点很关键，因为 Claude Code 并不是把所有长尾历史都硬塞进每一轮 prompt，而是周期性地把“值得长期保留的信息”蒸馏到独立 memory 文件里。

### Context collapse 当前状态

在这次查看到的源码快照里，[contextCollapse/index.ts](/Users/work/coding-agent/cloud-code/claude-code-source/src/services/contextCollapse/index.ts) 实际上是 no-op：

- `isContextCollapseEnabled()` 返回 `false`
- `collapseContext()` 只是原样返回输入

所以对这个源码版本来说，Claude Code 当前真正生效的路径是：

- message history
- auto-compact
- 专门的 compaction 流程
- session memory

而不是：

- message history
- 一个正在运行的 context-collapse 引擎

### 实际结论

Claude Code 在长会话设计上明显强于当前 Rovix 实现，因为它具备：

- 主动 compaction 阈值
- compaction 重试逻辑
- 连续失败的熔断保护
- 独立的 memory 蒸馏路径
- compact 后关键运行状态恢复

和 Codex 相比：

- 它没那么“纯 transcript 驱动”
- 更偏向多层运行时机制叠加
- 但一样是明显按生产问题去设计的

和 OpenCode 相比：

- 它更依赖 feature gate 和运行时环境
- 工具层和运行时集成更重
- 但对 overflow 的严肃程度是同一量级的

## 4. 当前 Rovix Mastra 实现

### 关键文件

- [mastra/memory.ts](/Users/work/coding-agent/mastra/memory.ts)
- [mastra/agents/build-agent.ts](/Users/work/coding-agent/mastra/agents/build-agent.ts)
- [lib/server/agent-request-context.ts](/Users/work/coding-agent/lib/server/agent-request-context.ts)
- [lib/continuation.ts](/Users/work/coding-agent/lib/continuation.ts)
- [app/api/agents/[agentId]/stream/route.ts](/Users/work/coding-agent/app/api/agents/[agentId]/stream/route.ts)
- [hooks/use-agent-stream.ts](/Users/work/coding-agent/hooks/use-agent-stream.ts)

### 当前系统如何构造上下文

目前 agent memory 相关配置大致是：

- `lastMessages: 20`
- `semanticRecall.topK: 3`
- `semanticRecall.messageRange: 2`
- `workingMemory.enabled: true`
- memory 和 recall 都是 thread 级别

也就是说，当前模型上下文主要来自：

1. 最近线程消息
2. 向量库语义召回
3. working memory
4. request-context 注入内容，比如：
   - workspace root
   - skill instructions
   - continuation hints
   - guide mode
   - image-analysis mode

另外输入处理链里还有一个 `TokenLimiterProcessor`。

### continuation 系统在做什么

[lib/continuation.ts](/Users/work/coding-agent/lib/continuation.ts) 这套 continuation 逻辑是有帮助的，但它本质上比较轻量。

它会推断：

- 当前线程能不能 resume
- 最近一次用户目标是什么
- 当前 pending plan 的标题是什么
- 下一步未完成计划是什么

这对下面这类输入很有帮助：

- "continue"
- "go on"
- "then?"
- "keep going"

但它不是 compaction。

### 当前系统缺少什么

它当前并没有：

- 显式 session compaction
- 替代历史生成
- 旧工具输出 pruning
- compaction 自身失败时的重试逻辑
- 可持久化的 compact summary 作为下一阶段 context boundary

这就是它相对 Codex、OpenCode、Claude Code 的最大架构差距。

### 为什么这里很容易出现偶发错误

因为这套设计把多个上下文来源叠在一起了，但没有真正的 compaction 阶段：

- recent history
- semantic recall
- working memory
- skill instructions
- continuation directives
- workspace context

于是会出现一种情况：

- 用户肉眼看线程并不算太长
- 但模型实际收到的 prompt 已经很大、很噪、很不稳定

所以偶发失败很可能来自：

- token 压力
- provider 或 model 的 payload 限制
- 召回内容过多
- 最近消息里保留了过多工具输出
- 多套注入信息叠加后 prompt 噪声过高

## 5. 错误路径对比

### Codex

Codex 对 compaction 过程中的 context-window 失败有明确处理，可以裁剪并重试。

这会显著降低“线程一长就变成模糊 generic error”的概率。

### OpenCode

OpenCode 有明确的 overflow 和 compaction 语义，还有对应失败路径测试。

所以长上下文出问题时，行为更可预测，也更容易诊断。

### Claude Code

Claude Code 在四者里具备最完整的一套运行时兜底：

- 基于阈值的 auto-compact
- compaction 过程中的重试逻辑
- prompt-too-long 的恢复路径
- 连续失败后的熔断
- 独立 session memory 提取，减少后续会话压力

它并不是不会报错，但它更容易把“长线程失败”收敛成有语义、可解释的问题。

### 当前 Rovix

当前实现里，后端 stream error 最终会经由这些位置暴露出来：

- [app/api/agents/[agentId]/stream/route.ts](/Users/work/coding-agent/app/api/agents/[agentId]/stream/route.ts)
- [hooks/use-agent-stream.ts](/Users/work/coding-agent/hooks/use-agent-stream.ts)

后端行为大致是：

- 捕获 stream 异常
- 转成 `tool.call.failed` 或终止态错误语义
- 最终把 session 状态标成 `error`

前端行为大致是：

- `streamBus.finalize({ errorText })`
- `setThreadError(...)`
- `setThreadStatus(..., "error")`

这里真正的弱点不是“会报错”本身，而是当前系统没有记录足够结构化的证据，来帮助我们判断这个错误到底是：

- context size 问题
- provider 响应失败
- tool failure
- abort 或 tripwire
- 图片能力不匹配
- memory 或 recall 膨胀

## 6. 对比表

| 能力项 | Codex | OpenCode | Claude Code | 当前 Rovix |
| --- | --- | --- | --- | --- |
| 最近消息上下文 | 有 | 有 | 有 | 有 |
| 向量或语义召回 | 协议和 memory 支持更丰富，但不是本次分析的主线 | 有搜索和摘要能力，但长会话主路径仍是 compaction | 有 session memory，但本次看到的主路径不是经典向量召回 | 有，基于 Mastra semantic recall |
| working memory 或持久运行态 | 强 transcript 与 runtime context | session state 和 summary metadata | session memory 加 post-compact 状态恢复 | 有，基于 Mastra working memory |
| continuation 能力 | 有 | 有 | 有 | 有，但比较轻 |
| 显式 compaction | 有 | 有 | 有 | 没有 |
| compaction 后替代历史 | 有 | 有 | 有 | 没有 |
| 旧工具输出 pruning 或 stripping | 通过 transcript 替换间接实现 | 有 | 有 | 没有 |
| compaction 超长重试 | 有 | 有 | 有 | 没有 |
| 连续上下文失败熔断 | 本次查看路径里不是重点 | 通过 service 逻辑和测试部分覆盖 | 有 | 没有 |
| 长线程生产可用性 | 高 | 高 | 高 | 中低 |

## 7. 生产视角评估

如果你当前最核心的上线阻塞点是“偶发 unexplained error”，那当前 Rovix 架构相对另外三套，最弱的地方仍然是：

- 长会话和超大上下文的生存能力

当前系统大致适合：

- 短线程
- 明确任务型会话
- 工具输出不多的场景
- recall 量比较克制的场景

它会在这些场景里风险明显增大：

- 长生命周期 coding 线程
- 多次 follow-up 接续
- 大量大文件读取
- 单线程内大量工具输出
- 多轮 continuation 的长线程

## 8. Codex 和 Claude Code 真正做得更好的地方

如果把这次对比转成架构动作，最大的差别其实就这几条：

1. 它们都把“线程太长”当成一等运行时状态来处理，而不是偶发边界情况。
2. 它们都用显式 compaction 做上下文缩减，而不只是 retrieval 或 memory enrichment。
3. 它们都会在压缩后保留足够多的工作态，让 agent 继续看起来是连续的。
4. 它们都处理了 compaction 自身失败时怎么办。

最后这一点很关键。很多系统真正出问题时，不是主线程太长，而是“压缩那一步也塞不进去”，这时候没有重试和降级策略，就会直接死掉。

## 9. 上线前建议

### 第一优先级

先补结构化 context/error observability，再谈生产。

对于每一次终止态 stream error，建议至少记录：

- `threadId`
- model 和 provider
- 注入的 recent messages 数量
- semantic recall 命中数
- 是否存在 working memory
- 是否启用了 continuation mode
- 是否注入了 workspace root
- prompt token 估算值
- 最终 error name 和 error message

否则“是不是上下文问题”永远只能靠猜。

### 第二优先级

补一条真正的 compaction 主路径。

最快的方向其实更像 OpenCode 或 Claude Code，而不是一上来照着 Codex 全量重做：

1. 检测 overflow 或 near-overflow
2. prune 或 strip 掉旧的已完成工具输出
3. 生成 compact summary
4. 把它持久化成线程新的 context boundary
5. 后续 turn 从 compact representation 继续
6. 当 compaction 自己失败时加入重试和熔断

### 也很建议做的一件事

把“memory”和“compaction”在架构上彻底拆开。

你当前系统其实混在一起的是：

- recent context
- semantic recall
- working memory
- continuation

但它并没有清楚地区分：

- 为了找旧事实而做的 retrieval
- 为了压缩当前活动转录而做的 compaction

Codex、OpenCode、Claude Code 在这点上都比现在这套更清晰。

### 可选但强烈建议

做一组稳定可复现的压力测试，至少覆盖这些情况：

- 长线程里反复读文件
- 连续多轮 "continue"
- 单线程内大量工具输出
- semantic recall 较重的场景
- 图片输入后再文字续聊
- compact 之后继续 resume

## 最终结论

`codex`、`opencode`、`Claude Code` 都有显式的长上下文管理能力，而你当前这套 Mastra 实现还没有。

这不代表当前系统没价值，而是说明它现在更偏向“上下文增强”，而不是“长会话压缩”。

如果你现在线上最卡的是那种偶发性 `error`，并且你怀疑是上下文问题，那么最可能的根因并不是向量数据库本身，而是下面这些东西叠加之后，没有进入真正的 compaction 阶段：

- recent history
- semantic recall
- working memory
- continuation 注入
- retained tool output

这就是当前实现和 Codex、OpenCode、Claude Code 之间最核心的生产级差异。
