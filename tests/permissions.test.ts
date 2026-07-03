import { describe, it, expect } from 'vitest';
import { permissionNamesToBitfield, bitfieldToPermissionNames, PERMISSION_NAMES } from '../src/services/permissions.js';

describe('permissions', () => {
  it('maps SCREAMING_SNAKE names to a bitfield string', () => {
    const bf = permissionNamesToBitfield(['VIEW_CHANNEL', 'SEND_MESSAGES']);
    expect(typeof bf).toBe('string');
    expect(BigInt(bf) > 0n).toBe(true);
  });
  it('round-trips names', () => {
    const names = ['MANAGE_MESSAGES', 'PIN_MESSAGES', 'CREATE_EVENTS'];
    const bf = permissionNamesToBitfield(names);
    const back = bitfieldToPermissionNames(bf);
    for (const n of names) expect(back).toContain(n);
  });
  it('knows the Nov-2025 split bits', () => {
    for (const n of ['PIN_MESSAGES', 'BYPASS_SLOWMODE', 'CREATE_GUILD_EXPRESSIONS', 'CREATE_EVENTS']) {
      expect(permissionNamesToBitfield([n])).not.toBe('0');
    }
  });
  it('accepts legacy/UI synonyms and maps them to the API bit', () => {
    const pairs: Array<[string, string]> = [
      ['MANAGE_SERVER', 'MANAGE_GUILD'],
      ['TIMEOUT_MEMBERS', 'MODERATE_MEMBERS'],
      ['VIDEO', 'STREAM'],
      ['VIEW_CHANNELS', 'VIEW_CHANNEL'],
      ['CREATE_INVITE', 'CREATE_INSTANT_INVITE'],
      ['USE_VOICE_ACTIVITY', 'USE_VAD'],
      ['USE_EXTERNAL_EMOJI', 'USE_EXTERNAL_EMOJIS'],
      ['MANAGE_EMOJIS_AND_STICKERS', 'MANAGE_GUILD_EXPRESSIONS'],
    ];
    for (const [legacy, canonical] of pairs) {
      expect(permissionNamesToBitfield([legacy])).toBe(permissionNamesToBitfield([canonical]));
    }
  });
  it('throws on unknown names instead of silently dropping them', () => {
    expect(() => permissionNamesToBitfield(['NOT_A_PERM'])).toThrow(/Unknown permission name/);
  });
  it('every derived PERMISSION_NAME resolves and round-trips uniquely', () => {
    expect(PERMISSION_NAMES.length).toBeGreaterThan(40);
    for (const n of PERMISSION_NAMES) {
      const bf = permissionNamesToBitfield([n]);
      expect(bf).not.toBe('0');
      expect(bitfieldToPermissionNames(bf)).toEqual([n]);
    }
  });
});
