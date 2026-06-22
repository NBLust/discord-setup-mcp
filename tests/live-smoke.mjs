/**
 * Live REST smoke test — runs ONLY against the dedicated `mcp-test` guild.
 * Creates a category, channel, and role, edits, then deletes everything.
 * Reads the bot token from ~/.discord-mcp/config.json. Self-cleaning.
 *
 *   node tests/live-smoke.mjs
 */
import { REST, Routes, PermissionFlagsBits } from 'discord.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GID = '1518725132057710653'; // mcp-test
const token = JSON.parse(readFileSync(join(homedir(), '.discord-mcp', 'config.json'), 'utf-8')).discordToken;
const rest = new REST({ version: '10' }).setToken(token);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };

const created = {};
try {
  const chans0 = await rest.get(Routes.guildChannels(GID));
  ok('GET channels returns array', Array.isArray(chans0));

  const cat = await rest.post(Routes.guildChannels(GID), { body: { name: 'smoke-cat', type: 4 } });
  created.cat = cat.id;
  ok('create category', cat.type === 4 && cat.name === 'smoke-cat');

  const chan = await rest.post(Routes.guildChannels(GID), { body: { name: 'smoke-chan', type: 0, parent_id: cat.id, topic: 'hi' } });
  created.chan = chan.id;
  ok('create text channel under category', chan.parent_id === cat.id && chan.topic === 'hi');

  const edited = await rest.patch(Routes.channel(chan.id), { body: { topic: 'edited' } });
  ok('edit channel topic', edited.topic === 'edited');

  const perms = (PermissionFlagsBits.ManageMessages | PermissionFlagsBits.PinMessages).toString();
  const role = await rest.post(Routes.guildRoles(GID), { body: { name: 'smoke-role', permissions: perms } });
  created.role = role.id;
  ok('create role with MANAGE_MESSAGES+PIN_MESSAGES (Nov-2025 bit)', (BigInt(role.permissions) & PermissionFlagsBits.PinMessages) === PermissionFlagsBits.PinMessages);
} catch (e) {
  fail++;
  console.log('  FAIL exception:', e?.code, e?.message);
} finally {
  // cleanup
  if (created.chan) await rest.delete(Routes.channel(created.chan)).catch(() => {});
  if (created.cat) await rest.delete(Routes.channel(created.cat)).catch(() => {});
  if (created.role) await rest.delete(Routes.guildRole(GID, created.role)).catch(() => {});
}

const chans1 = await rest.get(Routes.guildChannels(GID));
const roles1 = await rest.get(Routes.guildRoles(GID));
const leftover = [...chans1, ...roles1].filter((x) => x.name && x.name.startsWith('smoke-'));
ok('cleanup left nothing behind', leftover.length === 0);

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
