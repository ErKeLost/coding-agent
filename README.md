# Local Coding Agent

This project is a Next.js + Mastra local coding agent with a Codex-style chat UI, local workspace execution, local dev-server management, and persistent thread state.

The repository now also contains a Vite-powered marketing/download site under apps/site for Netlify deployment, managed through Bun workspaces.

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
bun run site:dev
bun run site:build
```

## Monorepo layout

- app: Next.js coding workspace
- src-tauri: Tauri desktop shell and updater config
- apps/site: Vite marketing and download site for Netlify

The repo uses Bun workspaces via the root package.json `workspaces` field.

## Netlify

The root includes netlify.toml configured to publish apps/site/dist.

```bash
bun install
bun run --filter @rovix/site build
```

Connect the repository to Netlify and use the default root config.

## Desktop release

The GitHub release workflow now builds:

- macOS Apple Silicon
- macOS Intel
- Windows x64

Tags in the form of v* will trigger the release workflow.

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
