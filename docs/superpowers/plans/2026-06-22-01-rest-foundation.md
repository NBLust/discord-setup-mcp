# REST-Only Foundation — Implementation Plan (Subsystem 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gateway/intents Discord client with a REST-only client and port the existing 18 tools to it, plus fix the permission map and add a test harness — producing the same working tools with zero privileged intents.

**Architecture:** A singleton `REST` (`import { REST, Routes } from 'discord.js'`) drives all calls. Guild/channel/role resolution moves from `client.guilds.cache` to REST GETs with per-process in-memory caches. A new `services/permissions.ts` centralizes the name↔bitfield mapping (with the Nov-2025 split bits). No `Client`, no `GatewayIntentBits`, no `login()`.

**Tech Stack:** TypeScript, discord.js 14.25.1 (REST + builders only), `discord-api-types` Routes (via discord.js re-export), zod, vitest, yaml.

> This is subsystem 1 of 5 (foundation → content → blueprint → server-features → polish). Each subsystem is its own plan and lands as working, tested software. Live tests run ONLY against `mcp-test` (guild id `1518725132057710653`); never `counsel`.

---

### Task 1: Test harness + deps

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.md` (note: live tests gated behind `MCP_TEST_GUILD` env)

- [ ] **Step 1: Add deps and scripts**

Run:
```bash
cd /Users/fianso/discord-setup-mcp
npm install --save yaml
npm install --save-dev vitest
```

- [ ] **Step 2: Add scripts to package.json**

In `package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Verify**

Run: `npx vitest run --reporter=dot` → Expected: "No test files found" (exit 0) — harness works.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest harness and yaml dep"
```

---

### Task 2: Centralized permission map (fixes Nov-2025 split bug)

**Files:**
- Create: `src/services/permissions.ts`
- Test: `tests/permissions.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { permissionNamesToBitfield, bitfieldToPermissionNames } from '../src/services/permissions.js';

