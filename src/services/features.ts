/**
 * Pure builders for server-feature tool bodies (automod, scheduled events,
 * branding data URIs). Validated against Discord's API shape.
 */

import { ValidationError } from '../utils/errors.js';

// ============================================================================
// AUTOMOD
// ============================================================================

export interface AutomodInput {
  name: string;
  trigger: 'keyword' | 'spam' | 'mention_spam' | 'keyword_preset';
  keywords?: string[];
  presets?: Array<'profanity' | 'sexual_content' | 'slurs'>;
  mentionLimit?: number;
  block?: boolean;
  customBlockMessage?: string;
  alertChannelId?: string;
  exemptRoles?: string[];
  exemptChannels?: string[];
}

const TRIGGER_TYPE: Record<string, number> = { keyword: 1, spam: 3, keyword_preset: 4, mention_spam: 5 };
const PRESET: Record<string, number> = { profanity: 1, sexual_content: 2, slurs: 3 };

export function buildAutomodRuleBody(input: AutomodInput): Record<string, unknown> {
  const trigger_type = TRIGGER_TYPE[input.trigger];
  const trigger_metadata: Record<string, unknown> = {};
  if (input.trigger === 'keyword') {
    if (!input.keywords || input.keywords.length === 0) throw new ValidationError('keyword trigger requires keywords');
    trigger_metadata.keyword_filter = input.keywords;
  } else if (input.trigger === 'keyword_preset') {
    if (!input.presets || input.presets.length === 0) throw new ValidationError('keyword_preset trigger requires presets');
    trigger_metadata.presets = input.presets.map((p) => PRESET[p]);
  } else if (input.trigger === 'mention_spam') {
    if (input.mentionLimit === undefined) throw new ValidationError('mention_spam trigger requires mentionLimit');
    trigger_metadata.mention_total_limit = input.mentionLimit;
  }

  const actions: Array<Record<string, unknown>> = [];
  if (input.block !== false) {
    actions.push({ type: 1, metadata: input.customBlockMessage ? { custom_message: input.customBlockMessage } : {} });
  }
  if (input.alertChannelId) {
    actions.push({ type: 2, metadata: { channel_id: input.alertChannelId } });
  }
  if (actions.length === 0) throw new ValidationError('automod rule needs at least one action (block or alert)');

  return {
    name: input.name,
    event_type: 1, // MESSAGE_SEND
    trigger_type,
    trigger_metadata,
    actions,
    enabled: true,
    exempt_roles: input.exemptRoles,
    exempt_channels: input.exemptChannels,
  };
}

// ============================================================================
// SCHEDULED EVENTS
// ============================================================================

export interface ScheduledEventInput {
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  entityType: 'voice' | 'stage' | 'external';
  channelId?: string;
  location?: string;
}

const ENTITY_TYPE: Record<string, number> = { stage: 1, voice: 2, external: 3 };

export function buildScheduledEventBody(input: ScheduledEventInput): Record<string, unknown> {
  const entity_type = ENTITY_TYPE[input.entityType];
  const body: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    privacy_level: 2, // GUILD_ONLY
    scheduled_start_time: input.startTime,
    entity_type,
  };
  if (input.entityType === 'external') {
    if (!input.location) throw new ValidationError('external event requires a location');
    if (!input.endTime) throw new ValidationError('external event requires an endTime');
    body.entity_metadata = { location: input.location };
    body.scheduled_end_time = input.endTime;
  } else {
    if (!input.channelId) throw new ValidationError(`${input.entityType} event requires a channelId`);
    body.channel_id = input.channelId;
    if (input.endTime) body.scheduled_end_time = input.endTime;
  }
  return body;
}

// ============================================================================
// BRANDING
// ============================================================================

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** Convert raw image bytes + a filename/extension to a Discord data URI. */
export function bufferToDataUri(buffer: Buffer | Uint8Array, filenameOrExt: string): string {
  const ext = filenameOrExt.toLowerCase().split('.').pop() ?? 'png';
  const mime = MIME[ext];
  if (!mime) throw new ValidationError(`Unsupported image type: .${ext} (use png/jpg/gif/webp)`);
  const b64 = Buffer.from(buffer).toString('base64');
  return `data:${mime};base64,${b64}`;
}
