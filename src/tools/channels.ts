/**
 * Channel Management Tools — REST-only.
 * Create/edit/delete channels and categories with permission overwrites.
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { permissionNamesToBitfield } from '../services/permissions.js';
import { wrapDiscordError } from '../utils/errors.js';

const ChannelTypeSchema = z.enum(['text', 'voice', 'announcement', 'stage', 'forum', 'media']);

const CHANNEL_TYPE: Record<string, number> = {
  text: 0, voice: 2, announcement: 5, stage: 13, forum: 15, media: 16,
};

const PermissionOverwriteSchema = z.object({
  id: z.string().describe('Role ID or user ID'),
  type: z.enum(['role', 'member']).describe('Whether this is a role or user override'),
  allow: z.array(z.string()).optional().describe('Permissions to allow'),
  deny: z.array(z.string()).optional().describe('Permissions to deny'),
});

function buildOverwrites(
  overwrites: Array<{ id: string; type: 'role' | 'member'; allow?: string[]; deny?: string[] }> | undefined
) {
  if (!overwrites) return undefined;
  return overwrites.map((o) => ({
    id: o.id,
    type: o.type === 'role' ? 0 : 1,
    allow: permissionNamesToBitfield(o.allow ?? []),
    deny: permissionNamesToBitfield(o.deny ?? []),
  }));
}

const OVERWRITE_JSON_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Role ID or user ID' },
      type: { type: 'string', enum: ['role', 'member'], description: 'Whether this is a role or user override' },
      allow: { type: 'array', items: { type: 'string' }, description: 'Permissions to allow' },
      deny: { type: 'array', items: { type: 'string' }, description: 'Permissions to deny' },
    },
    required: ['id', 'type'],
  },
  description: 'Permission overwrites for roles/users.',
};

// ============================================================================
// CREATE CATEGORY
// ============================================================================

export const createCategoryToolDefinition = {
  name: 'create_category',
  description: 'Creates a new category in a Discord server. Categories organize channels into groups.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      name: { type: 'string', description: 'Name of the category (1-100 characters)' },
      position: { type: 'number', description: 'Position of the category in the channel list (optional)' },
      permissionOverwrites: OVERWRITE_JSON_SCHEMA,
    },
    required: ['name'],
  },
};

export const CreateCategoryInputSchema = z.object({
  guildId: z.string().optional(),
  name: z.string().min(1).max(100),
  position: z.number().int().min(0).optional(),
  permissionOverwrites: z.array(PermissionOverwriteSchema).optional(),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export async function createCategoryHandler(
  input: CreateCategoryInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const body: any = {
      name: input.name,
      type: 4,
      position: input.position,
      permission_overwrites: buildOverwrites(input.permissionOverwrites),
    };
    const category = (await getRest().post(Routes.guildChannels(guildId), { body })) as any;
    return {
      success: true,
      data: { id: category.id, name: category.name, type: 'category', position: category.position, message: `Category "${category.name}" created successfully` },
    };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'create_category');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// CREATE CHANNEL
// ============================================================================

export const createChannelToolDefinition = {
  name: 'create_channel',
  description: 'Creates a new channel in a Discord server. Supports text, voice, announcement, stage, forum, and media channels.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      name: { type: 'string', description: 'Name of the channel (1-100 characters)' },
      type: { type: 'string', enum: ['text', 'voice', 'announcement', 'stage', 'forum', 'media'], description: 'Type of channel to create (default: text)' },
      categoryId: { type: 'string', description: 'ID of the category to place this channel in (optional)' },
      topic: { type: 'string', description: 'Channel topic (text/forum channels, max 1024 characters)' },
      nsfw: { type: 'boolean', description: 'Whether the channel is age-restricted (default: false)' },
      slowmode: { type: 'number', description: 'Slowmode in seconds (text channels, 0-21600)' },
      bitrate: { type: 'number', description: 'Bitrate for voice channels (8000-384000)' },
      userLimit: { type: 'number', description: 'User limit for voice channels (0-99, 0 = unlimited)' },
      position: { type: 'number', description: 'Position in the channel list' },
      permissionOverwrites: OVERWRITE_JSON_SCHEMA,
    },
    required: ['name'],
  },
};

export const CreateChannelInputSchema = z.object({
  guildId: z.string().optional(),
  name: z.string().min(1).max(100),
  type: ChannelTypeSchema.default('text'),
  categoryId: z.string().optional(),
  topic: z.string().max(1024).optional(),
  nsfw: z.boolean().default(false),
  slowmode: z.number().int().min(0).max(21600).optional(),
  bitrate: z.number().int().min(8000).max(384000).optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
  position: z.number().int().min(0).optional(),
  permissionOverwrites: z.array(PermissionOverwriteSchema).optional(),
});
export type CreateChannelInput = z.infer<typeof CreateChannelInputSchema>;

export async function createChannelHandler(
  input: CreateChannelInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const body: any = {
      name: input.name,
      type: CHANNEL_TYPE[input.type],
      parent_id: input.categoryId,
      topic: input.topic,
      nsfw: input.nsfw,
      rate_limit_per_user: input.slowmode,
      bitrate: input.bitrate,
      user_limit: input.userLimit,
      position: input.position,
      permission_overwrites: buildOverwrites(input.permissionOverwrites),
    };
    const channel = (await getRest().post(Routes.guildChannels(guildId), { body })) as any;
    return {
      success: true,
      data: { id: channel.id, name: channel.name, type: input.type, categoryId: channel.parent_id, position: channel.position, message: `Channel "${channel.name}" created successfully` },
    };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'create_channel');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// EDIT CHANNEL
// ============================================================================

export const editChannelToolDefinition = {
  name: 'edit_channel',
  description: "Edits an existing channel in a Discord server. Can modify name, topic, permissions, and other settings.",
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      channelId: { type: 'string', description: 'ID of the channel to edit' },
      name: { type: 'string', description: 'New name for the channel' },
      topic: { type: 'string', description: 'New topic (text channels only)' },
      nsfw: { type: 'boolean', description: 'Whether the channel is age-restricted' },
      slowmode: { type: 'number', description: 'Slowmode in seconds (text channels, 0-21600)' },
      bitrate: { type: 'number', description: 'Bitrate for voice channels (8000-384000)' },
      userLimit: { type: 'number', description: 'User limit for voice channels (0-99)' },
      position: { type: 'number', description: 'Position in the channel list' },
      categoryId: { type: 'string', description: 'ID of the category to move this channel to (null to remove from category)' },
      permissionOverwrites: OVERWRITE_JSON_SCHEMA,
    },
    required: ['channelId'],
  },
};

export const EditChannelInputSchema = z.object({
  guildId: z.string().optional(),
  channelId: z.string().min(1, 'Channel ID is required'),
  name: z.string().min(1).max(100).optional(),
  topic: z.string().max(1024).optional(),
  nsfw: z.boolean().optional(),
  slowmode: z.number().int().min(0).max(21600).optional(),
  bitrate: z.number().int().min(8000).max(384000).optional(),
  userLimit: z.number().int().min(0).max(99).optional(),
  position: z.number().int().min(0).optional(),
  categoryId: z.string().nullable().optional(),
  permissionOverwrites: z.array(PermissionOverwriteSchema).optional(),
});
export type EditChannelInput = z.infer<typeof EditChannelInputSchema>;

export async function editChannelHandler(
  input: EditChannelInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    await resolveGuildId(input.guildId); // validate context
    const body: any = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.topic !== undefined) body.topic = input.topic;
    if (input.nsfw !== undefined) body.nsfw = input.nsfw;
    if (input.slowmode !== undefined) body.rate_limit_per_user = input.slowmode;
    if (input.bitrate !== undefined) body.bitrate = input.bitrate;
    if (input.userLimit !== undefined) body.user_limit = input.userLimit;
    if (input.position !== undefined) body.position = input.position;
    if (input.categoryId !== undefined) body.parent_id = input.categoryId;
    if (input.permissionOverwrites !== undefined) body.permission_overwrites = buildOverwrites(input.permissionOverwrites);

    const channel = (await getRest().patch(Routes.channel(input.channelId), { body })) as any;
    return {
      success: true,
      data: { id: channel.id, name: channel.name, type: channel.type, message: `Channel "${channel.name}" updated successfully` },
    };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'edit_channel');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// DELETE CHANNEL
// ============================================================================

export const deleteChannelToolDefinition = {
  name: 'delete_channel',
  description: 'Deletes a channel from a Discord server. This action cannot be undone.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      channelId: { type: 'string', description: 'ID of the channel to delete' },
    },
    required: ['channelId'],
  },
};

export const DeleteChannelInputSchema = z.object({
  guildId: z.string().optional(),
  channelId: z.string().min(1, 'Channel ID is required'),
});
export type DeleteChannelInput = z.infer<typeof DeleteChannelInputSchema>;

export async function deleteChannelHandler(
  input: DeleteChannelInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    await resolveGuildId(input.guildId);
    await getRest().delete(Routes.channel(input.channelId));
    return { success: true, data: { message: `Channel ${input.channelId} deleted successfully` } };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'delete_channel');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}
