/**
 * Role Management Tools — REST-only.
 * Create, edit, delete, and reorder roles via the bucket-aware REST queue.
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { permissionNamesToBitfield } from '../services/permissions.js';
import { wrapDiscordError } from '../utils/errors.js';

const PermissionSchema = z.enum([
  'CREATE_INSTANT_INVITE', 'KICK_MEMBERS', 'BAN_MEMBERS', 'ADMINISTRATOR',
  'MANAGE_CHANNELS', 'MANAGE_GUILD', 'ADD_REACTIONS', 'VIEW_AUDIT_LOG',
  'PRIORITY_SPEAKER', 'STREAM', 'VIEW_CHANNEL', 'SEND_MESSAGES',
  'SEND_TTS_MESSAGES', 'MANAGE_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES',
  'READ_MESSAGE_HISTORY', 'MENTION_EVERYONE', 'USE_EXTERNAL_EMOJIS',
  'VIEW_GUILD_INSIGHTS', 'CONNECT', 'SPEAK', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS',
  'MOVE_MEMBERS', 'USE_VAD', 'CHANGE_NICKNAME', 'MANAGE_NICKNAMES',
  'MANAGE_ROLES', 'MANAGE_WEBHOOKS', 'MANAGE_GUILD_EXPRESSIONS',
  'USE_APPLICATION_COMMANDS', 'REQUEST_TO_SPEAK', 'MANAGE_EVENTS',
  'MANAGE_THREADS', 'CREATE_PUBLIC_THREADS', 'CREATE_PRIVATE_THREADS',
  'USE_EXTERNAL_STICKERS', 'SEND_MESSAGES_IN_THREADS', 'USE_EMBEDDED_ACTIVITIES',
  'MODERATE_MEMBERS', 'VIEW_CREATOR_MONETIZATION_ANALYTICS', 'USE_SOUNDBOARD',
  'USE_EXTERNAL_SOUNDS', 'SEND_VOICE_MESSAGES',
  // Nov-2025 split additions:
  'PIN_MESSAGES', 'BYPASS_SLOWMODE', 'CREATE_GUILD_EXPRESSIONS', 'CREATE_EVENTS',
]);

const ColorSchema = z.union([
  z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex code like #FF0000'),
  z.number().int().min(0).max(16777215),
]);

function colorToInt(color: string | number | undefined): number | undefined {
  if (color === undefined) return undefined;
  return typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
}

// ============================================================================
// CREATE ROLE
// ============================================================================

export const createRoleToolDefinition = {
  name: 'create_role',
  description:
    'Creates a new role in a Discord server with specified name, color, permissions, and settings.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      name: { type: 'string', description: 'Name of the role (1-100 characters)' },
      color: { type: ['string', 'number'], description: 'Role color as hex string (#FF0000) or integer (0-16777215)' },
      hoist: { type: 'boolean', description: 'Whether to display role members separately in the sidebar' },
      mentionable: { type: 'boolean', description: 'Whether this role can be mentioned by anyone' },
      permissions: { type: 'array', items: { type: 'string' }, description: 'Array of permission names to grant to this role' },
      position: { type: 'number', description: 'Position in the role hierarchy (higher = more powerful)' },
    },
    required: ['name'],
  },
};

export const CreateRoleInputSchema = z.object({
  guildId: z.string().optional(),
  name: z.string().min(1).max(100),
  color: ColorSchema.optional(),
  hoist: z.boolean().default(false),
  mentionable: z.boolean().default(false),
  permissions: z.array(PermissionSchema).optional(),
  position: z.number().int().min(0).optional(),
});
export type CreateRoleInput = z.infer<typeof CreateRoleInputSchema>;

export async function createRoleHandler(
  input: CreateRoleInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const body: any = {
      name: input.name,
      hoist: input.hoist,
      mentionable: input.mentionable,
    };
    const colorInt = colorToInt(input.color);
    if (colorInt !== undefined) body.color = colorInt;
    if (input.permissions) body.permissions = permissionNamesToBitfield(input.permissions);

    const role = (await getRest().post(Routes.guildRoles(guildId), { body })) as any;

    // Position is set via the bulk-positions endpoint after creation.
    if (input.position !== undefined) {
      try {
        await getRest().patch(Routes.guildRoles(guildId), {
          body: [{ id: role.id, position: input.position }],
        });
      } catch {
        /* hierarchy may forbid the requested position; role still created */
      }
    }

    return {
      success: true,
      data: {
        id: role.id, name: role.name, color: role.color,
        position: role.position, hoist: role.hoist, mentionable: role.mentionable,
        message: `Role "${role.name}" created successfully`,
      },
    };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'create_role');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// EDIT ROLE
