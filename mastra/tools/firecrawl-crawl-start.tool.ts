import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const firecrawlCrawlStartTool = createTool({
  id: "firecrawl-crawl-start",
  description: "Start a Firecrawl v2 crawl job (async). Returns crawl job id.",
  inputSchema: z.object({
    url: z.string().url(),
    limit: z.number().int().min(1).max(500).default(50),
    // 常用：把每页内容输出成 markdown
    scrapeOptions: z
      .object({
        formats: z.array(z.string()).default(["markdown"]),
        onlyMainContent: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    // 其他 crawl 参数透传（例如 allowSubdomains/crawlEntireDomain/sitemap/concurrency 等）
  }).passthrough(),

  outputSchema: z.object({
    success: z.boolean(),
    id: z.string().optional(),
    url: z.string().optional(),
    warning: z.string().optional(),
  }).passthrough(),

  execute: async (inputData, { abortSignal }) => {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) throw new Error("Missing FIRECRAWL_API_KEY");

    const res = await fetch("https://api.firecrawl.dev/v2/crawl", {
      method: "POST",
      signal: abortSignal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputData),
    });

    if (!res.ok) throw new Error(`Firecrawl crawl start failed: ${res.status} ${await res.text()}`);
    return res.json() as any;
  },
});
