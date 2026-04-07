import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";

const modelEnv = process.env.MODEL ?? "openrouter/openai/gpt-5.4-nano";

const getRequestContextString = (requestContext: RequestContext, key: string) => {
  const value = (requestContext as { get: (name: string) => unknown }).get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export const contextCompactionAgent = new Agent({
  id: "context-compaction-agent",
  name: "Context Compaction Agent",
  instructions: `你是一个只负责压缩线程上下文的系统。

严格要求：
- 只输出中文摘要
- 不要调用工具
- 不要解释你的做法
- 保留：目标、进展、关键文件、关键命令/结果、风险、下一步
- 不要编造内容
- 输出控制在 2200 字以内`,
  model: ({ requestContext }) =>
    getRequestContextString(requestContext, "model") ?? modelEnv,
});
