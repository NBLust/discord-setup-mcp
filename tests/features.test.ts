import { describe, it, expect } from 'vitest';
import { buildAutomodRuleBody, buildScheduledEventBody, bufferToDataUri } from '../src/services/features.js';

describe('buildAutomodRuleBody', () => {
  it('builds a keyword rule with block + alert actions', () => {
    const b: any = buildAutomodRuleBody({ name: 'no-scams', trigger: 'keyword', keywords: ['scam', 'airdrop'], alertChannelId: '123' });
    expect(b.trigger_type).toBe(1);
    expect(b.trigger_metadata.keyword_filter).toEqual(['scam', 'airdrop']);
    expect(b.actions).toHaveLength(2);
    expect(b.actions[1]).toEqual({ type: 2, metadata: { channel_id: '123' } });
  });
  it('maps keyword presets', () => {
    const b: any = buildAutomodRuleBody({ name: 'p', trigger: 'keyword_preset', presets: ['profanity', 'slurs'] });
    expect(b.trigger_metadata.presets).toEqual([1, 3]);
  });
  it('requires keywords for keyword trigger', () => {
    expect(() => buildAutomodRuleBody({ name: 'x', trigger: 'keyword' })).toThrow();
  });
  it('requires mentionLimit for mention_spam', () => {
    expect(() => buildAutomodRuleBody({ name: 'x', trigger: 'mention_spam' })).toThrow();
  });
});

describe('buildScheduledEventBody', () => {
  it('builds an external event with location + end time', () => {
    const b: any = buildScheduledEventBody({ name: 'AMA', entityType: 'external', startTime: '2026-07-01T18:00:00Z', endTime: '2026-07-01T19:00:00Z', location: 'X Space' });
    expect(b.entity_type).toBe(3);
    expect(b.entity_metadata).toEqual({ location: 'X Space' });
    expect(b.scheduled_end_time).toBe('2026-07-01T19:00:00Z');
  });
  it('requires location for external events', () => {
    expect(() => buildScheduledEventBody({ name: 'x', entityType: 'external', startTime: '2026-07-01T18:00:00Z', endTime: '2026-07-01T19:00:00Z' })).toThrow();
  });
  it('requires channelId for voice events', () => {
    expect(() => buildScheduledEventBody({ name: 'x', entityType: 'voice', startTime: '2026-07-01T18:00:00Z' })).toThrow();
  });
});

describe('bufferToDataUri', () => {
  it('builds a png data uri', () => {
    const uri = bufferToDataUri(Buffer.from([1, 2, 3]), 'icon.png');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('rejects unsupported extensions', () => {
    expect(() => bufferToDataUri(Buffer.from([1]), 'icon.bmp')).toThrow();
  });
});
