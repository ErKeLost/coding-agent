import { context7 } from './context7';
import { grep_app } from './grep-app';
import { websearch_exa } from './websearch-exa';
import type { McpName } from './types';

export { McpNameSchema, type McpName } from './types';

type BuiltinMcpConfig = { type: 'remote'; url: string; enabled: boolean };
type McpServerConfig = { url: URL; requestInit?: RequestInit };

const allBuiltinMcps: Record<McpName, BuiltinMcpConfig> = {
  websearch_exa,
  context7,
  grep_app,
};

export function createBuiltinMcps(disabledMcps: McpName[] = []) {
  const mcps: Record<string, BuiltinMcpConfig> = {};

  for (const [name, config] of Object.entries(allBuiltinMcps)) {
    if (!disabledMcps.includes(name as McpName)) {
      mcps[name] = config;
    }
  }

  return mcps;
}

export function createBuiltinMcpServers(disabledMcps: McpName[] = []) {
  const mcps = createBuiltinMcps(disabledMcps);
  const servers: Record<string, McpServerConfig> = {};

  for (const [name, config] of Object.entries(mcps)) {
    if (!config.enabled) continue;

    const server: McpServerConfig = { url: new URL(config.url) };
    if (name === 'websearch_exa' && process.env.EXA_API_KEY) {
      server.requestInit = {
        headers: {
          Authorization: `Bearer ${process.env.EXA_API_KEY}`,
        },
      };
    }

    servers[name] = server;
  }

  return servers;
}
