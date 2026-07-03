/**
 * Shared message helpers that talk to the REST API (unlike the pure
 * builders in services/content.ts).
 */

import { Routes } from 'discord.js';
import { getRest } from '../client/rest.js';

/**
 * Pin a message via the current pins endpoint (Nov-2025), falling back to
 * the legacy route when the new one is unavailable.
 */
export async function pinMessage(channelId: string, messageId: string): Promise<void> {
  try {
    await getRest().put(`/channels/${channelId}/messages/pins/${messageId}`);
  } catch (e: any) {
    if (e?.status === 404 || e?.code === 0) {
      await getRest().put(Routes.channelPin(channelId, messageId));
    } else {
      throw e;
    }
  }
}
