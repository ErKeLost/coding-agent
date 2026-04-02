# Codex x Daytona Alignment Plan

## Goal

Build a Codex-style agent product on top of Mastra, with Daytona as the only execution backend.

Target principle:

- Same interaction model as Codex app (chat + tool timeline + file/terminal artifacts + streaming states).
- Different execution substrate (remote Daytona sandbox instead of local machine).
- No approval/allowlist/denylist layer for now (explicitly out of scope per requirement).

---

## Current Architecture Snapshot

### Backend

- Runtime: Mastra agents + workflows + PG memory/vector.
- Primary executor: `build-agent` with Daytona tools and MCP tools.
- Router: `network-agent` (plan/explore/build delegation) exists but not yet the default entrypoint for UI.
- Tooling: rich Daytona/file/search/edit/deploy/image toolset already in place.

Key files:

- `mastra/index.ts`
- `mastra/agents/build-agent.ts`
- `mastra/agents/network-agent.ts`
- `mastra/workflows/network-workflow.ts`
- `mastra/tools/*`

### Frontend

- Chat view with streaming, tool cards, task timeline, terminal/file/image renderers.
- Stream parser/event bus normalizes mixed stream payloads into UI state.
- Thread-scoped sandbox session (`sandboxId`) persisted in local storage and sent via `requestContext`.

Key files:

- `app/[id]/page.tsx`
- `lib/stream-event-bus.ts`
- `components/ai-elements/tool.tsx`

---

## Gap vs Codex-Style System

### 1. Control Plane Gap

- Routing policy is partly distributed between prompts and agents.
- No explicit orchestration contract describing when to route to `plan` / `explore` / `build`.

Impact:

- Behavior can drift by prompt changes.
- Harder to guarantee deterministic delegation in complex requests.

### 2. Execution Plane Gap

- Daytona is mostly dominant, but execution semantics are still represented by individual tool conventions.
- Tool result shape varies significantly by tool.

Impact:

- Frontend must contain many heuristics.
- Hard to keep Codex-like consistency in timeline rendering.

### 3. Event Protocol Gap

- Stream payloads are normalized with permissive inference.
- No single canonical event envelope for tool lifecycle, artifacts, and metrics.

Impact:

- UI robustness depends on ad-hoc parsing branches.
- Regressions occur when provider payload shape shifts.

### 4. Context Management Gap

- Token limiting exists (`TokenLimiterProcessor`) but no explicit compaction policy by content type.
- Large tool outputs (logs, image payload metadata, long lists) can still pressure context/stream.

Impact:

- Increased risk of context explosion and unstable long-run behavior.

### 5. Frontend Product Gap

- Existing UI already has most widgets, but not yet organized as a strict Codex-like layout/interaction contract.
- Missing standardized zones and fixed visual semantics per tool state.

Impact:

- UX is functional but not yet "Codex-like by default".

---

## Target Architecture

### A. Orchestration Layer

- `network-agent` as the single intelligent router entrypoint for user requests.
- Delegation contract:
  - `plan-agent` for decomposition only.
  - `explore-agent` for retrieval/recon only.
  - `build-agent` for execution/mutations only.

### B. Daytona Execution Layer

- Daytona-only operation path.
- Canonical execution primitives:
  - filesystem (`list/read/write/edit/patch/mv/rm/stat`)
  - search (`glob/grep/ast-grep/codesearch`)
  - runtime (`runCommand`, `startDevServerAndGetUrl`, sandbox lifecycle)
  - support (`skill`, `todo`, `batch`, `task`)

### C. Event Contract Layer

- Unified event taxonomy:
  - `assistant.delta`
  - `assistant.reasoning.delta`
  - `tool.call.started`
  - `tool.call.progress`
  - `tool.call.completed`
  - `tool.call.failed`
  - `usage.updated`
  - `session.updated` (e.g., sandboxId, previewUrl)

### D. Frontend Contract

- Stable Codex-like regions:
  - left: thread/session nav
  - center: conversation + tool timeline
  - right/bottom: workspace preview + logs
- Deterministic card semantics:
  - pending/running/success/error state colors/icons
  - expandable stdout/stderr
  - file/diff/terminal/image artifact renderers

---

## Phased Delivery Plan

### Phase 1: Foundations (now)

- Freeze architecture contract and make Daytona-only intent explicit in prompts/agents.
- Normalize known tool-shape edge cases (`skill(list)`, brace glob expansion, image URL returns).
- Keep current UI behavior intact while preparing protocol stabilization.

### Phase 2: Canonical Stream/Event Protocol

- Add explicit event envelope mapper in API stream route.
- Reduce frontend heuristic branches by consuming canonical events first, fallback second.
- Emit session updates (`sandboxId`, `previewUrl`) explicitly.

### Phase 3: Context Compaction

- Add tool-result compaction policy before memory-bound turns:
  - keep metadata + summaries
  - truncate large logs with pointers
  - never carry large image data payloads
- Add continuation-safe response segmentation policy.

### Phase 4: Frontend Codex-Style UI Pass

- Refactor layout and visual grammar to Codex-like interaction patterns.
- Standardize timeline cards and artifact viewers.
- Improve progressive rendering and perceived responsiveness.

### Phase 5: Reliability Loop

- Add evaluation scenarios (10-20 representative tasks).
- Track:
  - routing correctness
  - tool failure rate
  - average completion latency
  - token/cost profile

---

## Proposed Immediate Next Changes

1. Move UI default entrypoint from direct `build-agent` to `network-agent` with existing requestContext thread+sandbox continuity.
2. Introduce canonical stream event mapper in `app/api/agents/[agentId]/stream/route.ts`.
3. Refactor `lib/stream-event-bus.ts` to consume canonical events as first-class path, preserve backward compatibility.
4. Run a focused Codex-style UI alignment pass on `app/[id]/page.tsx` and tool cards.

---

## Acceptance Criteria

- User requests run through routing and still execute in the same Daytona sandbox session.
- Tool timeline displays deterministic lifecycle and artifacts without payload-shape-specific regressions.
- No large blob payload is required for normal image/tool display paths.
- UI interaction model matches Codex-style behavior patterns (session continuity, progressive steps, artifact visibility).
