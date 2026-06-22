/**
 * Guild (server) resolution and info — REST-only, no gateway/cache.
 */

import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { getConfig } from '../client/config.js';
import { GuildNotFoundError, GuildNotSelectedError } from '../utils/errors.js';

let currentGuildId: string | null = null;
let guildListCache: any[] | null = null;

export function setCurrentGuild(id: string): void {
  currentGuildId = id;
}
export function getCurrentGuildId(): string | null {
  return currentGuildId;
}
export function clearCurrentGuild(): void {
  currentGuildId = null;
}
/** Test seam / cache invalidation. */
export function _resetGuildCache(): void {
  guildListCache = null;
}

async function fetchGuildList(): Promise<any[]> {
  if (guildListCache) return guildListCache;
  guildListCache = (await getRest().get(Routes.userGuilds())) as any[];
  return guildListCache;
}

export async function listGuilds(): Promise<Array<{ id: string; name: string }>> {
  const gs = await fetchGuildList();
  return gs.map((g) => ({ id: g.id, name: g.name }));
}

/**
 * Resolve a guild id from an explicit id/name, current context, or config default.
 * The bot's guild list is authoritative; a direct GET is only a fallback for a
 * just-joined guild not yet in the cached list.
 */
export async function resolveGuildId(idOrName?: string): Promise<string> {
  const target = idOrName || currentGuildId || getConfig().defaultGuildId;
  if (!target) throw new GuildNotSelectedError();

  const gs = await fetchGuildList();
  const match = gs.find(
    (g) => g.id === target || g.name.toLowerCase() === target.toLowerCase()
  );
  if (match) return match.id;

  if (/^\d{17,20}$/.test(target)) {
    try {
      await getRest().get(Routes.guild(target));
      _resetGuildCache(); // list was stale
      return target;
    } catch {
      throw new GuildNotFoundError(target);
    }
  }
  throw new GuildNotFoundError(target);
}

export async function getGuildInfo(guildId: string) {
  const rest = getRest();
  const [guild, channels, roles] = await Promise.all([
    rest.get(Routes.guild(guildId), {
      query: new URLSearchParams({ with_counts: 'true' }),
    }) as Promise<any>,
    rest.get(Routes.guildChannels(guildId)) as Promise<any[]>,
    rest.get(Routes.guildRoles(guildId)) as Promise<any[]>,
  ]);
  return {
    id: guild.id,
    name: guild.name,
    description: guild.description,
    memberCount: guild.approximate_member_count,
    ownerId: guild.owner_id,
    verificationLevel: guild.verification_level,
    explicitContentFilter: guild.explicit_content_filter,
    defaultMessageNotifications: guild.default_message_notifications,
    features: guild.features,
    roles: roles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: r.permissions,
    })),
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parent_id,
      position: c.position,
    })),
  };
}

/** Read live channels for a guild (used for idempotency in later subsystems). */
export async function fetchChannels(guildId: string): Promise<any[]> {
  return (await getRest().get(Routes.guildChannels(guildId))) as any[];
}
/** Read live roles for a guild. */
export async function fetchRoles(guildId: string): Promise<any[]> {
  return (await getRest().get(Routes.guildRoles(guildId))) as any[];
}