// ============================================================================

export const editRoleToolDefinition = {
  name: 'edit_role',
  description:
    'Edits an existing role in a Discord server. Can modify name, color, permissions, and other settings.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      roleId: { type: 'string', description: 'ID of the role to edit' },
      name: { type: 'string', description: 'New name for the role' },
      color: { type: ['string', 'number'], description: 'New color as hex string or integer' },
      hoist: { type: 'boolean', description: 'Whether to display role members separately' },
      mentionable: { type: 'boolean', description: 'Whether this role can be mentioned' },
      permissions: { type: 'array', items: { type: 'string' }, description: 'Array of permission names (replaces existing permissions)' },
      position: { type: 'number', description: 'New position in the role hierarchy' },
    },
    required: ['roleId'],
  },
};

export const EditRoleInputSchema = z.object({
  guildId: z.string().optional(),
  roleId: z.string().min(1, 'Role ID is required'),
  name: z.string().min(1).max(100).optional(),
  color: ColorSchema.optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  permissions: z.array(PermissionSchema).optional(),
  position: z.number().int().min(0).optional(),
});
export type EditRoleInput = z.infer<typeof EditRoleInputSchema>;

export async function editRoleHandler(
  input: EditRoleInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const body: any = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.hoist !== undefined) body.hoist = input.hoist;
    if (input.mentionable !== undefined) body.mentionable = input.mentionable;
    const colorInt = colorToInt(input.color);
    if (colorInt !== undefined) body.color = colorInt;
    if (input.permissions !== undefined) body.permissions = permissionNamesToBitfield(input.permissions);

    const role = (await getRest().patch(Routes.guildRole(guildId, input.roleId), { body })) as any;

    if (input.position !== undefined) {
      await getRest().patch(Routes.guildRoles(guildId), {
        body: [{ id: input.roleId, position: input.position }],
      });
    }

    return {
      success: true,
      data: {
        id: role.id, name: role.name, color: role.color,
        position: role.position, permissions: role.permissions,
        message: `Role "${role.name}" updated successfully`,
      },
    };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'edit_role');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// DELETE ROLE
// ============================================================================

export const deleteRoleToolDefinition = {
  name: 'delete_role',
  description: 'Deletes a role from a Discord server. This action cannot be undone.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      roleId: { type: 'string', description: 'ID of the role to delete' },
    },
    required: ['roleId'],
  },
};

export const DeleteRoleInputSchema = z.object({
  guildId: z.string().optional(),
  roleId: z.string().min(1, 'Role ID is required'),
});
export type DeleteRoleInput = z.infer<typeof DeleteRoleInputSchema>;

export async function deleteRoleHandler(
  input: DeleteRoleInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    await getRest().delete(Routes.guildRole(guildId, input.roleId));
    return { success: true, data: { message: `Role ${input.roleId} deleted successfully` } };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'delete_role');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}

// ============================================================================
// REORDER ROLES
// ============================================================================

export const reorderRolesToolDefinition = {
  name: 'reorder_roles',
  description:
    'Reorders roles in the role hierarchy. Provide an array of role IDs in desired order (highest to lowest).',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      rolePositions: {
        type: 'array',
        items: {
          type: 'object',
          properties: { roleId: { type: 'string' }, position: { type: 'number' } },
          required: ['roleId', 'position'],
        },
        description: 'Array of objects with roleId and position (higher = more powerful)',
      },
    },
    required: ['rolePositions'],
  },
};

export const ReorderRolesInputSchema = z.object({
  guildId: z.string().optional(),
  rolePositions: z.array(z.object({ roleId: z.string(), position: z.number().int().min(0) })),
});
export type ReorderRolesInput = z.infer<typeof ReorderRolesInputSchema>;

export async function reorderRolesHandler(
  input: ReorderRolesInput
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const guildId = await resolveGuildId(input.guildId);
    await getRest().patch(Routes.guildRoles(guildId), {
      body: input.rolePositions.map((rp) => ({ id: rp.roleId, position: rp.position })),
    });
    return {
      success: true,
      data: { message: `Reordered ${input.rolePositions.length} roles successfully` },
    };
  } catch (error) {
    const mcpError = wrapDiscordError(error, 'reorder_roles');
    return { success: false, error: JSON.stringify(mcpError.toJSON()) };
  }
}
