# Rovix Workspace Refactor

## Goals

- Split the current giant [`app/[id]/page.tsx`](/Users/work/coding-agent/app/[id]/page.tsx) into composition-only page logic.
- Move page-shell UI state into Zustand so feature components can coordinate without prop drilling.
- Establish feature boundaries for chat, workspace, git, terminal, and shell chrome.

## Target Modules

### App Route

- `app/[id]/page.tsx`
  - Route entry only
  - Wires hooks, store selectors, and feature components
  - Avoids local UI chrome state except transient route-only refs

- `app/[id]/_stores/workspace-shell-store.ts`
  - Zustand state for shell chrome
  - Model picker state
  - Terminal dock visibility
  - Git dialog visibility
  - Reasoning expand/collapse map

### Workspace Shell Components

- `components/rovix/workspace/workspace-page-layout.tsx`
  - Top-level two-row workspace shell
  - Main card + terminal dock slots

- `components/rovix/workspace/workspace-header-bar.tsx`
  - Thread title
  - Workspace meta
  - Search / branch / git controls

- `components/rovix/workspace/workspace-model-terminal-controls.tsx`
  - Model trigger
  - Terminal toggle

## Next Extraction Steps

1. Move conversation rendering into `workspace-conversation-panel.tsx`
2. Move prompt composer into `workspace-composer.tsx`
3. Move tool/result formatting helpers into `app/[id]/_lib/tool-presenters.tsx`
4. Introduce dedicated stores:
   - `workspace-thread-store`
   - `workspace-terminal-store`
   - `workspace-git-store`
5. Shrink `page.tsx` to orchestration only

## State Strategy

### Zustand shell store

Shared UI chrome belongs in store when it is:

- read by multiple siblings
- toggled from multiple entry points
- worth persisting or centrally resetting

Current shell store owns:

- `model`
- `modelDialogOpen`
- `gitDialogOpen`
- `terminalExpanded`
- `reasoningOpenState`

### Hook-owned state

Behavioral/data state should stay near the existing hooks until feature stores are introduced:

- thread session hydration
- agent streaming lifecycle
- desktop workspace loading
- branch operations

## Migration Rule

Every new extraction should follow:

1. Move stable presentational markup first
2. Then move UI shell state to Zustand
3. Only then move behavior/data orchestration

This keeps the workspace shipping while the architecture gets cleaner.
