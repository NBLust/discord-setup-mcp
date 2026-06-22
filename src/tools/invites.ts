/**
 * Invite Tool — REST-only.
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { wrapDiscordError } from '../utils/errors.js';

export const createInviteToolDefinition = {
  name: 'create_invite',
  description: 'Creates an invite link to a channel. Defaults to a permanent, unlimited-use invite.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name (for context; the invite is created on the channel).' },
      channelId: { type: 'string', description: 'Channel to create the invite for' },
      maxAge: { type: 'number', description: 'Seconds until expiry (0 = never, default 0)' },
      maxUses: { type: 'number', description: 'Max uses (0 = unlimited, default 0)' },
      temporary: { type: 'boolean', description: 'Grant temporary membership (default false)' },
      unique: { type: 'boolean', description: 'Always create a new invite (default true)' },
    },
    required: ['channelId'],
  },
};

export const CreateInviteInputSchema = z.object({
  guildId: z.string().optional(),
  channelId: z.string().min(1),
  maxAge: z.number().int().min(0).optional(),
  maxUses: z.number().int().min(0).optional(),
  temporary: z.boolean().optional(),
  unique: z.boolean().optional(),
});
export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;

export async function createInviteHandler(input: CreateInviteInput) {
  try {
    if (input.guildId) await resolveGuildId(input.guildId);
    const invite = (await getRest().post(Routes.channelInvites(input.channelId), {
      body: {
        max_age: input.maxAge ?? 0,
        max_uses: input.maxUses ?? 0,
        temporary: input.temporary ?? false,
        unique: input.unique ?? true,
      },
    })) as any;
    return { success: true as const, data: { code: invite.code, url: `https://discord.gg/${invite.code}`, message: 'Invite created' } };
  } catch (error) {
    const e = wrapDiscordError(error, 'create_invite');
    return { success: false as const, error: JSON.stringify(e.toJSON()) };
  }
}