describe('permissions', () => {
  it('maps SCREAMING_SNAKE names to a bitfield string', () => {
    const bf = permissionNamesToBitfield(['VIEW_CHANNEL', 'SEND_MESSAGES']);
    expect(typeof bf).toBe('string');
    expect(BigInt(bf) > 0n).toBe(true);
  });
  it('round-trips names', () => {
    const names = ['MANAGE_MESSAGES', 'PIN_MESSAGES', 'CREATE_EVENTS'];
    const bf = permissionNamesToBitfield(names);
    const back = bitfieldToPermissionNames(bf);
    for (const n of names) expect(back).toContain(n);
  });
  it('knows the Nov-2025 split bits', () => {
    for (const n of ['PIN_MESSAGES', 'BYPASS_SLOWMODE', 'CREATE_GUILD_EXPRESSIONS', 'CREATE_EVENTS']) {
      expect(permissionNamesToBitfield([n])).not.toBe('0');
    }
  });
  it('ignores unknown names safely', () => {
    expect(permissionNamesToBitfield(['NOT_A_PERM'])).toBe('0');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/permissions.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement permissions.ts**

```ts
import { PermissionFlagsBits } from 'discord.js';

// SCREAMING_SNAKE_CASE -> PascalCase key in PermissionFlagsBits
function snakeToPascal(s: string): string {
  return s.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

// Explicit overrides where simple snake->pascal does not match discord.js keys,
// including the Nov-2025 split additions.
const ALIASES: Record<string, keyof typeof PermissionFlagsBits> = {
  PIN_MESSAGES: 'PinMessages',
  BYPASS_SLOWMODE: 'BypassSlowmode',
  CREATE_GUILD_EXPRESSIONS: 'CreateGuildExpressions',
  CREATE_EVENTS: 'CreateEvents',
  USE_VAD: 'UseVAD',
  USE_EXTERNAL_EMOJIS: 'UseExternalEmojis',
  USE_EXTERNAL_STICKERS: 'UseExternalStickers',
  SEND_TTS_MESSAGES: 'SendTTSMessages',
  MANAGE_GUILD_EXPRESSIONS: 'ManageGuildExpressions',
  USE_APPLICATION_COMMANDS: 'UseApplicationCommands',
  USE_EMBEDDED_ACTIVITIES: 'UseEmbeddedActivities',
  USE_EXTERNAL_SOUNDS: 'UseExternalSounds',
  REQUEST_TO_SPEAK: 'RequestToSpeak',
};

function resolveKey(name: string): keyof typeof PermissionFlagsBits | undefined {
  if (ALIASES[name]) return ALIASES[name];
  const pascal = snakeToPascal(name) as keyof typeof PermissionFlagsBits;
  return pascal in PermissionFlagsBits ? pascal : undefined;
}

export function permissionNamesToBitfield(names: string[]): string {
  let bf = 0n;
  for (const n of names) {
    const key = resolveKey(n);
    if (key) bf |= PermissionFlagsBits[key];
  }
  return bf.toString();
}

export function bitfieldToPermissionNames(bitfield: string | bigint): string[] {
  const bf = BigInt(bitfield);
  const out: string[] = [];
  // Build reverse map name(SNAKE) -> bit by iterating known flags
  for (const [pascalKey, bit] of Object.entries(PermissionFlagsBits) as [string, bigint][]) {
    if ((bf & bit) === bit && bit !== 0n) {
      // find a SNAKE alias if one maps here, else derive
      const alias = Object.entries(ALIASES).find(([, v]) => v === pascalKey)?.[0];
      out.push(alias ?? pascalKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase());
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/permissions.test.ts` → Expected: PASS (4 tests). If a Pascal key fails, fix the alias map and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/services/permissions.ts tests/permissions.test.ts
git commit -m "feat: centralized permission map with Nov-2025 split bits"
```

---

### Task 3: REST singleton client

**Files:**
- Create: `src/client/rest.ts`
- Delete: `src/client/discord.ts` (in Task 9, after handlers ported)

- [ ] **Step 1: Implement rest.ts**

```ts
import { REST } from 'discord.js';
import { getConfig } from './config.js';

let restInstance: REST | null = null;

/** Returns a singleton REST client authenticated with the bot token. No gateway, no intents. */
export function getRest(): REST {
  if (restInstance) return restInstance;
  const config = getConfig();
  restInstance = new REST({ version: '10' }).setToken(config.discordToken);
  return restInstance;
}

/** Test seam: reset the singleton. */
export function resetRest(): void {
  restInstance = null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` → Expected: no errors related to rest.ts (existing files may still error until ported — that is fine; check only rest.ts has no errors).

- [ ] **Step 3: Commit**

```bash
git add src/client/rest.ts
git commit -m "feat: REST-only singleton client"
```

---

### Task 4: Guild service over REST

**Files:**
- Modify: `src/services/guild.ts` (full rewrite to REST)
- Test: `tests/guild-resolve.test.ts`

- [ ] **Step 1: Write failing test for name/id resolution (mock REST)**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as restMod from '../src/client/rest.js';
import { resolveGuildId, listGuilds, _resetGuildCache } from '../src/services/guild.js';

function mockRest(guilds: any[]) {
  vi.spyOn(restMod, 'getRest').mockReturnValue({
    get: vi.fn(async (route: string) => {
      if (route.includes('/users/@me/guilds')) return guilds;
      const m = route.match(/\/guilds\/(\d+)$/);
      if (m) { const g = guilds.find(x => x.id === m[1]); if (g) return g; const e: any = new Error('Unknown Guild'); e.status = 404; throw e; }
      return [];
    }),
  } as any);
}

describe('guild resolution', () => {
  beforeEach(() => { _resetGuildCache(); vi.restoreAllMocks(); });
  it('resolves by exact id', async () => {
    mockRest([{ id: '111', name: 'Alpha' }]);
    expect(await resolveGuildId('111')).toBe('111');
  });
  it('resolves by case-insensitive name', async () => {
    mockRest([{ id: '111', name: 'Alpha' }, { id: '222', name: 'Beta' }]);
    expect(await resolveGuildId('beta')).toBe('222');
  });
  it('lists guilds', async () => {
    mockRest([{ id: '111', name: 'Alpha' }]);
    const gs = await listGuilds();
    expect(gs[0].name).toBe('Alpha');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/guild-resolve.test.ts` → Expected: FAIL (functions not exported).

- [ ] **Step 3: Rewrite services/guild.ts to REST**

Replace the file. Keep the selected-guild context (`currentGuildId`, `setCurrentGuild`, `getCurrentGuildId`, `clearCurrentGuild`). Replace `resolveGuild(client, idOrName)` with `resolveGuildId(idOrName?)` returning a guild id string, and add REST-backed `listGuilds()` and `getGuildInfo(guildId)`.

```ts
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { getConfig } from '../client/config.js';
import { GuildNotFoundError, GuildNotSelectedError } from '../utils/errors.js';

let currentGuildId: string | null = null;
let guildListCache: any[] | null = null;

export function setCurrentGuild(id: string) { currentGuildId = id; }
export function getCurrentGuildId() { return currentGuildId; }
export function clearCurrentGuild() { currentGuildId = null; }
export function _resetGuildCache() { guildListCache = null; }

async function fetchGuildList(): Promise<any[]> {
  if (guildListCache) return guildListCache;
  guildListCache = (await getRest().get(Routes.userGuilds())) as any[];
  return guildListCache;
}

export async function listGuilds(): Promise<Array<{ id: string; name: string }>> {
  const gs = await fetchGuildList();
  return gs.map(g => ({ id: g.id, name: g.name }));
}

/** Resolve a guild id from an explicit id/name, current context, or config default. */
export async function resolveGuildId(idOrName?: string): Promise<string> {
  const target = idOrName || currentGuildId || getConfig().defaultGuildId;
  if (!target) throw new GuildNotSelectedError();
  if (/^\d{17,20}$/.test(target)) {
    try { await getRest().get(Routes.guild(target)); return target; }
    catch { /* fall through to name match */ }
  }
  const gs = await fetchGuildList();
  const byName = gs.find(g => g.name.toLowerCase() === target.toLowerCase());
  if (byName) return byName.id;
  if (/^\d{17,20}$/.test(target)) throw new GuildNotFoundError(target);
  throw new GuildNotFoundError(target);
}

export async function getGuildInfo(guildId: string) {
  const rest = getRest();
  const [guild, channels, roles] = await Promise.all([
    rest.get(Routes.guild(guildId) + '?with_counts=true') as Promise<any>,
    rest.get(Routes.guildChannels(guildId)) as Promise<any[]>,
    rest.get(Routes.guildRoles(guildId)) as Promise<any[]>,
  ]);
  return {
    id: guild.id, name: guild.name, description: guild.description,
    memberCount: guild.approximate_member_count, ownerId: guild.owner_id,
    verificationLevel: guild.verification_level,
    explicitContentFilter: guild.explicit_content_filter,
    defaultMessageNotifications: guild.default_message_notifications,
    features: guild.features,
    roles: roles.map(r => ({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions })),
    channels: channels.map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parent_id, position: c.position })),
  };
}

/** Read live channels/roles for a guild (used for idempotency later). */
export async function fetchChannels(guildId: string): Promise<any[]> {
  return (await getRest().get(Routes.guildChannels(guildId))) as any[];
}
export async function fetchRoles(guildId: string): Promise<any[]> {
  return (await getRest().get(Routes.guildRoles(guildId))) as any[];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/guild-resolve.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/guild.ts tests/guild-resolve.test.ts
git commit -m "feat: REST-backed guild resolution and info"
```

---

### Task 5: Port guild tools

**Files:**
- Modify: `src/tools/guild.ts`

- [ ] **Step 1: Rewrite the three handlers**

Each handler drops `getDiscordClient()`/`resolveGuild(client, …)` and calls the new service. Pattern:
```ts
// list_guilds
export async function listGuildsHandler() {
  try {
    const guilds = await listGuilds();
    return { success: true, data: { guilds, currentGuildId: getCurrentGuildId(), totalCount: guilds.length,
      message: guilds.length === 0 ? 'Bot is not in any servers. Invite it first.' : `Found ${guilds.length} server(s).` } };
  } catch (error) { const e = wrapDiscordError(error, 'list_guilds'); return { success: false, error: JSON.stringify(e.toJSON()) }; }
}
// select_guild
export async function selectGuildHandler(input: SelectGuildInput) {
  try {
    const id = await resolveGuildId(input.guildId);
    setCurrentGuild(id);
    const gs = await listGuilds();
    const name = gs.find(g => g.id === id)?.name ?? id;
    return { success: true, data: { guildId: id, guildName: name, message: `Selected ${name} (${id}).` } };
  } catch (error) { const e = wrapDiscordError(error, 'select_guild'); return { success: false, error: JSON.stringify(e.toJSON()) }; }
}
// get_guild_info
export async function getGuildInfoHandler(input: GetGuildInfoInput) {
  try {
    const id = await resolveGuildId(input.guildId);
    return { success: true, data: await getGuildInfo(id) };
  } catch (error) { const e = wrapDiscordError(error, 'get_guild_info'); return { success: false, error: JSON.stringify(e.toJSON()) }; }
}
```
Keep the tool definitions and zod schemas unchanged. Update imports to the new service exports.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep tools/guild.ts` → Expected: no output (no errors in this file).

- [ ] **Step 3: Commit**

```bash
git add src/tools/guild.ts
git commit -m "feat: port guild tools to REST"
```

---

### Task 6: Port channel tools

**Files:**
- Modify: `src/tools/channels.ts`

- [ ] **Step 1: Rewrite handlers to REST**

Use `permissionNamesToBitfield` from the new service for overwrites. Replace `guild.channels.create(opts)` with `rest.post(Routes.guildChannels(guildId), { body })` and `channel.edit/delete` with `rest.patch/delete(Routes.channel(channelId), …)`. Overwrite body shape:
```ts
const overwrites = (input.permissionOverwrites ?? []).map(o => ({
  id: o.id, type: o.type === 'role' ? 0 : 1,
  allow: permissionNamesToBitfield(o.allow ?? []), deny: permissionNamesToBitfield(o.deny ?? []),
}));
```
create_channel body:
```ts
const typeMap: Record<string, number> = { text:0, voice:2, announcement:5, stage:13, forum:15, media:16 };
const body: any = { name: input.name, type: typeMap[input.type], parent_id: input.categoryId,
  topic: input.topic, nsfw: input.nsfw, rate_limit_per_user: input.slowmode,
  bitrate: input.bitrate, user_limit: input.userLimit, position: input.position,
  permission_overwrites: overwrites.length ? overwrites : undefined };
const created = await getRest().post(Routes.guildChannels(guildId), { body }) as any;
```
create_category: same with `type: 4`. edit_channel: `rest.patch(Routes.channel(input.channelId), { body })`. delete_channel: `rest.delete(Routes.channel(input.channelId))`. Resolve `guildId` via `resolveGuildId(input.guildId)`. Add `media` (16) to the channel-type enum in the zod schema and tool definition.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep tools/channels.ts` → Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/tools/channels.ts
git commit -m "feat: port channel tools to REST (+ media channel type)"
```

---

### Task 7: Port role tools (removes raw fetch rate-limit bug)

**Files:**
- Modify: `src/tools/roles.ts`

- [ ] **Step 1: Rewrite handlers to REST**

Replace any hand-rolled `fetch()` and `guild.roles.*` with REST through the queue:
```ts
// create_role
const body: any = { name: input.name, hoist: input.hoist, mentionable: input.mentionable,
  permissions: input.permissions ? permissionNamesToBitfield(input.permissions) : undefined,
  color: typeof input.color === 'string' ? parseInt(input.color.replace('#',''),16) : input.color };
const role = await getRest().post(Routes.guildRoles(guildId), { body }) as any;
// edit_role -> rest.patch(Routes.guildRole(guildId, input.roleId), { body })
// delete_role -> rest.delete(Routes.guildRole(guildId, input.roleId))
// reorder_roles -> rest.patch(Routes.guildRoles(guildId), { body: input.rolePositions.map(p => ({ id: p.roleId, position: p.position })) })
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep tools/roles.ts` → Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/tools/roles.ts
git commit -m "feat: port role tools to REST queue (fixes raw-fetch rate-limit bug)"
```

---

### Task 8: Port settings tools

**Files:**
- Modify: `src/tools/settings.ts`

- [ ] **Step 1: Rewrite handlers to REST**

All four settings handlers PATCH the guild:
```ts
const guildId = await resolveGuildId(input.guildId);
await getRest().patch(Routes.guild(guildId), { body: {
  verification_level: input.verificationLevel,            // set_verification_level
  explicit_content_filter: input.contentFilter,           // set_content_filter
  default_message_notifications: input.defaultNotifications, // set_default_notifications
  // update_server_settings: include whichever fields provided
} });
```
Each handler includes only its relevant field(s); `update_server_settings` builds the body from provided fields.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep tools/settings.ts` → Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/tools/settings.ts
git commit -m "feat: port settings tools to REST"
```

---

### Task 9: Remove gateway client + fix shutdown

**Files:**
- Modify: `src/index.ts`
- Delete: `src/client/discord.ts`
- Modify: `src/tools/templates.ts` (only the imports/guild-resolution calls; template engine ported in subsystem 3 — for now make it compile by resolving guildId and passing it down)

- [ ] **Step 1: Update index.ts**

Remove `import { closeDiscordClient }` and the gateway references. Simplify `main()`: no client to close. Keep `StdioServerTransport` + registration. Update the shutdown handler to just `process.exit(0)`. Update startup log to "REST-only; no gateway connection."

- [ ] **Step 2: Make templates.ts compile**

In `tools/templates.ts`, replace `getDiscordClient()` + `resolveGuild(client, …)` with `await resolveGuildId(input.guildId)` and have `applyTemplateHandler` pass the guild id to a temporary REST-based shim (full engine rewrite is subsystem 3). If the preset apply is complex, mark the body of `applyTemplateHandler` to call into a new `services/templates.ts` function `applyTemplateRest(guildId, template)` that creates roles then categories/channels via REST (mirror of the old logic using `getRest()` + `permissionNamesToBitfield`).

- [ ] **Step 3: Delete the gateway client**

```bash
git rm src/client/discord.ts
```

- [ ] **Step 4: Build + typecheck**

Run: `npm run build && npx tsc --noEmit` → Expected: build success, no type errors anywhere.

- [ ] **Step 5: Run all unit tests**

Run: `npx vitest run` → Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove gateway client, REST-only entrypoint"
```

---

### Task 10: Live smoke test on mcp-test + reconnect

**Files:**
- Create: `tests/live-smoke.mjs` (manual, not in vitest; reads token from ~/.discord-mcp/config.json)

- [ ] **Step 1: Write live smoke script**

Script (run with `node tests/live-smoke.mjs`): build `getRest()` equivalent inline with the token; against guild `1518725132057710653` (mcp-test): (a) GET channels and roles; (b) POST a category "smoke-cat" + a text channel "smoke-chan"; (c) PATCH the channel topic; (d) DELETE both; (e) assert each step's status. Print PASS/FAIL per step. Self-cleans.

- [ ] **Step 2: Run it**

Run: `node tests/live-smoke.mjs` → Expected: all steps PASS, mcp-test left clean (verify with a final GET showing no smoke-* channels).

- [ ] **Step 3: Rebuild dist + reconnect the live MCP**

Run: `npm run build && claude mcp get discord-setup` → Expected: build success; MCP still ✔ Connected (now running REST-only).

- [ ] **Step 4: Commit**

```bash
git add tests/live-smoke.mjs
git commit -m "test: live REST smoke test on mcp-test"
```

---

## Self-Review

- **Spec coverage (subsystem 1):** REST-only client (§3.1) → Tasks 3,9. REST resolution (§3.2) → Task 4. Permission-map fix (§7) → Task 2. Rate-limit fix (§7) → Task 7. Test strategy (§8) → Tasks 1,2,4,10. Ported existing tools → Tasks 5–8. Remaining spec sections (content/blueprint/server-features/deps-bumps/registerTool) are deferred to subsystems 2–5 by design.
- **Placeholders:** none — every code step shows real code; Task 9 Step 2 references a shim function `applyTemplateRest(guildId, template)` fully specified there and finished in subsystem 3.
- **Type consistency:** `resolveGuildId` (string→Promise<string>) used consistently in Tasks 5–8; `permissionNamesToBitfield` signature matches Task 2; `getRest()` matches Task 3.
- **Deferred dep bumps:** discord.js/MCP-SDK bumps + `registerTool` migration intentionally in subsystem 5 to avoid churn mid-refactor; `server.tool()` stays for now.
