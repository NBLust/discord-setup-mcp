import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadBlueprint, classifyByName, BlueprintZ, validateBlueprintPermissions } from '../src/services/blueprint.js';

const tmp = mkdtempSync(join(tmpdir(), 'bp-'));

describe('loadBlueprint', () => {
  it('loads an inline object and applies defaults', () => {
    const bp = loadBlueprint({ blueprint: { categories: [{ name: 'INFO', channels: [{ name: 'welcome' }] }] } });
    expect(bp.categories?.[0].channels[0].type).toBe('text'); // default applied
  });

  it('loads a YAML file', () => {
    const file = join(tmp, 'b.yaml');
    writeFileSync(file, 'roles:\n  - name: Admin\n    permissions: [ADMINISTRATOR]\ncategories:\n  - name: INFO\n    channels:\n      - name: welcome\n        type: text\n');
    const bp = loadBlueprint({ file });
    expect(bp.roles?.[0].name).toBe('Admin');
    expect(bp.categories?.[0].channels[0].name).toBe('welcome');
  });

  it('loads a JSON file', () => {
    const file = join(tmp, 'b.json');
    writeFileSync(file, JSON.stringify({ roles: [{ name: 'Mod' }] }));
    const bp = loadBlueprint({ file });
    expect(bp.roles?.[0].name).toBe('Mod');
  });

  it('throws on an invalid blueprint', () => {
    expect(() => loadBlueprint({ blueprint: { roles: 'not-an-array' } })).toThrow();
  });
});

describe('validateBlueprintPermissions', () => {
  it('accepts valid names and legacy synonyms everywhere', () => {
    expect(() => validateBlueprintPermissions({
      roles: [{ name: 'Mod', permissions: ['MANAGE_MESSAGES', 'TIMEOUT_MEMBERS'] }],
      categories: [{ name: 'C', overwrites: [{ role: 'Mod', allow: ['VIEW_CHANNELS'] }], channels: [
        { name: 'x', type: 'text', overwrites: [{ role: '@everyone', deny: ['SEND_MESSAGES'] }] },
      ] }],
    })).not.toThrow();
  });
  it('rejects a typo in role permissions with the role named', () => {
    expect(() => validateBlueprintPermissions({ roles: [{ name: 'Broken', permissions: ['VEIW_CHANNEL'] }] }))
      .toThrow(/Role "Broken".*Unknown permission name/s);
  });
  it('rejects a typo in a channel overwrite deny list', () => {
    expect(() => validateBlueprintPermissions({
      categories: [{ name: 'C', channels: [{ name: 'x', type: 'text', overwrites: [{ role: '@everyone', deny: ['SEND_MESAGES'] }] }] }],
    })).toThrow(/Channel "x".*deny.*Unknown permission name/s);
  });
});

describe('classifyByName', () => {
  it('classifies create/update/skip by name', () => {
    const live = [{ name: 'Alpha', v: 1 }, { name: 'Beta', v: 2 }];
    const desired = [{ name: 'alpha', v: 1 }, { name: 'Beta', v: 9 }, { name: 'Gamma', v: 0 }];
    const res = classifyByName(live, desired, (d, l) => d.v === l.v);
    expect(res.create.map((x) => x.name)).toEqual(['Gamma']);
    expect(res.update.map((x) => x.name)).toEqual(['Beta']);
    expect(res.skip.map((x) => x.name)).toEqual(['alpha']);
  });
});

describe('BlueprintZ', () => {
  it('accepts a minimal valid blueprint', () => {
    expect(BlueprintZ.safeParse({ roles: [{ name: 'X' }] }).success).toBe(true);
  });
  it('rejects a bad channel type', () => {
    expect(BlueprintZ.safeParse({ categories: [{ name: 'C', channels: [{ name: 'x', type: 'bogus' }] }] }).success).toBe(false);
  });
  it('validates seeded message embeds at load time', () => {
    const withEmbed = (embed: unknown) => ({
      categories: [{ name: 'C', channels: [{ name: 'x', messages: [{ embed }] }] }],
    });
    expect(BlueprintZ.safeParse(withEmbed({ title: 'ok', fields: [{ name: 'a', value: 'b' }] })).success).toBe(true);
    expect(BlueprintZ.safeParse(withEmbed({ title: 123 })).success).toBe(false);
    expect(BlueprintZ.safeParse(withEmbed({ fields: [{ name: 'a' }] })).success).toBe(false);
  });
});
