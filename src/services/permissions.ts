import { PermissionFlagsBits } from 'discord.js';
import { ValidationError } from '../utils/errors.js';

/**
 * Centralized Discord permission name <-> bitfield mapping.
 *
 * The Discord API and our tool inputs use SCREAMING_SNAKE_CASE names
 * (e.g. VIEW_CHANNEL); discord.js exposes PascalCase keys (e.g. ViewChannel).
 * This module is the single source of truth, including the Nov-2025 permission
 * split bits (PIN_MESSAGES, BYPASS_SLOWMODE, CREATE_GUILD_EXPRESSIONS,
 * CREATE_EVENTS) that older static maps miss.
 *
 * Unknown names are a hard error: silently dropping a permission from an
 * overwrite (e.g. a typo'd VIEW_CHANNEL deny) can leave a channel exposed
 * that the caller believed was locked down.
 */

function snakeToPascal(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// Canonical 1:1 overrides where simple snake->pascal does not match discord.js
// keys. These are also used for the reverse (bitfield -> name) mapping.
const ALIASES: Record<string, keyof typeof PermissionFlagsBits> = {
  PIN_MESSAGES: 'PinMessages',
  BYPASS_SLOWMODE: 'BypassSlowmode',
  CREATE_GUILD_EXPRESSIONS: 'CreateGuildExpressions',
  CREATE_EVENTS: 'CreateEvents',
  USE_VAD: 'UseVAD',
  USE_EXTERNAL_EMOJIS: 'UseExternalEmojis',
  USE_EXTERNAL_STICKERS: 'UseExternalStickers',
  SEND_TTS_MESSAGES: 'SendTTSMessages',
  MANAGE_GUILD_EXPRESSIONS: 'ManageGuildExpressions',
  USE_APPLICATION_COMMANDS: 'UseApplicationCommands',
  USE_EMBEDDED_ACTIVITIES: 'UseEmbeddedActivities',
  USE_EXTERNAL_SOUNDS: 'UseExternalSounds',
  USE_EXTERNAL_APPS: 'UseExternalApps',
  USE_SOUNDBOARD: 'UseSoundboard',
  SEND_VOICE_MESSAGES: 'SendVoiceMessages',
  REQUEST_TO_SPEAK: 'RequestToSpeak',
  VIEW_GUILD_INSIGHTS: 'ViewGuildInsights',
  VIEW_AUDIT_LOG: 'ViewAuditLog',
  VIEW_CREATOR_MONETIZATION_ANALYTICS: 'ViewCreatorMonetizationAnalytics',
};

// Forward-only synonyms: names Discord's UI (or older versions of this
// project) use for permissions whose API name differs. Never emitted by the
// reverse mapping.
const LEGACY_ALIASES: Record<string, keyof typeof PermissionFlagsBits> = {
  MANAGE_SERVER: 'ManageGuild',
  TIMEOUT_MEMBERS: 'ModerateMembers',
  VIDEO: 'Stream',
  VIEW_CHANNELS: 'ViewChannel',
  CREATE_INVITE: 'CreateInstantInvite',
  USE_VOICE_ACTIVITY: 'UseVAD',
  USE_EXTERNAL_EMOJI: 'UseExternalEmojis',
  USE_ACTIVITIES: 'UseEmbeddedActivities',
  MANAGE_EMOJIS_AND_STICKERS: 'ManageGuildExpressions',
};

// Deprecated discord.js keys that duplicate another key's bit; excluded from
// the reverse mapping so each bit round-trips to exactly one name.
const REVERSE_EXCLUDED = new Set(['ManageEmojisAndStickers']);

function resolveKey(name: string): keyof typeof PermissionFlagsBits | undefined {
  if (ALIASES[name]) return ALIASES[name];
  if (LEGACY_ALIASES[name]) return LEGACY_ALIASES[name];
  const pascal = snakeToPascal(name) as keyof typeof PermissionFlagsBits;
  return pascal in PermissionFlagsBits ? pascal : undefined;
}

/**
 * Convert an array of SCREAMING_SNAKE_CASE permission names to a bitfield
 * string. Throws ValidationError on names that do not map to a permission.
 */
export function permissionNamesToBitfield(names: string[]): string {
  let bf = 0n;
  for (const n of names) {
    const key = resolveKey(n);
    if (!key) {
      throw new ValidationError(
        `Unknown permission name: "${n}". Use SCREAMING_SNAKE_CASE Discord API names (e.g. VIEW_CHANNEL, MANAGE_MESSAGES).`
      );
    }
    bf |= PermissionFlagsBits[key];
  }
  return bf.toString();
}

// Reverse lookup: PascalCase key -> SCREAMING_SNAKE name (alias-aware).
const PASCAL_TO_SNAKE = new Map<string, string>();
for (const [snake, pascal] of Object.entries(ALIASES)) {
  PASCAL_TO_SNAKE.set(pascal as string, snake);
}

function pascalToSnake(pascalKey: string): string {
  const alias = PASCAL_TO_SNAKE.get(pascalKey);
  if (alias) return alias;
  return pascalKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/** Convert a bitfield (string or bigint) back to SCREAMING_SNAKE permission names. */
export function bitfieldToPermissionNames(bitfield: string | bigint): string[] {
  const bf = BigInt(bitfield);
  const out: string[] = [];
  for (const [pascalKey, bit] of Object.entries(PermissionFlagsBits) as [string, bigint][]) {
    if (REVERSE_EXCLUDED.has(pascalKey)) continue;
    if (bit !== 0n && (bf & bit) === bit) {
      out.push(pascalToSnake(pascalKey));
    }
  }
  return out;
}

/**
 * Every valid SCREAMING_SNAKE permission name, derived from the installed
 * discord.js so new bits are picked up automatically. Use this for input
 * schemas instead of hand-maintained lists.
 */
export const PERMISSION_NAMES: readonly string[] = Object.keys(PermissionFlagsBits)
  .filter((k) => !REVERSE_EXCLUDED.has(k))
  .map(pascalToSnake);
