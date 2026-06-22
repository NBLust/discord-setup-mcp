import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as restMod from '../src/client/rest.js';
import { resolveGuildId, listGuilds, _resetGuildCache } from '../src/services/guild.js';

function mockRest(guilds: any[]) {
  vi.spyOn(restMod, 'getRest').mockReturnValue({
    get: vi.fn(async (route: string) => {
      if (route.includes('/users/@me/guilds')) return guilds;
      const m = route.match(/\/guilds\/(\d+)$/);
      if (m) {
        const g = guilds.find((x) => x.id === m[1]);
        if (g) return g;
        const e: any = new Error('Unknown Guild');
        e.status = 404;
        throw e;
      }
      return [];
    }),
  } as any);
}

describe('guild resolution', () => {
  beforeEach(() => {
    _resetGuildCache();
    vi.restoreAllMocks();
  });
  it('resolves by exact id', async () => {
    mockRest([{ id: '111', name: 'Alpha' }]);
    expect(await resolveGuildId('111')).toBe('111');
  });
  it('resolves by case-insensitive name', async () => {
    mockRest([
      { id: '111', name: 'Alpha' },
      { id: '222', name: 'Beta' },
    ]);
    expect(await resolveGuildId('beta')).toBe('222');
  });
  it('lists guilds', async () => {
    mockRest([{ id: '111', name: 'Alpha' }]);
    const gs = await listGuilds();
    expect(gs[0].name).toBe('Alpha');
  });
});
