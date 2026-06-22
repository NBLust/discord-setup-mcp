import { REST } from 'discord.js';
import { getConfig } from './config.js';

let restInstance: REST | null = null;

/** Returns a singleton REST client authenticated with the bot token. No gateway, no intents. */
export function getRest(): REST {
  if (restInstance) return restInstance;
  const config = getConfig();
  restInstance = new REST({ version: '10' }).setToken(config.discordToken);
  return restInstance;
}

/** Test seam: reset the singleton. */
export function resetRest(): void {
  restInstance = null;
}
