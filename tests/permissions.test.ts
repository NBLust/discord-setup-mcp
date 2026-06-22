import { describe, it, expect } from 'vitest';
import { permissionNamesToBitfield, bitfieldToPermissionNames } from '../src/services/permissions.js';

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
  it('ignores unknown names safely', () => {
    expect(permissionNamesToBitfield(['NOT_A_PERM'])).toBe('0');
  });
});
