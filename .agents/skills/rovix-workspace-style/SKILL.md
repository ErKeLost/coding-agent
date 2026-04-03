---
name: rovix-workspace-style
description: Design and refine the Rovix AI coding workspace UI when working on chat UI, ai-elements components, prompt input, tool logs, sidebar, model picker, or Mastra-backed agent states. Use when improving styling, dual-theme polish, or the visual language of the coding workspace.
---

# Rovix Workspace Style

Use this skill when editing the Rovix interface built on ai-elements and the Mastra local coding agent backend.

This skill is specific to this repository. It should guide all work touching:
- app/[id]/page.tsx
- app/globals.css
- components/ai-elements/*
- components/tool-ui/*
- components/app-sidebar.tsx

## Product Context

Rovix is a desktop-first AI coding workspace for developers. It is used for real engineering work: reading files, running tools, planning tasks, steering agents, and reviewing execution traces.

The visual target is:
- fresh and clean
- precise and compact
- Raycast-adjacent in clarity
- local-tool serious, not consumer-chat playful
- consistent across light and dark themes

## Core Visual Direction

Build a unified dual-theme language.

Light mode:
- paper-like, airy, lightly editorial
- warm or lightly tinted neutrals
- clean separators instead of heavy shadows

Dark mode:
- restrained operator console
- low-glare surfaces
- stronger tonal layering, not bright glow

For both:
- compact spacing
- modest radius
- thin structural borders
- accents only for active, selected, running, success, warning, and error states

## AI Elements Guidance

Treat ai-elements as the component skeleton, not the final visual identity.

When working with ai-elements components:
- preserve composition and accessibility contracts
- restyle them through project tokens and shared classes
- keep message, reasoning, tool, and prompt-input surfaces visually related
- avoid making each ai-elements primitive look like a different product

Preferred mapping:
- Conversation: quiet canvas, shared reading rail, strong max-width discipline
- Assistant messages: readable, lightly framed, calm emphasis
- User messages: compact, tactile, slightly more elevated than assistant prose
- Reasoning: secondary and collapsible, clearly subordinate to answer content
- Tool activity: action-log tone first, payload second
- Prompt input: dock-like command surface, not a generic textarea in a card
- Model selector: compact system picker, not a marketing modal

## Mastra-Aware UI Rules

Mastra gives this product meaningful execution states. Reflect them clearly.

Design for these states explicitly:
- idle
- streaming
- queued submission
- guide/steer pending
- tool running
- tool success
- tool error
- plan active
- workspace missing

Rules:
- queued and guide states should feel operational, not alarming
- streaming should read as live progress, not loading fluff
- tool rows should summarize verb + target first
- raw payloads should stay visually secondary
- execution metadata should use mono styling and muted emphasis

## Layout Rules

The app is a workspace, not a feed.

- sidebar stays visually integrated with the shell
- header is light chrome, not a hero region
- conversation column stays readable and centered
- input region is anchored and feels dependable
- expanded tool details align to the same left rail as their row

Avoid:
- nested cards inside cards
- giant empty-state illustrations
- oversized rounded bubbles
- loud gradients on text
- modal-like heaviness for routine controls

## Surface System

Use a restrained surface ladder:
- shell background
- sidebar surface
- panel/input shell
- soft hover or selected fills

Every surface should come from the same token family. Do not invent one-off colors in component files when an app token can do the job.

## Typography

- sans for headings, labels, and prose
- mono for tools, model ids, file paths, token/cost metadata
- keep type compact and readable
- prefer hierarchy through weight, spacing, and tone rather than size inflation

## Component-Specific Checklist

### Messages
- assistant content should feel calm and readable
- user content should feel intentional and slightly elevated
- do not let line length sprawl

### Tool Rows
- collapsed state should already be informative
- expanded state should feel like a trace drawer, not a separate product
- status color is a hint, not the entire layout

### Prompt Input
- shell should feel like a command dock
- attachment strip should feel integrated with the input shell
- footer controls should look like system controls, not CTA buttons

### Empty State
- make it aspirational but restrained
- teach what to do next in one or two lines
- avoid startup-screen vibes inside the main workspace

## Anti-Patterns

Do not introduce:
- purple/cyan AI gradients
- glow-heavy dark UI
- generic SaaS cards
- bubbly chat-app message styling
- decorative badges everywhere
- overly soft or toy-like controls

## Done Criteria

The work is done when:
- the UI reads as one product across ai-elements, tool-ui, and shell chrome
- light and dark themes feel deliberately paired
- tool execution states are easier to scan than before
- the interface feels fresher and more premium without becoming louder