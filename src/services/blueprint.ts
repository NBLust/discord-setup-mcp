/**
 * Blueprint engine — apply an arbitrary server spec (inline object or
 * versioned YAML/JSON file) idempotently, with a dry-run plan and an
 * export-to-blueprint clone.
 *
 * Idempotency keys on entity NAME. Seeded `messages[]` are posted ONLY when a
 * channel is newly created, so re-applying never duplicates content.
 */

import { z } from 'zod';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { fetchChannels, fetchRoles } from './guild.js';
import { permissionNamesToBitfield, bitfieldToPermissionNames } from './permissions.js';
import { buildEmbed, EmbedZ, type EmbedInput } from './content.js';
import { pinMessage } from './messages.js';
import { ValidationError } from '../utils/errors.js';
import { parseColor } from '../utils/color.js';

// ============================================================================
// SCHEMA
// ============================================================================

const OverwriteZ = z.object({
  role: z.string(),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});

const MessageZ = z.object({
  content: z.string().optional(),
  embed: EmbedZ.optional(),
  pin: z.boolean().optional(),
});

const ChannelZ = z.object({
  name: z.string(),
  type: z.enum(['text', 'voice', 'announcement', 'stage', 'forum', 'media']).default('text'),
  topic: z.string().optional(),
  nsfw: z.boolean().optional(),
  slowmode: z.number().int().optional(),
  bitrate: z.number().int().optional(),
  userLimit: z.number().int().optional(),
  overwrites: z.array(OverwriteZ).optional(),
  messages: z.array(MessageZ).optional(),
});

const CategoryZ = z.object({
  name: z.string(),
  overwrites: z.array(OverwriteZ).optional(),
  channels: z.array(ChannelZ).default([]),
});

const RoleZ = z.object({
  name: z.string(),
  color: z.union([z.string(), z.number()]).optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  position: z.number().int().optional(),
});

export const BlueprintZ = z.object({
  guild: z
    .object({
      name: z.string().optional(),
      description: z.string().optional(),
      verificationLevel: z.enum(['none', 'low', 'medium', 'high', 'very_high']).optional(),
      contentFilter: z.enum(['disabled', 'members_without_roles', 'all_members']).optional(),
      defaultNotifications: z.enum(['all_messages', 'only_mentions']).optional(),
    })
    .optional(),
  roles: z.array(RoleZ).optional(),
  categories: z.array(CategoryZ).optional(),
});

export type Blueprint = z.infer<typeof BlueprintZ>;

const VERIFICATION: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, very_high: 4 };
const CONTENT_FILTER: Record<string, number> = { disabled: 0, members_without_roles: 1, all_members: 2 };
const NOTIFICATIONS: Record<string, number> = { all_messages: 0, only_mentions: 1 };
const CHANNEL_TYPE: Record<string, number> = { text: 0, voice: 2, announcement: 5, stage: 13, forum: 15, media: 16 };
const CHANNEL_TYPE_NAME: Record<number, string> = { 0: 'text', 2: 'voice', 5: 'announcement', 13: 'stage', 15: 'forum', 16: 'media' };
const GATED_TYPES = new Set(['announcement', 'stage']); // require COMMUNITY
const SEEDABLE_TYPES = new Set([0, 5]); // text + announcement accept plain messages

// ============================================================================
// LOADER
// ============================================================================

/** Load a blueprint from an inline object or a YAML/JSON file path. */
export function loadBlueprint(input: { blueprint?: unknown; file?: string }): Blueprint {
  let raw: unknown;
  if (input.file) {
    const text = readFileSync(input.file, 'utf-8');
    raw = parseYaml(text); // parseYaml handles JSON too
  } else if (input.blueprint !== undefined) {
    raw = input.blueprint;
  } else {
    throw new ValidationError('Provide either a blueprint object or a file path');
  }
  const result = BlueprintZ.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(`Invalid blueprint: ${result.error.message}`);
  }
  return result.data;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Fail fast on invalid permission names anywhere in the blueprint (role
 * permissions and overwrite allow/deny lists). Called by both plan and apply
 * so a typo surfaces in the dry-run — never mid-apply after mutations began.
 */
