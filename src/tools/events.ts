/**
 * Scheduled Events Tool — REST-only.
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { buildScheduledEventBody, type ScheduledEventInput } from '../services/features.js';
import { wrapDiscordError } from '../utils/errors.js';

export const createScheduledEventToolDefinition = {
  name: 'create_scheduled_event',
  description:
    'Creates a scheduled event (voice, stage, or external/location-based). External events require location and endTime; voice/stage require a channelId.',
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      name: { type: 'string', description: 'Event name' },
      description: { type: 'string', description: 'Event description' },
      entityType: { type: 'string', enum: ['voice', 'stage', 'external'], description: 'Where the event happens' },
      startTime: { type: 'string', description: 'ISO 8601 start time' },
      endTime: { type: 'string', description: 'ISO 8601 end time (required for external)' },
      channelId: { type: 'string', description: 'Voice/stage channel ID (required for voice/stage)' },
      location: { type: 'string', description: 'Location text (required for external)' },
    },
    required: ['name', 'entityType', 'startTime'],
  },
};

export const CreateScheduledEventInputSchema = z.object({
  guildId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  entityType: z.enum(['voice', 'stage', 'external']),
  startTime: z.string().min(1),
  endTime: z.string().optional(),
  channelId: z.string().optional(),
  location: z.string().optional(),
});
export type CreateScheduledEventInput = z.infer<typeof CreateScheduledEventInputSchema>;

export async function createScheduledEventHandler(input: CreateScheduledEventInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const body = buildScheduledEventBody(input as ScheduledEventInput);
    const event = (await getRest().post(Routes.guildScheduledEvents(guildId), { body })) as any;
    return { success: true as const, data: { id: event.id, name: event.name, message: 'Scheduled event created' } };
  } catch (error) {
    const e = wrapDiscordError(error, 'create_scheduled_event');
    return { success: false as const, error: JSON.stringify(e.toJSON()) };
  }
}
