# Blueprint Engine — Implementation Plan (Subsystem 3 of 5)

> REQUIRED SUB-SKILL: superpowers:executing-plans. Builds on subsystems 1-2.

**Goal:** A custom-blueprint engine: describe a whole server (roles, categories, channels, overwrites, settings, seeded content) as one object — inline (Claude-generated) or a versioned YAML/JSON file — and apply it idempotently, with a dry-run plan. Plus `export_server` to clone an existing server into a blueprint.

**Architecture:** `services/blueprint.ts` holds the canonical zod schema, a YAML/JSON loader, a pure `classifyByName` diff, and `planBlueprint` / `applyBlueprint` / `exportServer`. `tools/blueprint.ts` exposes 3 tools. Idempotency keys on entity name; content `messages[]` are seeded ONLY when a channel is newly created (re-apply never duplicates messages).

### Task 1: Schema + loader + pure diff (unit-tested)
- `BlueprintZ` zod schema (guild/roles/categories→channels→messages/overwrites).
- `loadBlueprint({blueprint?,file?})` — YAML or JSON file, or inline object → validated.
- `classifyByName(live, desired, isEqual)` → {create, update, skip}.
- Tests `tests/blueprint.test.ts`: schema valid/invalid; loadBlueprint parses YAML and JSON; classifyByName classifies correctly. Run → PASS. Commit.

### Task 2: Engine (plan/apply/export)
- `planBlueprint(guildId, bp)` — no mutation; counts + gated-feature/limit warnings.
- `applyBlueprint(guildId, bp, {seedMessages})` — idempotent; returns report.
- `exportServer(guildId)` — live server → blueprint object (roles minus @everyone/managed, categories+channels+overwrites, settings). Typecheck clean. Commit.

### Task 3: Tools + register + build
- `tools/blueprint.ts`: `apply_blueprint`, `plan_blueprint`, `export_server`. Register in index.ts. build + typecheck + unit green. Commit.

### Task 4: Live on mcp-test
- `tests/live-smoke-blueprint.mjs`: apply a small blueprint (1 role, 1 category, 1 text channel + seeded pinned message) → assert created → re-apply → assert idempotent (no dupes, no second message) → export → assert shape → self-clean. Commit.
