# Copilot Instructions

## Context-First Workflow
- Read `docs/ai-context/index.md` first.
- Read 1-2 relevant files from `docs/ai-context/features/` before scanning code.
- Open source files only when exact implementation details are required.

## Editing Rules
- Preserve behavior documented in feature `Invariants` unless explicitly asked to change it.
- If a change alters behavior or data flow, update the matching feature doc in the same PR.
- Keep edits local to the minimal feature surface.

## Prompt Guidance For Contributors
- Include context files first:
  - `#file docs/ai-context/index.md`
  - `#file docs/ai-context/features/<target>.md`
- For bug fixes, also include `#selection` over the failing function.
- Ask for impacted-files list before code changes on medium/large tasks.

## Source-Of-Truth Rule
- Code is source of truth for exact syntax and selectors.
- AI-context files are source of truth for architecture, flow, and invariants.
