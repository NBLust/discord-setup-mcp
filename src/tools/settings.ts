/**
 * Server Settings Tools — REST-only.
 * Configure guild verification, content filter, and default notifications.
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { wrapDiscordError } from '../utils/errors.js';

const VerificationLevelSchema = z.enum(['none', 'low', 'medium', 'high', 'very_high']);
const ExplicitContentFilterSchema = z.enum(['disabled', 'members_without_roles', 'all_members']);
const DefaultNotificationsSchema = z.enum(['all_messages', 'only_mentions']);

const VERIFICATION: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, very_high: 4 };
const CONTENT_FILTER: Record<string, number> = { disabled: 0, members_without_roles: 1, all_members: 2 };
const NOTIFICATIONS: Record<string, number> = { all_messages: 0, only_mentions: 1 };

async function patchGuild(guildId: string, body: Record<string, unknown>) {
  return (await getRest().patch(Routes.guild(guildId), { body })) as any;
}

// ============================================================================
// UPDATE SERVER SETTINGS
// ============================================================================

export const updateServerSettingsToolDefinition = {
  name: 'update_server_settings',
  description:
    'Updates multiple server settings at once. Can modify name, description, verification level, content filter, and default notifications.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      name: { type: 'string', description: 'New server name (2-100 characters)' },
      description: { type: 'string', description: 'New server description (max 120 characters)' },
      verificationLevel: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'very_high'], description: 'Verification level for new members' },
      explicitContentFilter: { type: 'string', enum: ['disabled', 'members_without_roles', 'all_members'], description: 'Explicit content filter setting' },
      defaultMessageNotifications: { type: 'string', enum: ['all_messages', 'only_mentions'], description: 'Default notification setting for new members' },
    },
  },
};

export const UpdateServerSettingsInputSchema = z.object({
  guildId: z.string().optional(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(120).optional(),
  verificationLevel: VerificationLevelSchema.optional(),
  explicitContentFilter: ExplicitContentFilterSchema.optional(),
  defaultMessageNotifications: DefaultNotificationsSchema.optional(),
});
export type UpdateServerSettingsInput = z.infer<typeof UpdateServerSettingsInputSchema>;

export async function updateServerSettingsHandler(
  input: UpdateServerSettingsInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.description !== undefined) body.description = input.description;
    if (input.verificationLevel !== undefined) body.verification_level = VERIFICATION[input.verificationLevel];
    if (input.explicitContentFilter !== undefined) body.explicit_content_filter = CONTENT_FILTER[input.explicitContentFilter];
    if (input.defaultMessageNotifications !== undefined) body.default_message_notifications = NOTIFICATIONS[input.defaultMessageNotifications];

    const guild = await patchGuild(guildId, body);
    return {
      success: true,
      data: {
        id: guild.id, name: guild.name, description: guild.description,
        message: `Server "${guild.name}" settings updated successfully`,
      },
    };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'update_server_settings');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// SET VERIFICATION LEVEL
// ============================================================================

export const setVerificationLevelToolDefinition = {
  name: 'set_verification_level',
  description: 'Sets the verification level required for new members to interact with the server.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      level: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'very_high'], description: 'Verification level' },
    },
    required: ['level'],
  },
};

export const SetVerificationLevelInputSchema = z.object({
  guildId: z.string().optional(),
  level: VerificationLevelSchema,
});
export type SetVerificationLevelInput = z.infer<typeof SetVerificationLevelInputSchema>;

export async function setVerificationLevelHandler(
  input: SetVerificationLevelInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    await patchGuild(guildId, { verification_level: VERIFICATION[input.level] });
    return { success: true, data: { level: input.level, message: `Verification level set to "${input.level}"` } };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'set_verification_level');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// SET CONTENT FILTER
// ============================================================================

export const setContentFilterToolDefinition = {
  name: 'set_content_filter',
  description: 'Sets the explicit content filter level for the server.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      level: { type: 'string', enum: ['disabled', 'members_without_roles', 'all_members'], description: 'Content filter level' },
    },
    required: ['level'],
  },
};

export const SetContentFilterInputSchema = z.object({
  guildId: z.string().optional(),
  level: ExplicitContentFilterSchema,
});
export type SetContentFilterInput = z.infer<typeof SetContentFilterInputSchema>;

export async function setContentFilterHandler(
  input: SetContentFilterInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    await patchGuild(guildId, { explicit_content_filter: CONTENT_FILTER[input.level] });
    return { success: true, data: { level: input.level, message: `Content filter set to "${input.level}"` } };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'set_content_filter');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// SET DEFAULT NOTIFICATIONS
// ============================================================================

export const setDefaultNotificationsToolDefinition = {
  name: 'set_default_notifications',
  description: 'Sets the default notification setting for new members joining the server.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      setting: { type: 'string', enum: ['all_messages', 'only_mentions'], description: 'Notification setting' },
    },
    required: ['setting'],
  },
};

export const SetDefaultNotificationsInputSchema = z.object({
  guildId: z.string().optional(),
  setting: DefaultNotificationsSchema,
});
export type SetDefaultNotificationsInput = z.infer<typeof SetDefaultNotificationsInputSchema>;

export async function setDefaultNotificationsHandler(
  input: SetDefaultNotificationsInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    await patchGuild(guildId, { default_message_notifications: NOTIFICATIONS[input.setting] });
    return { success: true, data: { setting: input.setting, message: `Default notifications set to "${input.setting}"` } };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'set_default_notifications');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}
