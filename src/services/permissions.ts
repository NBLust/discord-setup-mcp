import { PermissionFlagsBits } from 'discord.js';

/**
 * Centralized Discord permission name <-> bitfield mapping.
 *
 * The Discord API and our tool inputs use SCREAMING_SNAKE_CASE names
 * (e.g. VIEW_CHANNEL); discord.js exposes PascalCase keys (e.g. ViewChannel).
 * This module is the single source of truth, including the Nov-2025 permission
 * split bits (PIN_MESSAGES, BYPASS_SLOWMODE, CREATE_GUILD_EXPRESSIONS,
 * CREATE_EVENTS) that older static maps miss.
 */

function snakeToPascal(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// Explicit overrides where simple snake->pascal does not match discord.js keys.
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
  USE_SOUNDBOARD: 'UseSoundboard',
  SEND_VOICE_MESSAGES: 'SendVoiceMessages',
  REQUEST_TO_SPEAK: 'RequestToSpeak',
  VIEW_GUILD_INSIGHTS: 'ViewGuildInsights',
  VIEW_AUDIT_LOG: 'ViewAuditLog',
  VIEW_CREATOR_MONETIZATION_ANALYTICS: 'ViewCreatorMonetizationAnalytics',
};

function resolveKey(name: string): keyof typeof PermissionFlagsBits | undefined {
  if (ALIASES[name]) return ALIASES[name];
  const pascal = snakeToPascal(name) as keyof typeof PermissionFlagsBits;
  return pascal in PermissionFlagsBits ? pascal : undefined;
}

/** Convert an array of SCREAMING_SNAKE_CASE permission names to a bitfield string. */
export function permissionNamesToBitfield(names: string[]): string {
  let bf = 0n;
  for (const n of names) {
    const key = resolveKey(n);
    if (key) bf |= PermissionFlagsBits[key];
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
    if (bit !== 0n && (bf & bit) === bit) {
      out.push(pascalToSnake(pascalKey));
    }
  }
  return out;
}
