# DESIGN.md

## 1. Product Intent

This product is a desktop-first AI coding workspace. It should feel like a focused operator console rather than a generic chat app.

The interface must balance three qualities:

- calm enough for long coding sessions
- precise enough for engineering workflows
- expressive enough to feel premium and intentional

The design language should combine:

- Codex-like settings and control density
- Linear-like precision and restraint
- Cursor/Raycast-like developer ergonomics

This is not a playful consumer chat product.
This is not a card-heavy SaaS dashboard.
This is not a glassmorphism showcase.

The UI should feel like a serious local tool for building, debugging, planning, and steering agents.

## 2. Visual Theme & Atmosphere

### Core Mood

- dark-first operator workspace
- low-noise surfaces
- compact but breathable spacing
- minimal decorative effects
- strong hierarchy through spacing, typography, and tone instead of big borders or heavy shadows

### Personality

- terminal-adjacent
- technical
- controlled
- confident
- slightly premium, never flashy

### Surface Model

The product should use a restrained layered system:

- app shell: one atmospheric background
- sidebar: transparent or near-transparent over shell
- content panels: solid or near-solid surfaces
- controls: compact, understated, slightly elevated by tone difference only

Avoid frosted glass, blur-heavy overlays, glossy highlights, or soft marketing surfaces.

## 3. Color Palette & Roles

### Base Palette

- `--background`: `#0B1218`
- `--foreground`: `#E6EDF3`
- `--panel`: `#0F1720`
- `--panel-2`: `#131D27`
- `--panel-3`: `#17222D`
- `--border`: `#243241`
- `--border-soft`: `#1C2935`
- `--muted`: `#8A98A8`
- `--muted-2`: `#697789`

### Accent Palette

Primary accent should vary by theme, but its behavior must stay consistent.

Default accent:

- `--primary`: `#7BCB93`
- `--primary-foreground`: `#08110C`

Alternative themes may swap the accent hue, but should preserve:

- subdued backgrounds
- strong text contrast
- low-saturation surfaces
- consistent semantic mapping

### Semantic Roles

- success: `#5FCF8D`
- warning: `#E7B65C`
- error: `#E06C75`
- info: `#6FA8FF`

### Usage Rules

- accents should highlight actions, active states, and key indicators
- accents should not flood large surfaces
- neutrals carry most of the layout
- borders should be subtle and structural, not decorative

## 4. Typography Rules

### Font Pairing

- UI sans: `Geist Sans`, `Inter`, `system-ui`, sans-serif
- code / tool labels / paths: `Geist Mono`, `SFMono-Regular`, `Menlo`, monospace

### Tone

- clean
- compact
- slightly tight
- no oversized marketing type inside the app shell

### Type Hierarchy

- app section title: 26-30px / semibold / tight tracking
- page title: 20-24px / semibold
- panel title: 14-16px / medium
- body: 13-15px / regular
- secondary body: 12-13px / regular
- micro labels: 10-11px / medium
- tool labels / paths: 12-13px / mono

### Rules

- use monospace for model names, tool names, file paths, token counts
- use sans for navigation, prose, settings labels, section headings
- maintain strong contrast for primary content
- secondary metadata should fade through color, not tiny unreadable size

## 5. Layout Principles

### Desktop Layout

Primary structure:

- left sidebar for threads and global navigation
- main content for conversation, tools, settings, and workspace states
- bottom dock-like input region anchored to the conversation view

### Spacing

Use a consistent compact scale:

- 4
- 8
- 12
- 16
- 20
- 24
- 32

### Density

- tighter than Notion
- looser than a terminal
- closer to Codex/Linear settings density

### Width Behavior

- sidebar should feel narrow, useful, and persistent
- main content should not stretch unreadably wide
- long settings lists should be centered in a readable column

## 6. Border Radius Rules

All radius values should be smaller than default modern SaaS apps.

Target radius language:

- micro controls: 6-8px
- buttons and pills: 8-10px
- list items and tool rows: 8-10px
- panels and input shells: 12-16px

Avoid:

- oversized 20px+ radii
- bubble-chat roundness
- circular primary actions unless there is a strong reason

The product should feel engineered, not soft or toy-like.

## 7. Component Stylings

### Sidebar

The sidebar should feel integrated with the full app theme, not like a separate white panel.

Rules:

