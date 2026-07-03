/**
 * Content Tools — REST-only.
 * Put content INTO a server: messages, embeds, pins, forum posts, webhook
 * personas, and link-button messages. Interactive components are unsupported
 * (no gateway listener) — link buttons only.
 */

import { z } from 'zod';
import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';
import { buildEmbed, buildLinkButtons, EmbedZ, type EmbedInput, type LinkButtonInput } from '../services/content.js';
import { pinMessage } from '../services/messages.js';
import { wrapDiscordError, ValidationError } from '../utils/errors.js';

function fail(error: unknown, ctx: string) {
  const e = wrapDiscordError(error, ctx);
  return { success: false as const, error: JSON.stringify(e.toJSON()) };
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

export const sendMessageToolDefinition = {
  name: 'send_message',
  description: 'Sends a plain text/markdown message to a channel (max 2000 characters).',
  inputSchema: {
    type: 'object',
    properties: {
      channelId: { type: 'string', description: 'Target channel ID' },
      content: { type: 'string', description: 'Message content (markdown, max 2000 chars)' },
    },
    required: ['channelId', 'content'],
  },
};
export const SendMessageInputSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1).max(2000),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export async function sendMessageHandler(input: SendMessageInput) {
  try {
    const msg = (await getRest().post(Routes.channelMessages(input.channelId), {
      body: { content: input.content },
    })) as any;
    return { success: true as const, data: { id: msg.id, channelId: input.channelId, message: 'Message sent' } };
  } catch (error) {
    return fail(error, 'send_message');
  }
}

// ============================================================================
// POST EMBED
// ============================================================================

export const postEmbedToolDefinition = {
  name: 'post_embed',
  description: 'Posts a rich embed (title, description, color, fields, images) to a channel, optionally with leading text.',
  inputSchema: {
    type: 'object',
    properties: {
      channelId: { type: 'string', description: 'Target channel ID' },
      content: { type: 'string', description: 'Optional text above the embed (max 2000 chars)' },
      embed: {
        type: 'object',
        description: 'Embed definition',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          url: { type: 'string' },
          color: { type: ['string', 'number'], description: 'Hex (#5865F2) or integer' },
          fields: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' }, inline: { type: 'boolean' } }, required: ['name', 'value'] } },
          footer: { type: 'object', properties: { text: { type: 'string' }, iconUrl: { type: 'string' } }, required: ['text'] },
          author: { type: 'object', properties: { name: { type: 'string' }, url: { type: 'string' }, iconUrl: { type: 'string' } }, required: ['name'] },
          image: { type: 'string', description: 'Image URL' },
          thumbnail: { type: 'string', description: 'Thumbnail URL' },
          timestamp: { type: ['boolean', 'string'] },
        },
      },
    },
    required: ['channelId', 'embed'],
  },
};
export const PostEmbedInputSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().max(2000).optional(),
  embed: EmbedZ,
});
export type PostEmbedInput = z.infer<typeof PostEmbedInputSchema>;

export async function postEmbedHandler(input: PostEmbedInput) {
  try {
    const embed = buildEmbed(input.embed as EmbedInput);
    const msg = (await getRest().post(Routes.channelMessages(input.channelId), {
      body: { content: input.content, embeds: [embed] },
    })) as any;
    return { success: true as const, data: { id: msg.id, channelId: input.channelId, message: 'Embed posted' } };
  } catch (error) {
    return fail(error, 'post_embed');
  }
}

// ============================================================================
// PIN MESSAGE
// ============================================================================

export const pinMessageToolDefinition = {
  name: 'pin_message',
  description: 'Pins a message in a channel.',
  inputSchema: {
    type: 'object',
    properties: {
      channelId: { type: 'string', description: 'Channel ID' },
      messageId: { type: 'string', description: 'Message ID to pin' },
    },
    required: ['channelId', 'messageId'],
  },
};
export const PinMessageInputSchema = z.object({
  channelId: z.string().min(1),
  messageId: z.string().min(1),
});
export type PinMessageInput = z.infer<typeof PinMessageInputSchema>;

export async function pinMessageHandler(input: PinMessageInput) {
  try {
    await pinMessage(input.channelId, input.messageId);
    return { success: true as const, data: { channelId: input.channelId, messageId: input.messageId, message: 'Message pinned' } };
  } catch (error) {
    return fail(error, 'pin_message');
  }
}

// ============================================================================
// CREATE FORUM POST
// ============================================================================

