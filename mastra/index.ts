import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { buildAgent } from './agents/build-agent';
import { mastraStore } from './storage';

const resolveMastraLogLevel = () => {
  const configuredLevel = process.env.MASTRA_LOG_LEVEL?.trim();
  if (configuredLevel) return configuredLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'warn';
};

export const mastra = new Mastra({
  agents: { buildAgent },
  storage: mastraStore,
  logger: new PinoLogger({
    name: 'Mastra',
    level: resolveMastraLogLevel(),
  }),
});
