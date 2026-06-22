/**
 * Blueprint Tools — REST-only.
 * apply_blueprint / plan_blueprint (dry-run) / export_server.
 */

import { z } from 'zod';
import { resolveGuildId } from '../services/guild.js';
import { loadBlueprint, planBlueprint, applyBlueprint, exportServer } from '../services/blueprint.js';
import { wrapDiscordError } from '../utils/errors.js';

function fail(error: unknown, ctx: string) {
  const e = wrapDiscordError(error, ctx);
  return { success: false as const, error: JSON.stringify(e.toJSON()) };
}

const BLUEPRINT_JSON_SCHEMA = {
  type: 'object',
  description:
    'Server blueprint. Shape: { guild?: {name, description, verificationLevel, contentFilter, defaultNotifications}, roles?: [{name, color, hoist, mentionable, permissions[], position}], categories?: [{name, overwrites[], channels: [{name, type(text|voice|announcement|stage|forum|media), topic, nsfw, slowmode, overwrites[], messages: [{content, embed, pin}]}]}] }. Overwrites use role NAMES (or "@everyone").',
};

// ============================================================================
// APPLY BLUEPRINT
// ============================================================================

export const applyBlueprintToolDefinition = {
  name: 'apply_blueprint',
  description:
    'Applies a custom server blueprint (inline object or a YAML/JSON file path) idempotently: creates/updates roles, categories, channels, overwrites, settings, and seeds per-channel messages on first creation. Re-applying is safe (no duplicates). Run plan_blueprint first to preview.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      blueprint: BLUEPRINT_JSON_SCHEMA,
      file: { type: 'string', description: 'Path to a YAML/JSON blueprint file (alternative to inline blueprint)' },
      seedMessages: { type: 'boolean', description: 'Seed per-channel messages on channel creation (default: true)' },
    },
  },
};
export const ApplyBlueprintInputSchema = z.object({
  guildId: z.string().optional(),
  blueprint: z.any().optional(),
  file: z.string().optional(),
  seedMessages: z.boolean().optional(),
});
export type ApplyBlueprintInput = z.infer<typeof ApplyBlueprintInputSchema>;

export async function applyBlueprintHandler(input: ApplyBlueprintInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const bp = loadBlueprint({ blueprint: input.blueprint, file: input.file });
    const report = await applyBlueprint(guildId, bp, { seedMessages: input.seedMessages });
    return { success: true as const, data: { guildId, report, message: 'Blueprint applied' } };
  } catch (error) {
    return fail(error, 'apply_blueprint');
  }
}

// ============================================================================
// PLAN BLUEPRINT (dry-run)
// ============================================================================

export const planBlueprintToolDefinition = {
  name: 'plan_blueprint',
  description:
    'Dry-run for a blueprint: returns what apply_blueprint WOULD create/update/skip plus warnings (Community-gated channels, Discord limits) WITHOUT mutating the server.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      blueprint: BLUEPRINT_JSON_SCHEMA,
      file: { type: 'string', description: 'Path to a YAML/JSON blueprint file' },
    },
  },
};
export const PlanBlueprintInputSchema = z.object({
  guildId: z.string().optional(),
  blueprint: z.any().optional(),
  file: z.string().optional(),
});
export type PlanBlueprintInput = z.infer<typeof PlanBlueprintInputSchema>;

export async function planBlueprintHandler(input: PlanBlueprintInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const bp = loadBlueprint({ blueprint: input.blueprint, file: input.file });
    const plan = await planBlueprint(guildId, bp);
    return { success: true as const, data: { guildId, plan } };
  } catch (error) {
    return fail(error, 'plan_blueprint');
  }
}

// ============================================================================
// EXPORT SERVER
// ============================================================================

export const exportServerToolDefinition = {
  name: 'export_server',
  description:
    'Reads an existing server and returns a blueprint object (roles, categories, channels, overwrites, settings) that can be saved to a file and re-applied elsewhere. Content/webhooks/emojis/automod are not exported.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
    },
  },
};
export const ExportServerInputSchema = z.object({
  guildId: z.string().optional(),
});
export type ExportServerInput = z.infer<typeof ExportServerInputSchema>;

export async function exportServerHandler(input: ExportServerInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const blueprint = await exportServer(guildId);
    return { success: true as const, data: { guildId, blueprint } };
  } catch (error) {
    return fail(error, 'export_server');
  }
}
