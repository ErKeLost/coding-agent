export type ToolCatalogEntry = {
  name: string;
  description: string;
  tags: string[];
};

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  { name: 'read', description: 'Read a file from the local workspace.', tags: ['file', 'read', 'source'] },
  { name: 'write', description: 'Write a file in the local workspace.', tags: ['file', 'write', 'create'] },
  { name: 'edit', description: 'Replace text in a local file.', tags: ['file', 'edit', 'patch'] },
  { name: 'list', description: 'List files in a workspace directory.', tags: ['filesystem', 'directory', 'list'] },
  { name: 'list_dir', description: 'List directory contents like Codex list_dir.', tags: ['filesystem', 'directory', 'list', 'codex'] },
  { name: 'bash', description: 'Run a shell command in the workspace.', tags: ['shell', 'command', 'exec'] },
  { name: 'shell', description: 'Run a Codex-style shell command in the workspace.', tags: ['shell', 'command', 'exec', 'codex'] },
  { name: 'runCommand', description: 'Run a local workspace command with structured output.', tags: ['command', 'exec'] },
  { name: 'unified_exec', description: 'Run commands with Codex-style unified exec semantics.', tags: ['command', 'exec', 'codex'] },
  { name: 'apply_patch', description: 'Apply a unified diff patch to local files.', tags: ['patch', 'diff', 'edit', 'codex'] },
  { name: 'webfetch', description: 'Fetch a web page and summarize it.', tags: ['web', 'fetch', 'http'] },
  { name: 'websearch', description: 'Search the web for relevant results.', tags: ['web', 'search'] },
  { name: 'tool_search', description: 'Search available tools by capability or keyword.', tags: ['meta', 'tools', 'search', 'codex'] },
  { name: 'tool_suggest', description: 'Suggest the best tools for a task.', tags: ['meta', 'tools', 'suggest', 'codex'] },
  { name: 'skill', description: 'Load and list local skills.', tags: ['skills', 'knowledge'] },
  { name: 'startLocalDevServer', description: 'Start a long-running local development server.', tags: ['devserver', 'process'] },
  { name: 'listLocalProcesses', description: 'List tracked local processes.', tags: ['process', 'list'] },
  { name: 'readLocalProcessLogs', description: 'Read logs for a tracked local process.', tags: ['process', 'logs'] },
  { name: 'stopLocalProcess', description: 'Stop a tracked local process.', tags: ['process', 'stop'] },
  { name: 'todoread', description: 'Read the current task plan.', tags: ['todo', 'plan'] },
  { name: 'todowrite', description: 'Update the current task plan.', tags: ['todo', 'plan', 'write'] },
];

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

export function searchToolCatalog(query: string, limit = 8) {
  const queryTokens = tokenize(query);
  const scored = TOOL_CATALOG.map(entry => {
    const haystack = [entry.name, entry.description, ...entry.tags].join(' ').toLowerCase();
    const score = queryTokens.reduce((total, token) => {
      if (entry.name.toLowerCase() === token) return total + 12;
      if (entry.name.toLowerCase().includes(token)) return total + 8;
      if (entry.tags.some(tag => tag.includes(token))) return total + 5;
      if (haystack.includes(token)) return total + 2;
      return total;
    }, 0);

    return { entry, score };
  })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name))
    .slice(0, limit);

  return scored.map(item => item.entry);
}