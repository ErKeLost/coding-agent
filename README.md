# Local Coding Agent

This project is a Next.js + Mastra local coding agent with a Codex-style chat UI, local workspace execution, local dev-server management, and persistent thread state.

## Stack

- Next.js app router UI
- Mastra agent runtime
- Local workspace sandbox via `@mastra/core/workspace`
- LibSQL-backed memory and thread storage
- Optional Tauri desktop shell

## Current execution model

The active runtime is local-only:

- file operations run against the selected local workspace
- shell commands run in the local workspace
- long-running dev servers are tracked in a local process registry
- thread state is persisted in Mastra storage

Daytona has been removed from the active architecture.

## Scripts

```bash
bun run dev
bun run dev:desktop
bun run desktop:dev
bun run build
```

## Environment

Typical local setup:

```env
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
MODEL=openrouter/qwen/qwen3.6-plus-preview:free
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=
SUPABASE_PREFIX=
```

## Main code paths

- `mastra/agents/build-agent.ts`
- `mastra/workspace/local-workspace.ts`
- `app/api/agents/[agentId]/route.ts`
- `app/api/agents/[agentId]/stream/route.ts`
- `lib/server/thread-session-store.ts`
- `lib/stream-event-bus.ts`
- `app/[id]/page.tsx`
