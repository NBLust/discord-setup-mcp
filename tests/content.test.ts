import { describe, it, expect } from 'vitest';
import { buildEmbed, buildLinkButtons } from '../src/services/content.js';

describe('buildEmbed', () => {
  it('builds an embed and converts hex color to int', () => {
    const e = buildEmbed({ title: 'Hi', description: 'World', color: '#FF0000' });
    expect(e.title).toBe('Hi');
    expect(e.color).toBe(0xff0000);
  });
  it('maps fields', () => {
    const e = buildEmbed({ fields: [{ name: 'a', value: 'b', inline: true }] });
    expect(e.fields?.[0]).toEqual({ name: 'a', value: 'b', inline: true });
  });
  it('throws when title exceeds 256 chars', () => {
    expect(() => buildEmbed({ title: 'x'.repeat(257) })).toThrow();
  });
  it('throws when total content exceeds 6000 chars', () => {
    expect(() => buildEmbed({ description: 'x'.repeat(4096), fields: [{ name: 'y'.repeat(256), value: 'z'.repeat(1024) }, { name: 'y'.repeat(256), value: 'z'.repeat(1024) }] })).toThrow();
  });
});

describe('buildLinkButtons', () => {
  it('chunks buttons into action rows of 5', () => {
    const rows = buildLinkButtons(Array.from({ length: 7 }, (_, i) => ({ label: `b${i}`, url: 'https://x.com' })));
    expect(rows).toHaveLength(2);
    expect(rows[0].components).toHaveLength(5);
    expect(rows[1].components).toHaveLength(2);
    expect(rows[0].components[0]).toMatchObject({ type: 2, style: 5, url: 'https://x.com' });
  });
  it('rejects non-http urls', () => {
    expect(() => buildLinkButtons([{ label: 'x', url: 'javascript:alert(1)' }])).toThrow();
  });
  it('rejects more than 25 buttons', () => {
    expect(() => buildLinkButtons(Array.from({ length: 26 }, () => ({ label: 'x', url: 'https://x.com' })))).toThrow();
  });
});
