import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const firecrawlCrawlStatusTool = createTool({
  id: "firecrawl-crawl-status",
  description: "Get status/results of a Firecrawl v2 crawl job by id.",
  inputSchema: z.object({ id: z.string().min(1) }),

  outputSchema: z.object({
    status: z.string().optional(),      // scraping/completed/failed
    total: z.number().optional(),
    completed: z.number().optional(),
    creditsUsed: z.number().optional(),
    next: z.string().nullable().optional(),
    data: z.array(z.any()).optional(),  // 完成后这里通常会带页面数据
    success: z.boolean().optional(),
  }).passthrough(),

  execute: async (inputData, { abortSignal }) => {
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) throw new Error("Missing FIRECRAWL_API_KEY");

    const res = await fetch(`https://api.firecrawl.dev/v2/crawl/${encodeURIComponent(inputData.id)}`, {
      method: "GET",
      signal: abortSignal,
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) throw new Error(`Firecrawl crawl status failed: ${res.status} ${await res.text()}`);
    return res.json() as any;
  },
});
