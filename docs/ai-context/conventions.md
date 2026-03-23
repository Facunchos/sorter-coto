# AI Context Conventions

## Scope Rules
- Organize by behavior, not by source file.
- Keep each feature file under 120 lines.
- Prefer bullets and short numbered flows.
- No long prose and no duplicated explanations.

## Naming Rules
- Pattern: `fNN-domain-action.md`.
- Use stable IDs (`f01`, `f02`, ...), do not renumber existing files.
- Keep names specific (`api-capture-and-scraping`, not `api`).

## Required Sections
- `Purpose`
- `Entry Points`
- `Inputs / Outputs`
- `Dependencies`
- `Data Flow (5-8 steps)`
- `Invariants`
- `Failure Modes`
- `Edit Impact Checklist`

## Maintenance Rules
- Update one feature file when behavior, data flow, or invariants change.
- Skip updates for pure refactors that do not alter behavior.
- Update `index.md` only when feature ownership or feature list changes.

## Retrieval Rules
- Start prompts with `#file docs/ai-context/index.md`.
- Add exactly one relevant feature file before asking for changes.
- Add source files only for precise code edits.