- transparent or near-transparent background
- active row uses theme accent subtly
- inactive rows use neutral foreground with low visual noise
- section labels are understated
- footer actions should look like compact system controls

Sidebar color behavior must react to theme selection:

- accent hue affects active state border, text emphasis, subtle fills, and control highlights
- not only the sidebar background should change
- selected thread, hover row, footer button, and icons should all reflect the active theme

### Conversation Messages

- assistant prose should be readable and calm
- tool traces should appear lightweight and structured
- reasoning blocks should feel secondary and collapsible
- token usage chips may be colored but must remain subtle

### Tool Activity Rows

Tool rows should read like action logs:

- verb
- tool name
- file path or target detail

Examples:

- `已浏览 read src/App.tsx`
- `正在计划 todowrite home hero refactor`
- `已运行 bash pnpm build`

The file path or target should appear after the tool name, not before it, and should use monospace styling.

### Input Composer

The input area is a docked command surface, not a chat bubble.

It may contain:

- active plan summary
- queued message preview
- guide banner
- file mention chooser
- text input
- bottom toolbar

These should visually merge into one shell.

Rules:

- the plan block, guide block, and file mention block must attach to the input shell
- no floating detached cards above the input
- top helper regions should merge into the same bordered container
- use divider lines between stacked regions

### File Mention Picker

- should emerge from and remain attached to the input shell
- should never look like a detached popover when opened from the composer
- use file icon + filename + parent path
- emphasize path clarity over decorative styling

### Settings

Settings should follow a Codex-like structure:

- left-side settings navigation
- right-side content area
- grouped setting lists
- row-based controls
- minimal ornament

Settings are not just “appearance”.
They are a full settings center.

Suggested sections:

- General
- Appearance
- Agent Behavior
- Models
- Workspace
- Updates
- Advanced

### Update Toast

Update flow should be:

- detect new version
- auto-download in background
- show progress in toast
- when ready, show one clear restart action

Avoid forcing immediate restart without user confirmation.

## 8. Depth & Elevation

Use minimal depth.

Rules:

- panels: light shadow only when necessary
- controls: mostly tonal separation
- overlays: solid backgrounds, crisp borders
- avoid blur-based depth
- avoid glossy specular layers

The app should rely on:

- contrast
- spacing
- typography
- edge definition

not visual effects.

## 9. Interaction & Motion

### Motion

- fast
- subtle
- utility-first

Recommended durations:

- hover: 120-180ms
- panel toggle: 160-220ms
- collapsible sections: 180-240ms

Avoid:

- springy playful motion
- scale-heavy hover effects
- anything that makes the workspace feel unstable

### Interaction Rules

- clickable rows need clear hover and active states
- keyboard focus must be visible
- queue / guide / plan transitions should feel immediate
- long-running actions should surface status progressively

## 10. Responsive Behavior

### Primary Target

- large desktop
- laptop desktop

### Secondary Target

- tablet width

### Mobile

Mobile support should be functional, but this is not a mobile-first product.

Rules:

- sidebar should collapse cleanly
- settings navigation may convert to segmented tabs or stacked sections
- bottom composer should stay anchored and usable
- preserve readable tool traces and paths

## 11. Do

- keep the shell dark, precise, and calm
- let theme affect accent states across sidebar, controls, and active rows
- use row-based settings instead of decorative cards
- attach helper UI to the input shell
- prefer solid surfaces over blur
- show tool path details directly after tool names

## 12. Do Not

- do not use glassmorphism or frosted overlays
- do not overuse rounded corners
- do not build settings like a marketing panel
- do not make the sidebar a separate floating slab
- do not detach mention, guide, or queue UI from the composer
- do not place tool detail tags before the tool name
- do not hide important file paths when tool actions are file-based

## 13. Agent Prompt Guide

When generating UI for this product, follow these instructions:

- build a dark desktop-first AI coding workspace
- use compact, precise spacing and low-noise surfaces
- keep sidebar transparent and theme-aware
- make bottom composer a unified shell with stacked helper regions
- design settings like a real application settings center with left navigation and right list panels
- avoid blur, gloss, glass, oversized radius, and playful marketing cards
- display tool action logs as `verb + tool + target`
- use monospace for paths, tools, and model labels

## 14. Quick Visual Reference

If unsure, bias toward:

- Codex settings information architecture
- Linear precision
- Cursor developer ergonomics
- Vercel restraint

If forced to choose between decorative beauty and operational clarity, choose operational clarity.
