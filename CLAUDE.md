# CLAUDE.md

Development guide for Claude Code when working with this repository.

## Project Overview

Discord Server Setup MCP (v3) is a **REST-only** MCP server that builds out and fills a Discord server via a bot: structure, content, server features, and custom blueprints. There is **no gateway connection and no privileged intents** — every operation is a REST call through `@discordjs/rest`.

A bot **cannot create a blank guild** (`POST /guilds` → `20001`); the bot must be invited to an existing server.

## Quick Reference

```bash
npm install        # deps
npm run build      # tsup -> dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest (unit)
```

Live checks (run against a dedicated test guild only — never a real one):
```bash
node tests/live-smoke.mjs                 # REST foundation
node tests/live-smoke-content.mjs         # content layer
npx tsup tests/_blueprint-livecheck.ts --format esm --out-dir .livecheck --target node18 --no-dts && node .livecheck/_blueprint-livecheck.js
npx tsup tests/_features-livecheck.ts  --format esm --out-dir .livecheck --target node18 --no-dts && node .livecheck/_features-livecheck.js
node tests/_mcp-handshake.mjs             # initialize + tools/list over stdio
```

## Architecture

```
src/
├── index.ts              MCP entry point; registers all tools via registerTool
├── client/
│   ├── rest.ts           REST singleton (getRest) — new REST().setToken(...)
│   └── config.ts         token loading (env DISCORD_BOT_TOKEN or ~/.discord-mcp/config.json)
├── services/
│   ├── guild.ts          REST guild resolution (resolveGuildId), info, fetchChannels/Roles
│   ├── permissions.ts    name <-> bitfield map (strict: unknown names throw; legacy/UI
│   │                     synonyms accepted; PERMISSION_NAMES derived from discord.js)
│   ├── content.ts        buildEmbed / buildLinkButtons + shared EmbedZ zod schema (pure)
│   ├── messages.ts       pinMessage (new pins endpoint with legacy fallback)
│   ├── blueprint.ts      schema, YAML/JSON loader, classifyByName diff, plan/apply/export
│   ├── features.ts       buildAutomodRuleBody / buildScheduledEventBody / bufferToDataUri (pure)
│   └── templates.ts      preset application over REST
├── tools/                guild, channels, roles, settings, templates, content,
│                         blueprint, automod, events, invites, community, branding
├── templates/            4 presets (gaming/community/business/study-group)
└── utils/                errors.ts (DiscordMCPError hierarchy), color.ts (parseColor)
```

### REST conventions

- Get the client with `getRest()`; build paths with `Routes.*` from discord.js (re-exported from `discord-api-types`).
- Resolve a guild id with `await resolveGuildId(input.guildId)` (explicit id/name → current selection → config default).
- Convert permission names with `permissionNamesToBitfield(names)` / `bitfieldToPermissionNames(bitfield)` from `services/permissions.ts`. **Do not** reintroduce a local snake→Pascal map.
- Send raw API bodies (snake_case keys), e.g. `rest.post(Routes.guildChannels(id), { body })`.

### Tool pattern

Each tool module exports a `*ToolDefinition` (JSON Schema), a zod `*InputSchema`, and an async `*Handler` returning `{ success, data?, error? }`. Register in `index.ts` with `registerAsyncTool` / `registerSyncTool`, which call `server.registerTool(name, { description, inputSchema: schema.shape }, cb)` and wrap errors with `wrapDiscordError`.

## Blueprints

`services/blueprint.ts` is the centerpiece. Idempotency keys on entity **name** (`classifyByName`): create if absent, patch if changed, skip if identical. Per-channel `messages[]` are seeded **only on channel creation** so re-apply never duplicates content. `planBlueprint` is the no-mutation dry-run; `exportServer` clones a live server into a blueprint.

## Constraints

- No blank-guild creation (bot-blocked). Community-gated features (announcement/stage channels, onboarding, welcome screen) require `enable_community` first. Interactive components need an always-on listener (unsupported) — link buttons only. Role hierarchy: the bot manages roles below its own and grants only permissions it holds.
- `npm audit` advisories are transitive from the MCP SDK's optional Hono HTTP transport, which this stdio-only server never loads.

## Testing

Unit tests (vitest, no network) cover the pure logic: permission mapping, embed/button builders, blueprint schema/loader/diff, feature builders. Live checks exercise the real handlers against a dedicated test guild with self-cleanup. Gate "done" on build + typecheck + `npm test` + the live checks + the MCP handshake.

## Version History

- **3.1.0** — Strict permission mapping (unknown names throw; legacy synonyms accepted; PERMISSION_NAMES derived from discord.js); shared parseColor/pinMessage/EmbedZ helpers; blueprint plan/apply warn on unknown overwrite roles; announcement-channel seeding; voice bitrate/userLimit diffing; rateLimit.maxRetries wired into REST; removed dead utils/validation.ts.
- **3.0.0** — REST-only rewrite; blueprint engine; content layer; server-feature tools; Nov-2025 permission split fix; rate-limit fix; dep bumps; test suite.
- **2.0.0** — AppleScript → Discord Bot API (discord.js).
