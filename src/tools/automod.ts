/**
 * AutoMod Tool — REST-only. Configure a moderation rule (no Community gate).
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { buildAutomodRuleBody, type AutomodInput } from '../services/features.js';
import { wrapDiscordError } from '../utils/errors.js';

export const configureAutomodToolDefinition = {
  name: 'configure_automod',
  description:
    'Creates an AutoMod rule (keyword / spam / mention-spam / keyword-preset) that blocks matching messages and optionally alerts a channel. No Community requirement.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      name: { type: 'string', description: 'Rule name' },
      trigger: { type: 'string', enum: ['keyword', 'spam', 'mention_spam', 'keyword_preset'], description: 'Trigger type' },
      keywords: { type: 'array', items: { type: 'string' }, description: 'Keyword filters (for keyword trigger)' },
      presets: { type: 'array', items: { type: 'string', enum: ['profanity', 'sexual_content', 'slurs'] }, description: 'Presets (for keyword_preset trigger)' },
      mentionLimit: { type: 'number', description: 'Max mentions allowed (for mention_spam trigger)' },
      block: { type: 'boolean', description: 'Block matching messages (default: true)' },
      customBlockMessage: { type: 'string', description: 'Custom message shown to a blocked user' },
      alertChannelId: { type: 'string', description: 'Channel to send moderation alerts to' },
      exemptRoles: { type: 'array', items: { type: 'string' }, description: 'Role IDs exempt from this rule' },
      exemptChannels: { type: 'array', items: { type: 'string' }, description: 'Channel IDs exempt from this rule' },
    },
    required: ['name', 'trigger'],
  },
};

export const ConfigureAutomodInputSchema = z.object({
  guildId: z.string().optional(),
  name: z.string().min(1),
  trigger: z.enum(['keyword', 'spam', 'mention_spam', 'keyword_preset']),
  keywords: z.array(z.string()).optional(),
  presets: z.array(z.enum(['profanity', 'sexual_content', 'slurs'])).optional(),
  mentionLimit: z.number().int().positive().optional(),
  block: z.boolean().optional(),
  customBlockMessage: z.string().optional(),
  alertChannelId: z.string().optional(),
  exemptRoles: z.array(z.string()).optional(),
  exemptChannels: z.array(z.string()).optional(),
});
export type ConfigureAutomodInput = z.infer<typeof ConfigureAutomodInputSchema>;

export async function configureAutomodHandler(input: ConfigureAutomodInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const body = buildAutomodRuleBody(input as AutomodInput);
    const rule = (await getRest().post(Routes.guildAutoModerationRules(guildId), { body })) as any;
    return { success: true as const, data: { id: rule.id, name: rule.name, message: 'AutoMod rule created' } };
  } catch (error) {
    const e = wrapDiscordError(error, 'configure_automod');
    return { success: false as const, error: JSON.stringify(e.toJSON()) };
  }
}