export const createForumPostToolDefinition = {
  name: 'create_forum_post',
  description: 'Creates a post (thread) in a forum or media channel with a starting message.',
  inputSchema: {
    type: 'object',
    properties: {
      channelId: { type: 'string', description: 'Forum/media channel ID' },
      name: { type: 'string', description: 'Post title (1-100 chars)' },
      content: { type: 'string', description: 'Starting message content (max 2000 chars)' },
      appliedTags: { type: 'array', items: { type: 'string' }, description: 'Forum tag IDs to apply' },
    },
    required: ['channelId', 'name', 'content'],
  },
};
export const CreateForumPostInputSchema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1).max(100),
  content: z.string().min(1).max(2000),
  appliedTags: z.array(z.string()).optional(),
});
export type CreateForumPostInput = z.infer<typeof CreateForumPostInputSchema>;

export async function createForumPostHandler(input: CreateForumPostInput) {
  try {
    const thread = (await getRest().post(Routes.threads(input.channelId), {
      body: { name: input.name, message: { content: input.content }, applied_tags: input.appliedTags },
    })) as any;
    return { success: true as const, data: { id: thread.id, name: thread.name, message: 'Forum post created' } };
  } catch (error) {
    return fail(error, 'create_forum_post');
  }
}

// ============================================================================
// POST VIA WEBHOOK (persona)
// ============================================================================

export const postViaWebhookToolDefinition = {
  name: 'post_via_webhook',
  description: 'Posts a message under a custom persona (name + avatar) via a temporary webhook. The message persists after the webhook is removed.',
  inputSchema: {
    type: 'object',
    properties: {
      channelId: { type: 'string', description: 'Target channel ID' },
      username: { type: 'string', description: 'Persona display name' },
      avatarUrl: { type: 'string', description: 'Persona avatar URL (optional)' },
      content: { type: 'string', description: 'Message content (optional if embed provided)' },
      embed: { type: 'object', description: 'Optional embed (same shape as post_embed)' },
    },
    required: ['channelId', 'username'],
  },
};
export const PostViaWebhookInputSchema = z.object({
  channelId: z.string().min(1),
  username: z.string().min(1).max(80),
  avatarUrl: z.string().optional(),
  content: z.string().max(2000).optional(),
  embed: EmbedZ.optional(),
});
export type PostViaWebhookInput = z.infer<typeof PostViaWebhookInputSchema>;

export async function postViaWebhookHandler(input: PostViaWebhookInput) {
  let webhook: any;
  try {
    if (!input.content && !input.embed) {
      return fail(new ValidationError('Provide content or embed'), 'post_via_webhook');
    }
    webhook = (await getRest().post(Routes.channelWebhooks(input.channelId), {
      body: { name: 'mcp-persona' },
    })) as any;
    const body: any = { username: input.username, avatar_url: input.avatarUrl };
    if (input.content) body.content = input.content;
    if (input.embed) body.embeds = [buildEmbed(input.embed as EmbedInput)];
    await getRest().post(Routes.webhook(webhook.id, webhook.token), {
      body,
      query: new URLSearchParams({ wait: 'true' }),
      auth: false,
    });
    return { success: true as const, data: { channelId: input.channelId, persona: input.username, message: 'Posted via webhook persona' } };
  } catch (error) {
    return fail(error, 'post_via_webhook');
  } finally {
    if (webhook?.id) await getRest().delete(Routes.webhook(webhook.id)).catch(() => {});
  }
}

// ============================================================================
// POST MESSAGE WITH COMPONENTS (link buttons only)
// ============================================================================

export const postMessageWithComponentsToolDefinition = {
  name: 'post_message_with_components',
  description: 'Posts a message with link buttons (style 5). Interactive buttons/menus are NOT supported (requires an always-on bot); use link buttons only.',
  inputSchema: {
    type: 'object',
    properties: {
      channelId: { type: 'string', description: 'Target channel ID' },
      content: { type: 'string', description: 'Message content (max 2000 chars)' },
      buttons: {
        type: 'array',
        description: 'Up to 25 link buttons (5 per row)',
        items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, emoji: { type: 'string' } }, required: ['label', 'url'] },
      },
    },
    required: ['channelId', 'buttons'],
  },
};
export const PostMessageWithComponentsInputSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().max(2000).optional(),
  buttons: z.array(z.object({ label: z.string(), url: z.string(), emoji: z.string().optional() })).min(1),
});
export type PostMessageWithComponentsInput = z.infer<typeof PostMessageWithComponentsInputSchema>;

export async function postMessageWithComponentsHandler(input: PostMessageWithComponentsInput) {
  try {
    const components = buildLinkButtons(input.buttons as LinkButtonInput[]);
    const msg = (await getRest().post(Routes.channelMessages(input.channelId), {
      body: { content: input.content, components },
    })) as any;
    return { success: true as const, data: { id: msg.id, channelId: input.channelId, message: 'Message with link buttons posted' } };
  } catch (error) {
    return fail(error, 'post_message_with_components');
  }
}
