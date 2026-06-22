# Discord Setup MCP — Complete Rebuild (v3.0.0) — Design Spec

Date: 2026-06-22
Status: Draft for review
Owner: Fianso (fork of `cj-vana/discord-setup-mcp`)

## 1. Goal

Turn the MCP from "18 CRUD tools + 4 hardcoded presets that produce empty channels" into **a custom-blueprint engine + a content layer**: Claude builds *exactly* the server you describe (or a versioned blueprint file), fills it with real content, and configures modern server features — idempotently, with a dry-run preview, on a clean REST-only architecture.

Primary driving use case: **Counsel** (parimutuel prediction market on XRPL) community server.

## 2. Hard constraints (verified)

- A **bot cannot create a blank guild** (`POST /guilds` → 20001). The bot must be invited to an existing server. Out of scope to "fix".
- **Community-gated features** (announcement channels, stage channels, onboarding, welcome screen, rules screening, media channels) require the guild to have `COMMUNITY` enabled. The bot *can* enable Community (needs ADMINISTRATOR + a complete settings payload), but it is a distinct, explicit step.
- **Role hierarchy**: the bot can only create/edit roles *below* its own highest role, and can only grant permissions it holds. `@everyone` and managed roles are not recreatable.
- **Component interactions** (button/select clicks) require an always-on gateway listener answering within 3s. This MCP is request/response and exits — so only **link-style buttons (style 5)** are supported; no interactive handlers.
- **Branding**: only the server **icon** is guaranteed on a vanilla server. Banner/splash/vanity are boost/feature-gated and not bot-grantable. **Server Tags** have no write API at all.

## 3. Architecture

### 3.1 REST-only client (no gateway, no intents)
- New `src/client/rest.ts`: a singleton `REST` instance (`@discordjs/rest`) configured with the bot token. No `Client`, no gateway connection, no `GatewayIntentBits`, no privileged-intent toggle, no 100-guild verification cliff, instant cold start.
- All API calls go through `rest.get/post/patch/put/delete(Routes.*)` using `discord-api-types/v10` route builders. `discord.js` is retained only for **pure helpers/constants** (`PermissionFlagsBits`, `EmbedBuilder`, `ChannelType`, `OverwriteType`) which work without a gateway connection.
- `@discordjs/rest` provides bucket-aware rate-limit queuing for free — this also fixes the current raw-`fetch()` rate-limit bug.

### 3.2 Guild/channel/role resolution (REST)
- `resolveGuild(idOrName)`: by ID → `GET /guilds/{id}`; by name → `GET /users/@me/guilds` (paginated, cached in-memory for the process) then case-insensitive match. Current selected-guild context preserved.
- Channel/role lookups: `GET /guilds/{id}/channels`, `GET /guilds/{id}/roles`, cached per-guild per-process with explicit invalidation after mutations (needed for idempotency diffing).

### 3.3 Module layout
```
src/
  client/rest.ts            REST singleton + token config (keep config.ts, drop discord.ts)
  services/
    guild.ts                REST resolution + guild info + in-memory caches
    blueprint.ts            parse/validate/plan/apply blueprint (the engine)
    content.ts              message/embed/pin/forum/webhook helpers
    permissions.ts          name<->bitfield map (FIXED, incl. Nov-2025 split bits)
  tools/
    guild.ts channels.ts roles.ts settings.ts   (existing, ported to REST)
    blueprint.ts content.ts automod.ts events.ts community.ts invites.ts branding.ts  (new)
    templates.ts            (kept; presets become blueprints internally)
  templates/                4 presets re-expressed as blueprint objects
  blueprints/               versioned YAML/JSON blueprints (e.g. counsel.yaml)
  utils/errors.ts           + CommunityRequiredError, HierarchyError
```

## 4. Blueprint engine (the core)

### 4.1 Dual input (user decision: both)
- **Inline**: `apply_blueprint({ blueprint: <object> })` — Claude generates the structured object from a natural-language description.
- **File**: `apply_blueprint({ file: "blueprints/counsel.yaml" })` — loads a versioned YAML/JSON file, normalized into the same canonical zod schema.
- One canonical schema; the YAML loader (`yaml` dep) just parses → validate.

### 4.2 Schema (canonical, zod-validated)
```
{
  guild?: { name?, description?, icon?, verificationLevel?, contentFilter?, defaultNotifications? },
  roles?:      [ { name, color?, hoist?, mentionable?, permissions?[], position? } ],
  categories?: [ { name, overwrites?[], channels: [ {
                   name, type: text|voice|announcement|stage|forum|media,
                   topic?, nsfw?, slowmode?, bitrate?, userLimit?,
                   overwrites?[],          // {role|member, allow[], deny[]}
                   forumTags?[], defaultReaction?,
                   messages?: [ { content?, embed?, pin?, webhookPersona? } ]   // seed content
                 } ] } ],
  automod?:  [ { name, trigger: keyword|spam|mention_spam|keyword_preset, ..., action: block|alert, alertChannel? } ],
  events?:   [ { name, description?, startTime, endTime?, channel?|location?, entityType } ]
}
```
Gated types (announcement/stage/forum-as-media/onboarding) are detected; if guild lacks `COMMUNITY`, the plan flags them and apply either skips-with-warning or errors (configurable, default: warn+skip the gated parts, build the rest).

