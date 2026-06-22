/**
 * Template Application Service — REST-only.
 * Applies a ServerTemplate to a guild by id: roles first (hierarchy), then
 * categories and their channels, sequentially with throttling to avoid 429s.
 */

import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { fetchChannels, fetchRoles } from './guild.js';
import { permissionNamesToBitfield } from './permissions.js';
import type {
  ServerTemplate,
  ChannelPermissionOverride,
} from '../templates/types.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hexToColorInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

const CHANNEL_TYPE: Record<string, number> = {
  text: 0, voice: 2, announcement: 5, forum: 15, stage: 13, media: 16,
};

function buildOverwrites(
  overrides: ChannelPermissionOverride[] | undefined,
  roleNameToId: Map<string, string>
): Array<{ id: string; type: number; allow: string; deny: string }> {
  if (!overrides || overrides.length === 0) return [];
  const result: Array<{ id: string; type: number; allow: string; deny: string }> = [];
  for (const override of overrides) {
    const roleId =
      roleNameToId.get(override.role.toLowerCase()) || roleNameToId.get(override.role);
    if (!roleId) {
      console.error(`    ⚠ Role not found for permission override: ${override.role}`);
      continue;
    }
    result.push({
      id: roleId,
      type: 0, // role
      allow: permissionNamesToBitfield(override.allow),
      deny: permissionNamesToBitfield(override.deny),
    });
  }
  return result;
}

/**
 * Apply a complete template to a guild (by id) over REST.
 */
export async function applyTemplate(
  guildId: string,
  template: ServerTemplate,
  options?: { skipRoles?: boolean; skipCategories?: boolean; throttleDelay?: number }
): Promise<{ rolesCreated: number; categoriesCreated: number; channelsCreated: number }> {
  const rest = getRest();
  const throttleDelay = options?.throttleDelay ?? 500;
  let rolesCreated = 0;
  let categoriesCreated = 0;
  let channelsCreated = 0;

  // Step 1: roles, sequentially (hierarchy matters).
  if (!options?.skipRoles && template.roles) {
    const sortedRoles = [...template.roles].sort((a, b) => b.position - a.position);
    for (const roleConfig of sortedRoles) {
      try {
        await rest.post(Routes.guildRoles(guildId), {
          body: {
            name: roleConfig.name,
            color: hexToColorInt(roleConfig.color),
            hoist: roleConfig.hoist,
            mentionable: roleConfig.mentionable,
            permissions: permissionNamesToBitfield(roleConfig.permissions),
          },
        });
        rolesCreated++;
      } catch (error) {
        console.error(`  ✗ Failed to create role ${roleConfig.name}:`, error);
      }
      await delay(throttleDelay);
    }
  }

  // Build role name -> id map from live roles (created + pre-existing + @everyone).
  const roleNameToId = new Map<string, string>();
  const liveRoles = await fetchRoles(guildId);
  for (const role of liveRoles) {
    roleNameToId.set(role.name.toLowerCase(), role.id);
  }
  roleNameToId.set('@everyone', guildId); // @everyone role id === guild id

  // Step 2: categories and their channels, sequentially.
  if (!options?.skipCategories && template.categories) {
    for (const categoryConfig of template.categories) {
      try {
        const category = (await rest.post(Routes.guildChannels(guildId), {
          body: {
            name: categoryConfig.name,
            type: 4,
            permission_overwrites: buildOverwrites(categoryConfig.permissionOverrides, roleNameToId),
          },
        })) as any;
        categoriesCreated++;
        await delay(throttleDelay);

        for (const channelConfig of categoryConfig.channels ?? []) {
          try {
            const body: any = {
              name: channelConfig.name,
              type: CHANNEL_TYPE[channelConfig.type] ?? 0,
              parent_id: category.id,
            };
            const channelOverwrites = buildOverwrites(channelConfig.permissionOverrides, roleNameToId);
            if (channelOverwrites.length) body.permission_overwrites = channelOverwrites;
            if (channelConfig.topic) body.topic = channelConfig.topic;
            if (channelConfig.nsfw !== undefined) body.nsfw = channelConfig.nsfw;
            if (channelConfig.slowmode !== undefined) body.rate_limit_per_user = channelConfig.slowmode;
            if (channelConfig.bitrate !== undefined) body.bitrate = channelConfig.bitrate;
            if (channelConfig.userLimit !== undefined) body.user_limit = channelConfig.userLimit;

            await rest.post(Routes.guildChannels(guildId), { body });
            channelsCreated++;
            await delay(throttleDelay);
          } catch (error) {
            console.error(`      ✗ Failed to create channel ${channelConfig.name}:`, error);
          }
        }
      } catch (error) {
        console.error(`  ✗ Failed to create category ${categoryConfig.name}:`, error);
      }
    }
  }

  return { rolesCreated, categoriesCreated, channelsCreated };
}

/**
 * Validate a guild (by id) for template application: name-conflict and
 * Discord-limit warnings. Returns valid=false only on hard limit breaches.
 */
export async function validateGuildForTemplate(
  guildId: string,
  template: ServerTemplate
): Promise<{ valid: boolean; warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const [channels, roles] = await Promise.all([fetchChannels(guildId), fetchRoles(guildId)]);

  const newChannelCount =
    (template.categories?.length ?? 0) +
    (template.categories?.reduce((n, c) => n + (c.channels?.length ?? 0), 0) ?? 0);
  if (channels.length + newChannelCount > 500) {
    errors.push(`Template would exceed Discord's 500-channel limit (have ${channels.length}, adding ${newChannelCount}).`);
  }
  if (roles.length + (template.roles?.length ?? 0) > 250) {
    errors.push(`Template would exceed Discord's 250-role limit (have ${roles.length}, adding ${template.roles?.length ?? 0}).`);
  }

  if (template.roles) {
    const existing = new Set(roles.map((r: any) => r.name.toLowerCase()));
    const conflicts = template.roles.filter((r) => existing.has(r.name.toLowerCase())).map((r) => r.name);
    if (conflicts.length) warnings.push(`These role names already exist and will be duplicated: ${conflicts.join(', ')}`);
  }
  if (template.categories) {
    const existingCats = new Set(
      channels.filter((c: any) => c.type === 4).map((c: any) => c.name.toLowerCase())
    );
    const conflicts = template.categories.filter((c) => existingCats.has(c.name.toLowerCase())).map((c) => c.name);
    if (conflicts.length) warnings.push(`These category names already exist: ${conflicts.join(', ')}`);
  }

  return { valid: errors.length === 0, warnings, errors };
}
