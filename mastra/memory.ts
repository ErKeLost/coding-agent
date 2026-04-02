import { fastembed } from "@mastra/fastembed";
import { Memory } from "@mastra/memory";
import { mastraStore, mastraVector } from "./storage";

export const buildAgentMemory = new Memory({
  storage: mastraStore,
  vector: mastraVector,
  embedder: fastembed,
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 3,
      messageRange: 2,
      scope: "thread",
    },
    workingMemory: {
      enabled: true,
      scope: "thread",
      template: `# Session Context

- Current project:
- Current goal:
- Relevant files:
- Constraints:
- Open questions:
- Next concrete step:
`,
    },
    generateTitle: false,
  },
});