### 4.3 Idempotency
Apply = read live state → diff **by name** → for each entity: create if absent, patch if changed, skip if identical. Returns a report `{ created, updated, skipped, warnings }`. Re-applying the same blueprint is a no-op. (Names are the identity key; documented limitation: renames look like create+orphan.)

### 4.4 Dry-run / plan
`plan_blueprint({ blueprint|file })` runs the full diff **without mutating** and returns: counts (create/update/skip), gated-feature warnings, bot-permission checks, role-hierarchy checks, Discord-limit checks (roles ≤250, channels ≤500), estimated API call count. The pre-flight for a safe `apply_blueprint`.

### 4.5 export_server
`export_server({ guildId })` → reads an existing server and emits a blueprint object (roles, categories, channels, overwrites, settings) that can be saved to a file and re-applied elsewhere. Content/webhooks/emojis/automod are **not** exportable (documented).

## 5. Content layer

REST helpers + tools (require the bot invite to include SEND_MESSAGES, EMBED_LINKS, MANAGE_WEBHOOKS, CREATE_PUBLIC_THREADS, ADD_REACTIONS, MANAGE_MESSAGES — all in the Administrator invite already used):
- `send_message(channelId, content)` — ≤2000 chars, markdown.
- `post_embed(channelId, embed)` — `EmbedBuilder`, ≤10/msg, 6000-char budget.
- `pin_message(channelId, messageId)`.
- `create_forum_post(channelId, name, content, tags?)`.
- `post_message_with_components(channelId, content, linkButtons[])` — **link buttons only** (style 5); documented that interactive components are unsupported (no always-on handler).
- `post_via_webhook(channelId, { name, avatar, content|embed })` — custom personas.

The blueprint `messages[]` field seeds content after structure is built (welcome posted+pinned, rules as embed, forum FAQ).

## 6. Server-feature tools

- `configure_automod` — keyword / spam / mention-spam / keyword-preset rules; action block + optional alert channel. No Community gate. (P0)
- `create_scheduled_event` — external/voice/stage events. (P1)
- `create_invite` — channel invite, configurable maxAge/maxUses. (P1)
- `enable_community` — single complete PATCH (features + rules_channel_id + public_updates_channel_id + verification + content filter). Requires ADMINISTRATOR. Unlocks the gated stack. (P1)
- `configure_onboarding`, `set_welcome_screen` — Community-gated; clear `CommunityRequiredError` if not enabled. (P2)
- `set_server_branding` — icon (guaranteed); banner/splash attempted with graceful boost-gated failure. (P2)

## 7. Correctness & DX fixes

- **Permission map** (`services/permissions.ts`): add Nov-2025 split bits `PIN_MESSAGES`, `BYPASS_SLOWMODE`, `CREATE_GUILD_EXPRESSIONS`, `CREATE_EVENTS`; verify full name↔bitfield coverage. *(fixes active correctness bug in moderation roles)*
- **Rate limits**: all writes via `@discordjs/rest` queue; sequential category/channel creation with adaptive throttle (no parallel 429 storms).
- **Errors**: no silent swallowing in the engine; per-entity errors collected into the apply report; new `CommunityRequiredError`, `HierarchyError`.
- **Deps**: discord.js → 14.26.4, `@modelcontextprotocol/sdk` → 1.29.0 with `server.tool()` → `registerTool` migration, add `@discordjs/rest`/`discord-api-types` (bundled) + `yaml`. Clears the 14 transitive npm-audit vulns. Remove `/tmp/discord-mcp-debug.log` logging.
- **Version**: bump to `3.0.0`.

## 8. Testing strategy

- **Unit (vitest)**: permission name↔bitfield mapping (incl. new bits), blueprint parse/validate (inline + YAML), idempotency diff logic (create/update/skip classification), gated-feature detection. Pure logic, no network.
- **Live integration (on `mcp-test` only, never `counsel`)**: each tool exercised against the real API with **self-cleanup** (create → assert → delete). A scripted end-to-end: apply a small blueprint → assert structure+content → re-apply (assert no-op) → tear down. `mcp-test` guild id `1518725132057710653`.
- Gate "done" on: `npm run build` + `npm run typecheck` + unit green + the live e2e passing.

## 9. Phasing

- **P0**: REST-only client refactor (foundation) · permission-map fix · content layer (send_message/post_embed/pin/forum_post) · blueprint engine (apply + plan, inline+file) · configure_automod.
- **P1**: blueprint `messages[]` seeding · idempotency · dry-run polish · create_scheduled_event · create_invite · enable_community · export_server.
- **P2**: post_via_webhook · post_message_with_components (link buttons) · configure_onboarding + set_welcome_screen · set_server_branding · dep bumps + registerTool migration + vuln clear.

(REST-only refactor is foundational, so it leads P0; dep bumps land in P2 to avoid churn mid-refactor, except `@discordjs/rest`/`discord-api-types`/`yaml` which P0 needs.)

## 10. Out of scope / won't do

Blank-guild creation · vanity URL · Server Tags · banner/splash self-grant · interactive component handlers · moderation/member-management tools (kick/ban/timeout) · analytics. These are documented as limits in the README.
