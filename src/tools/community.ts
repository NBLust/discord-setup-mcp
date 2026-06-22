/**
 * Community Tools — REST-only.
 * enable_community unlocks the Community feature stack; configure_onboarding
 * and set_welcome_screen require it (clear CommunityRequiredError otherwise).
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { wrapDiscordError, CommunityRequiredError } from '../utils/errors.js';

async function getGuild(guildId: string): Promise<any> {
  return getRest().get(Routes.guild(guildId));
}
function isCommunity(guild: any): boolean {
  return (guild.features ?? []).includes('COMMUNITY');
}

// ============================================================================
// ENABLE COMMUNITY
// ============================================================================

export const enableCommunityToolDefinition = {
  name: 'enable_community',
  description:
    'Enables the Community feature (requires the bot to have ADMINISTRATOR). Creates a rules channel and a moderator-updates channel if not provided, and sets the required verification/content-filter levels in one call. Unlocks onboarding, welcome screen, announcement and stage channels.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      rulesChannelId: { type: 'string', description: 'Existing rules channel ID (auto-created if omitted)' },
      publicUpdatesChannelId: { type: 'string', description: 'Existing moderator-updates channel ID (auto-created if omitted)' },
    },
  },
};
export const EnableCommunityInputSchema = z.object({
  guildId: z.string().optional(),
  rulesChannelId: z.string().optional(),
  publicUpdatesChannelId: z.string().optional(),
});
export type EnableCommunityInput = z.infer<typeof EnableCommunityInputSchema>;

export async function enableCommunityHandler(input: EnableCommunityInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const rest = getRest();
    const guild = await getGuild(guildId);

    let rulesId = input.rulesChannelId;
    let updatesId = input.publicUpdatesChannelId;
    if (!rulesId) {
      const c = (await rest.post(Routes.guildChannels(guildId), { body: { name: 'rules', type: 0 } })) as any;
      rulesId = c.id;
    }
    if (!updatesId) {
      const c = (await rest.post(Routes.guildChannels(guildId), { body: { name: 'moderator-only', type: 0 } })) as any;
      updatesId = c.id;
    }

    const features = Array.from(new Set([...(guild.features ?? []), 'COMMUNITY']));
    const body = {
      features,
      rules_channel_id: rulesId,
      public_updates_channel_id: updatesId,
      verification_level: Math.max(guild.verification_level ?? 0, 1),
      explicit_content_filter: Math.max(guild.explicit_content_filter ?? 0, 2),
    };
    const updated = (await rest.patch(Routes.guild(guildId), { body })) as any;
    return {
      success: true as const,
      data: {
        guildId,
        community: (updated.features ?? []).includes('COMMUNITY'),
        rulesChannelId: rulesId,
        publicUpdatesChannelId: updatesId,
        message: 'Community enabled',
      },
    };
  } catch (error) {
    const e = wrapDiscordError(error, 'enable_community');
    return { success: false as const, error: JSON.stringify(e.toJSON()) };
  }
}

// ============================================================================
// CONFIGURE ONBOARDING
// ============================================================================

export const configureOnboardingToolDefinition = {
  name: 'configure_onboarding',
  description:
    'Configures member onboarding (requires Community). Set the default channels new members see, enable/disable onboarding, and optionally pass prompt definitions.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      enabled: { type: 'boolean', description: 'Enable onboarding' },
      defaultChannelIds: { type: 'array', items: { type: 'string' }, description: 'Channels shown to new members' },
      mode: { type: 'number', description: 'Onboarding mode: 0 = default, 1 = advanced' },
      prompts: { type: 'array', items: { type: 'object' }, description: 'Raw onboarding prompt objects (advanced)' },
    },
  },
};
export const ConfigureOnboardingInputSchema = z.object({
  guildId: z.string().optional(),
  enabled: z.boolean().optional(),
  defaultChannelIds: z.array(z.string()).optional(),
  mode: z.number().int().optional(),
  prompts: z.array(z.any()).optional(),
});
export type ConfigureOnboardingInput = z.infer<typeof ConfigureOnboardingInputSchema>;

export async function configureOnboardingHandler(input: ConfigureOnboardingInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const guild = await getGuild(guildId);
    if (!isCommunity(guild)) throw new CommunityRequiredError('configure_onboarding');
    const body = {
      enabled: input.enabled ?? true,
      default_channel_ids: input.defaultChannelIds ?? [],
      mode: input.mode ?? 0,
      prompts: input.prompts ?? [],
    };
    await getRest().put(Routes.guildOnboarding(guildId), { body });
    return { success: true as const, data: { guildId, message: 'Onboarding configured' } };
  } catch (error) {
    const e = wrapDiscordError(error, 'configure_onboarding');
    return { success: false as const, error: JSON.stringify(e.toJSON()) };
  }
}

// ============================================================================
// SET WELCOME SCREEN
// ============================================================================

export const setWelcomeScreenToolDefinition = {
  name: 'set_welcome_screen',
  description:
    'Sets the server welcome screen (requires Community): a description and up to 5 highlighted channels shown to new members.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      enabled: { type: 'boolean', description: 'Enable the welcome screen' },
      description: { type: 'string', description: 'Welcome screen description' },
      welcomeChannels: {
        type: 'array',
        description: 'Up to 5 highlighted channels',
        items: { type: 'object', properties: { channelId: { type: 'string' }, description: { type: 'string' }, emoji: { type: 'string' } }, required: ['channelId', 'description'] },
      },
    },
  },
};
export const SetWelcomeScreenInputSchema = z.object({
  guildId: z.string().optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
  welcomeChannels: z.array(z.object({ channelId: z.string(), description: z.string(), emoji: z.string().optional() })).optional(),
});
export type SetWelcomeScreenInput = z.infer<typeof SetWelcomeScreenInputSchema>;

export async function setWelcomeScreenHandler(input: SetWelcomeScreenInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const guild = await getGuild(guildId);
    if (!isCommunity(guild)) throw new CommunityRequiredError('set_welcome_screen');
    const body: any = {};
    if (input.enabled !== undefined) body.enabled = input.enabled;
    if (input.description !== undefined) body.description = input.description;
    if (input.welcomeChannels) {
      body.welcome_channels = input.welcomeChannels.map((w) => ({
        channel_id: w.channelId,
        description: w.description,
        emoji_name: w.emoji,
      }));
    }
    await getRest().patch(Routes.guildWelcomeScreen(guildId), { body });
    return { success: true as const, data: { guildId, message: 'Welcome screen updated' } };
  } catch (error) {
    const e = wrapDiscordError(error, 'set_welcome_screen');
    return { success: false as const, error: JSON.stringify(e.toJSON()) };
  }
}