export function validateBlueprintPermissions(bp: Blueprint): void {
  const check = (names: string[] | undefined, where: string) => {
    if (!names) return;
    try {
      permissionNamesToBitfield(names);
    } catch (e) {
      throw new ValidationError(`${where}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const checkOverwrites = (ows: Array<{ role: string; allow?: string[]; deny?: string[] }> | undefined, owner: string) => {
    for (const o of ows ?? []) {
      check(o.allow, `${owner}, overwrite for "${o.role}" (allow)`);
      check(o.deny, `${owner}, overwrite for "${o.role}" (deny)`);
    }
  };
  for (const r of bp.roles ?? []) check(r.permissions, `Role "${r.name}"`);
  for (const cat of bp.categories ?? []) {
    checkOverwrites(cat.overwrites, `Category "${cat.name}"`);
    for (const ch of cat.channels) checkOverwrites(ch.overwrites, `Channel "${ch.name}"`);
  }
}

// ============================================================================
// PURE DIFF
// ============================================================================

export interface Classified<T> {
  create: T[];
  update: T[];
  skip: T[];
}

/**
 * Classify desired items against live items by case-insensitive name.
 * isEqual(desired, liveMatch) decides update vs skip when a match exists.
 */
export function classifyByName<D extends { name: string }, L extends { name: string }>(
  live: L[],
  desired: D[],
  isEqual: (desired: D, live: L) => boolean
): Classified<D> {
  const byName = new Map<string, L>();
  for (const l of live) byName.set(l.name.toLowerCase(), l);
  const out: Classified<D> = { create: [], update: [], skip: [] };
  for (const d of desired) {
    const match = byName.get(d.name.toLowerCase());
    if (!match) out.create.push(d);
    else if (isEqual(d, match)) out.skip.push(d);
    else out.update.push(d);
  }
  return out;
}

function roleEqual(d: z.infer<typeof RoleZ>, live: any): boolean {
  const desiredPerms = d.permissions ? permissionNamesToBitfield(d.permissions) : undefined;
  const desiredColor = parseColor(d.color);
  if (desiredPerms !== undefined && String(live.permissions) !== desiredPerms) return false;
  if (desiredColor !== undefined && live.color !== desiredColor) return false;
  if (d.hoist !== undefined && live.hoist !== d.hoist) return false;
  if (d.mentionable !== undefined && live.mentionable !== d.mentionable) return false;
  return true;
}

function channelEqual(d: z.infer<typeof ChannelZ>, live: any): boolean {
  if (d.topic !== undefined && (live.topic ?? '') !== d.topic) return false;
  if (d.nsfw !== undefined && Boolean(live.nsfw) !== d.nsfw) return false;
  if (d.slowmode !== undefined && (live.rate_limit_per_user ?? 0) !== d.slowmode) return false;
  if (d.bitrate !== undefined && live.bitrate !== d.bitrate) return false;
  if (d.userLimit !== undefined && (live.user_limit ?? 0) !== d.userLimit) return false;
  return true;
}

// ============================================================================
// PLAN (dry-run, no mutation)
// ============================================================================

export async function planBlueprint(guildId: string, bp: Blueprint) {
  validateBlueprintPermissions(bp);
  const rest = getRest();
  const [guild, liveChannels, liveRoles] = await Promise.all([
    rest.get(Routes.guild(guildId)) as Promise<any>,
    fetchChannels(guildId),
    fetchRoles(guildId),
  ]);
  const isCommunity = (guild.features ?? []).includes('COMMUNITY');
  const warnings: string[] = [];

  const roleClass = classifyByName(
    liveRoles.filter((r: any) => r.name !== '@everyone'),
    bp.roles ?? [],
    roleEqual
  );

  // Overwrites reference roles by name; anything not live or defined in the
  // blueprint would be silently dropped at apply time — surface it here.
  const knownRoles = new Set<string>(['@everyone']);
  for (const r of liveRoles) knownRoles.add(r.name.toLowerCase());
  for (const r of bp.roles ?? []) knownRoles.add(r.name.toLowerCase());
  const checkOverwrites = (owner: string, ows?: Array<{ role: string }>) => {
    for (const o of ows ?? []) {
      if (!knownRoles.has(o.role.toLowerCase())) {
        warnings.push(`Overwrite on "${owner}" references unknown role "${o.role}"; it would be skipped.`);
      }
    }
  };

  let catCreate = 0, chCreate = 0, chUpdate = 0, chSkip = 0;
  for (const cat of bp.categories ?? []) {
    const liveCat = liveChannels.find((c: any) => c.type === 4 && c.name.toLowerCase() === cat.name.toLowerCase());
    if (!liveCat) catCreate++;
    checkOverwrites(cat.name, cat.overwrites);
    const siblings = liveCat ? liveChannels.filter((c: any) => c.parent_id === liveCat.id) : [];
    const chClass = classifyByName(siblings, cat.channels, channelEqual);
    chCreate += chClass.create.length;
    chUpdate += chClass.update.length;
    chSkip += chClass.skip.length;
    for (const ch of cat.channels) {
      checkOverwrites(ch.name, ch.overwrites);
      if (GATED_TYPES.has(ch.type) && !isCommunity) {
        warnings.push(`Channel "${ch.name}" (${ch.type}) needs a Community-enabled server; will be skipped. Run enable_community first.`);
      }
    }
  }

  const totalRolesAfter = liveRoles.length + roleClass.create.length;
  if (totalRolesAfter > 250) warnings.push(`Would exceed Discord's 250-role limit (${totalRolesAfter}).`);
  const totalChannelsAfter = liveChannels.length + catCreate + chCreate;
  if (totalChannelsAfter > 500) warnings.push(`Would exceed Discord's 500-channel limit (${totalChannelsAfter}).`);

  return {
    isCommunity,
    roles: { create: roleClass.create.length, update: roleClass.update.length, skip: roleClass.skip.length },
    categories: { create: catCreate, reuse: (bp.categories?.length ?? 0) - catCreate },
    channels: { create: chCreate, update: chUpdate, skip: chSkip },
    warnings,
  };
}

// ============================================================================
// APPLY (idempotent)
// ============================================================================

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildOverwrites(
  overwrites: Array<{ role: string; allow?: string[]; deny?: string[] }> | undefined,
  roleMap: Map<string, string>,
  warnings?: string[]
) {
  if (!overwrites) return undefined;
  const out = [];
  for (const o of overwrites) {
    const id = roleMap.get(o.role.toLowerCase());
    if (!id) {
      warnings?.push(`Skipped permission overwrite for unknown role "${o.role}".`);
      continue;
    }
    out.push({ id, type: 0, allow: permissionNamesToBitfield(o.allow ?? []), deny: permissionNamesToBitfield(o.deny ?? []) });
  }
  return out;
}

export async function applyBlueprint(
  guildId: string,
  bp: Blueprint,
  opts: { seedMessages?: boolean; throttleDelay?: number } = {}
) {
  validateBlueprintPermissions(bp);
  const rest = getRest();
  const throttle = opts.throttleDelay ?? 400;
  const seed = opts.seedMessages !== false;
  const report = {
    rolesCreated: 0, rolesUpdated: 0, rolesSkipped: 0,
    categoriesCreated: 0, categoriesReused: 0,
    channelsCreated: 0, channelsUpdated: 0, channelsSkipped: 0,
    messagesPosted: 0, warnings: [] as string[],
  };

  const guild = (await rest.get(Routes.guild(guildId))) as any;
  const isCommunity = (guild.features ?? []).includes('COMMUNITY');

  // Guild settings
  if (bp.guild) {
    const body: any = {};
    if (bp.guild.name !== undefined) body.name = bp.guild.name;
    if (bp.guild.description !== undefined) body.description = bp.guild.description;
    if (bp.guild.verificationLevel !== undefined) body.verification_level = VERIFICATION[bp.guild.verificationLevel];
    if (bp.guild.contentFilter !== undefined) body.explicit_content_filter = CONTENT_FILTER[bp.guild.contentFilter];
    if (bp.guild.defaultNotifications !== undefined) body.default_message_notifications = NOTIFICATIONS[bp.guild.defaultNotifications];
    if (Object.keys(body).length) await rest.patch(Routes.guild(guildId), { body });
  }

  // Roles (highest position first so hierarchy is sensible)
  let liveRoles = await fetchRoles(guildId);
  const sortedRoles = [...(bp.roles ?? [])].sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
  for (const r of sortedRoles) {
    const live = liveRoles.find((x: any) => x.name.toLowerCase() === r.name.toLowerCase() && x.name !== '@everyone');
    const body: any = {};
    if (r.hoist !== undefined) body.hoist = r.hoist;
    if (r.mentionable !== undefined) body.mentionable = r.mentionable;
    const colorInt = parseColor(r.color);
    if (colorInt !== undefined) body.color = colorInt;
    if (r.permissions) body.permissions = permissionNamesToBitfield(r.permissions);
    if (!live) {
      await rest.post(Routes.guildRoles(guildId), { body: { name: r.name, ...body } });
      report.rolesCreated++;
    } else if (!roleEqual(r, live)) {
      await rest.patch(Routes.guildRole(guildId, live.id), { body });
      report.rolesUpdated++;
    } else {
      report.rolesSkipped++;
    }
    await delay(throttle);
  }

  // Role name -> id map (refresh after role creation)
  liveRoles = await fetchRoles(guildId);
  const roleMap = new Map<string, string>();
  for (const r of liveRoles) roleMap.set(r.name.toLowerCase(), r.id);
  roleMap.set('@everyone', guildId);

  // Categories + channels
  let liveChannels = await fetchChannels(guildId);
  for (const cat of bp.categories ?? []) {
    let liveCat = liveChannels.find((c: any) => c.type === 4 && c.name.toLowerCase() === cat.name.toLowerCase());
    let catId: string;
    if (!liveCat) {
      const created = (await rest.post(Routes.guildChannels(guildId), {
        body: { name: cat.name, type: 4, permission_overwrites: buildOverwrites(cat.overwrites, roleMap, report.warnings) },
      })) as any;
      catId = created.id;
      liveChannels.push(created);
      report.categoriesCreated++;
    } else {
      catId = liveCat.id;
      report.categoriesReused++;
    }
    await delay(throttle);

    for (const ch of cat.channels) {
      if (GATED_TYPES.has(ch.type) && !isCommunity) {
        report.warnings.push(`Skipped "${ch.name}" (${ch.type}): server is not Community-enabled.`);
        continue;
      }
      const live = liveChannels.find(
        (c: any) => c.parent_id === catId && c.name.toLowerCase() === ch.name.toLowerCase()
      );
      if (!live) {
        const body: any = { name: ch.name, type: CHANNEL_TYPE[ch.type] ?? 0, parent_id: catId };
        const ow = buildOverwrites(ch.overwrites, roleMap, report.warnings);
        if (ow && ow.length) body.permission_overwrites = ow;
        if (ch.topic !== undefined) body.topic = ch.topic;
        if (ch.nsfw !== undefined) body.nsfw = ch.nsfw;
        if (ch.slowmode !== undefined) body.rate_limit_per_user = ch.slowmode;
        if (ch.bitrate !== undefined) body.bitrate = ch.bitrate;
        if (ch.userLimit !== undefined) body.user_limit = ch.userLimit;
        const created = (await rest.post(Routes.guildChannels(guildId), { body })) as any;
        liveChannels.push(created);
        report.channelsCreated++;
        await delay(throttle);

        // Seed messages ONLY on creation (keeps re-apply idempotent)
        if (seed && ch.messages && SEEDABLE_TYPES.has(CHANNEL_TYPE[ch.type] ?? 0)) {
          for (const m of ch.messages) {
            const msgBody: any = {};
            if (m.content) msgBody.content = m.content;
            if (m.embed) msgBody.embeds = [buildEmbed(m.embed as EmbedInput)];
            if (!msgBody.content && !msgBody.embeds) continue;
            const posted = (await rest.post(Routes.channelMessages(created.id), { body: msgBody })) as any;
            report.messagesPosted++;
            if (m.pin) await pinMessage(created.id, posted.id);
            await delay(throttle);
          }
        }
      } else if (!channelEqual(ch, live)) {
        const body: any = {};
        if (ch.topic !== undefined) body.topic = ch.topic;
        if (ch.nsfw !== undefined) body.nsfw = ch.nsfw;
        if (ch.slowmode !== undefined) body.rate_limit_per_user = ch.slowmode;
        if (ch.bitrate !== undefined) body.bitrate = ch.bitrate;
        if (ch.userLimit !== undefined) body.user_limit = ch.userLimit;
        await rest.patch(Routes.channel(live.id), { body });
        report.channelsUpdated++;
        await delay(throttle);
      } else {
        report.channelsSkipped++;
      }
    }
  }

  return report;
}

// ============================================================================
// EXPORT (clone a live server into a blueprint)
// ============================================================================

const VERIFICATION_NAME: Record<number, string> = { 0: 'none', 1: 'low', 2: 'medium', 3: 'high', 4: 'very_high' };
const CONTENT_FILTER_NAME: Record<number, string> = { 0: 'disabled', 1: 'members_without_roles', 2: 'all_members' };
const NOTIFICATIONS_NAME: Record<number, string> = { 0: 'all_messages', 1: 'only_mentions' };

export async function exportServer(guildId: string): Promise<Blueprint> {
  const rest = getRest();
  const [guild, channels, roles] = await Promise.all([
    rest.get(Routes.guild(guildId)) as Promise<any>,
    fetchChannels(guildId),
    fetchRoles(guildId),
  ]);

  const idToRoleName = new Map<string, string>();
  for (const r of roles) idToRoleName.set(r.id, r.name);
  idToRoleName.set(guildId, '@everyone');

  const mapOverwrites = (ows: any[] | undefined) =>
    (ows ?? [])
      .filter((o) => o.type === 0 && idToRoleName.has(o.id))
      .map((o) => ({
        role: idToRoleName.get(o.id)!,
        allow: bitfieldToPermissionNames(o.allow ?? '0'),
        deny: bitfieldToPermissionNames(o.deny ?? '0'),
      }));

  const bpRoles = roles
    .filter((r: any) => r.name !== '@everyone' && !r.managed)
    .sort((a: any, b: any) => b.position - a.position)
    .map((r: any) => ({
      name: r.name,
      color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : undefined,
      hoist: r.hoist,
      mentionable: r.mentionable,
      permissions: bitfieldToPermissionNames(r.permissions ?? '0'),
      position: r.position,
    }));

  const categories = channels
    .filter((c: any) => c.type === 4)
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map((cat: any) => ({
      name: cat.name,
      overwrites: mapOverwrites(cat.permission_overwrites),
      channels: channels
        .filter((c: any) => c.parent_id === cat.id && c.type !== 4)
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((c: any) => ({
          name: c.name,
          type: (CHANNEL_TYPE_NAME[c.type] ?? 'text') as any,
          topic: c.topic ?? undefined,
          nsfw: c.nsfw || undefined,
          overwrites: mapOverwrites(c.permission_overwrites),
        })),
    }));

  return {
    guild: {
      name: guild.name,
      description: guild.description ?? undefined,
      verificationLevel: VERIFICATION_NAME[guild.verification_level] as any,
      contentFilter: CONTENT_FILTER_NAME[guild.explicit_content_filter] as any,
      defaultNotifications: NOTIFICATIONS_NAME[guild.default_message_notifications] as any,
    },
    roles: bpRoles,
    categories,
  };
}
