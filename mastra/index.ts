import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers'
import { buildAgent } from './agents/build-agent';
import { contextCompactionAgent } from './agents/context-agent';
import { multiAgentSupervisor } from './agents/multi-agent-test';
import { mastraStore } from './storage';

export const mastra = new Mastra({
  agents: { buildAgent, contextCompactionAgent, multiAgentSupervisor },
  storage: mastraStore,
  logger: new PinoLogger({
    name: 'Mastra',
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
});
