export type ToolCatalogEntry = {
  name: string;
  description: string;
  tags: string[];
};

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  { name: 'read', description: 'Read a file from the local workspace.', tags: ['file', 'read', 'source'] },
  { name: 'write', description: 'Write a file in the local workspace.', tags: ['file', 'write', 'create'] },
  { name: 'edit', description: 'Replace text in a local file.', tags: ['file', 'edit', 'patch'] },
  { name: 'glob', description: 'Find files by glob pattern using ripgrep file mode.', tags: ['file', 'glob', 'search'] },
  { name: 'grep', description: 'Search file contents by pattern using ripgrep.', tags: ['file', 'search', 'regex'] },
  { name: 'codesearch', description: 'Search code across the repository using ripgrep.', tags: ['code', 'search', 'ripgrep'] },
  { name: 'bash', description: 'Run a shell command in the workspace.', tags: ['shell', 'command', 'exec'] },
  { name: 'apply_patch', description: 'Apply a unified diff patch to local files.', tags: ['patch', 'diff', 'edit', 'codex'] },
  { name: 'task', description: 'Delegate a sub-task to another agent.', tags: ['agent', 'delegate', 'task'] },
  { name: 'question', description: 'Ask the user one or more structured questions.', tags: ['user', 'question', 'clarify'] },
  { name: 'batch', description: 'Execute multiple independent tool calls in parallel.', tags: ['parallel', 'batch', 'meta'] },
  { name: 'webfetch', description: 'Fetch a web page and summarize it.', tags: ['web', 'fetch', 'http'] },
  { name: 'websearch', description: 'Search the web for relevant results.', tags: ['web', 'search'] },
  { name: 'skill', description: 'Load and list local skills.', tags: ['skills', 'knowledge'] },
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
