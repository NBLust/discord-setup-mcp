import { describe, it, expect } from 'vitest';
import { parseColor } from '../src/utils/color.js';

describe('parseColor', () => {
  it('returns undefined for undefined', () => {
    expect(parseColor(undefined)).toBeUndefined();
  });
  it('parses #RRGGBB and bare RRGGBB hex', () => {
    expect(parseColor('#FF0000')).toBe(0xff0000);
    expect(parseColor('5865F2')).toBe(0x5865f2);
  });
  it('passes through valid integers', () => {
    expect(parseColor(0)).toBe(0);
    expect(parseColor(0xffffff)).toBe(0xffffff);
  });
  it('throws on malformed hex instead of producing NaN', () => {
    expect(() => parseColor('red')).toThrow(/Invalid color/);
    expect(() => parseColor('#FFF')).toThrow(/Invalid color/);
  });
  it('throws on out-of-range integers', () => {
    expect(() => parseColor(-1)).toThrow(/Invalid color/);
    expect(() => parseColor(0x1000000)).toThrow(/Invalid color/);
  });
});
