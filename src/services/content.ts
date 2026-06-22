/**
 * Content layer — pure builders (validated against Discord limits) and the
 * shapes used by the content tools. REST sends live in tools/content.ts.
 */

import { ValidationError } from '../utils/errors.js';

export interface EmbedFieldInput {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedInput {
  title?: string;
  description?: string;
  url?: string;
  color?: string | number;
  fields?: EmbedFieldInput[];
  author?: { name: string; url?: string; iconUrl?: string };
  footer?: { text: string; iconUrl?: string };
  image?: string;
  thumbnail?: string;
  timestamp?: boolean | string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: EmbedFieldInput[];
  author?: { name: string; url?: string; icon_url?: string };
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  timestamp?: string;
}

function colorToInt(color: string | number | undefined): number | undefined {
  if (color === undefined) return undefined;
  return typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
}

/** Build and validate a Discord embed object from friendly input. */
export function buildEmbed(input: EmbedInput): DiscordEmbed {
  const embed: DiscordEmbed = {};
  if (input.title !== undefined) {
    if (input.title.length > 256) throw new ValidationError('Embed title exceeds 256 characters');
    embed.title = input.title;
  }
  if (input.description !== undefined) {
    if (input.description.length > 4096) throw new ValidationError('Embed description exceeds 4096 characters');
    embed.description = input.description;
  }
  if (input.url !== undefined) embed.url = input.url;
  const color = colorToInt(input.color);
  if (color !== undefined) embed.color = color;
  if (input.fields) {
    if (input.fields.length > 25) throw new ValidationError('Embed cannot have more than 25 fields');
    for (const f of input.fields) {
      if (f.name.length > 256) throw new ValidationError('Embed field name exceeds 256 characters');
      if (f.value.length > 1024) throw new ValidationError('Embed field value exceeds 1024 characters');
    }
    embed.fields = input.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline }));
  }
  if (input.author) {
    if (input.author.name.length > 256) throw new ValidationError('Embed author name exceeds 256 characters');
    embed.author = { name: input.author.name, url: input.author.url, icon_url: input.author.iconUrl };
  }
  if (input.footer) {
    if (input.footer.text.length > 2048) throw new ValidationError('Embed footer text exceeds 2048 characters');
    embed.footer = { text: input.footer.text, icon_url: input.footer.iconUrl };
  }
  if (input.image) embed.image = { url: input.image };
  if (input.thumbnail) embed.thumbnail = { url: input.thumbnail };
  if (input.timestamp) {
    embed.timestamp = typeof input.timestamp === 'string' ? input.timestamp : new Date().toISOString();
  }

  const total =
    (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    (embed.fields?.reduce((n, f) => n + f.name.length + f.value.length, 0) ?? 0) +
    (embed.footer?.text.length ?? 0) +
    (embed.author?.name.length ?? 0);
  if (total > 6000) throw new ValidationError('Embed total content exceeds 6000 characters');

  return embed;
}

export interface LinkButtonInput {
  label: string;
  url: string;
  emoji?: string;
}

export interface ActionRow {
  type: 1;
  components: Array<{ type: 2; style: 5; label: string; url: string; emoji?: { name: string } }>;
}

/** Build link-button (style 5) action rows. Interactive buttons are unsupported. */
export function buildLinkButtons(buttons: LinkButtonInput[]): ActionRow[] {
  if (buttons.length === 0) throw new ValidationError('At least one button is required');
  if (buttons.length > 25) throw new ValidationError('A message can have at most 25 buttons (5 rows of 5)');
  for (const b of buttons) {
    if (!/^https?:\/\//i.test(b.url)) throw new ValidationError(`Button url must be http(s): ${b.url}`);
    if (b.label.length > 80) throw new ValidationError('Button label exceeds 80 characters');
  }
  const rows: ActionRow[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push({
      type: 1,
      components: buttons.slice(i, i + 5).map((b) => ({
        type: 2 as const,
        style: 5 as const,
        label: b.label,
        url: b.url,
        ...(b.emoji ? { emoji: { name: b.emoji } } : {}),
      })),
    });
  }
  return rows;
}
