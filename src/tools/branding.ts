/**
 * Branding Tool — REST-only. Sets server icon (guaranteed) and optionally
 * banner/splash (boost-gated; fails gracefully).
 */

import { z } from 'zod';
import { readFileSync } from 'fs';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { resolveGuildId } from '../services/guild.js';
import { bufferToDataUri } from '../services/features.js';
import { wrapDiscordError, ValidationError } from '../utils/errors.js';

async function loadImage(path?: string, url?: string): Promise<string> {
  if (path) {
    return bufferToDataUri(readFileSync(path), path);
  }
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new ValidationError(`Failed to fetch image: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (res.headers.get('content-type')?.split('/')[1] ?? 'png').split(';')[0];
    return bufferToDataUri(buf, `image.${ext}`);
  }
  throw new ValidationError('Provide a file path or url for the image');
}

export const setServerBrandingToolDefinition = {
  name: 'set_server_branding',
  description:
    "Sets the server icon (works on any server) and optionally banner/splash (these require server boost level; they fail gracefully if unavailable). Provide a local file path or an image URL for each.",
  inputSchema: {
    type: 'object',
    properties: {
      guildId: { type: 'string', description: 'Guild ID or name. If not provided, uses the currently selected guild.' },
      iconPath: { type: 'string', description: 'Local path to an icon image (png/jpg/gif/webp)' },
      iconUrl: { type: 'string', description: 'URL of an icon image' },
      bannerPath: { type: 'string', description: 'Local path to a banner image (boost-gated)' },
      bannerUrl: { type: 'string', description: 'URL of a banner image (boost-gated)' },
    },
  },
};
export const SetServerBrandingInputSchema = z.object({
  guildId: z.string().optional(),
  iconPath: z.string().optional(),
  iconUrl: z.string().optional(),
  bannerPath: z.string().optional(),
  bannerUrl: z.string().optional(),
});
export type SetServerBrandingInput = z.infer<typeof SetServerBrandingInputSchema>;

export async function setServerBrandingHandler(input: SetServerBrandingInput) {
  try {
    const guildId = await resolveGuildId(input.guildId);
    const result: Record<string, string> = {};

    if (input.iconPath || input.iconUrl) {
      const icon = await loadImage(input.iconPath, input.iconUrl);
      await getRest().patch(Routes.guild(guildId), { body: { icon } });
      result.icon = 'set';
    }

    if (input.bannerPath || input.bannerUrl) {
      try {
        const banner = await loadImage(input.bannerPath, input.bannerUrl);
        await getRest().patch(Routes.guild(guildId), { body: { banner } });
        result.banner = 'set';
      } catch (e: any) {
        result.banner = `skipped (${e?.rawError?.message || e?.message || 'boost level required'})`;
      }
    }

    if (Object.keys(result).length === 0) throw new ValidationError('Provide an icon or banner image');
    return { success: true as const, data: { guildId, ...result, message: 'Branding updated' } };
  } catch (error) {
    const e = wrapDiscordError(error, 'set_server_branding');
    return { success: false as const, error: JSON.stringify(e.toJSON()) };
  }
}
