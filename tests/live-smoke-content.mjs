/**
 * Live content smoke test — ONLY against a dedicated test guild
 * (MCP_TEST_GUILD_ID env var, or the default `mcp-test`). Self-cleaning.
 *   MCP_TEST_GUILD_ID=<your-test-guild-id> node tests/live-smoke-content.mjs
 */
import { REST, Routes } from 'discord.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const GID = process.env.MCP_TEST_GUILD_ID || '1518725132057710653';
const token = JSON.parse(readFileSync(join(homedir(), '.discord-mcp', 'config.json'), 'utf-8')).discordToken;
const rest = new REST({ version: '10' }).setToken(token);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };
const cleanup = [];

try {
  const chan = await rest.post(Routes.guildChannels(GID), { body: { name: 'smoke-content', type: 0 } });
  cleanup.push(() => rest.delete(Routes.channel(chan.id)));

  const msg = await rest.post(Routes.channelMessages(chan.id), { body: { content: 'hello from smoke' } });
  ok('send_message', !!msg.id);

  const emb = await rest.post(Routes.channelMessages(chan.id), { body: { embeds: [{ title: 'T', description: 'D', color: 0x5865f2 }] } });
  ok('post_embed', emb.embeds?.[0]?.title === 'T');

  // pin: new endpoint first, legacy fallback
  let pinned = false, pinRoute = '';
  try { await rest.put(`/channels/${chan.id}/messages/pins/${msg.id}`); pinned = true; pinRoute = 'new'; }
  catch (e) {
    if (e?.status === 404) { await rest.put(Routes.channelPin(chan.id, msg.id)); pinned = true; pinRoute = 'legacy'; }
    else throw e;
  }
  ok(`pin_message (${pinRoute} route)`, pinned);

  // forum channel + post (forums need no Community since Aug 2025)
  let forumOk = false;
  try {
    const forum = await rest.post(Routes.guildChannels(GID), { body: { name: 'smoke-forum', type: 15 } });
    cleanup.push(() => rest.delete(Routes.channel(forum.id)));
    const thread = await rest.post(Routes.threads(forum.id), { body: { name: 'first post', message: { content: 'forum body' } } });
    forumOk = !!thread.id;
  } catch (e) { console.log('    forum note:', e?.status, e?.rawError?.message || e?.message); }
  ok('create_forum_post', forumOk);

  // webhook persona
  const wh = await rest.post(Routes.channelWebhooks(chan.id), { body: { name: 'mcp-persona' } });
  await rest.post(Routes.webhook(wh.id, wh.token), { body: { username: 'Counsel Bot', content: 'persona msg' }, query: new URLSearchParams({ wait: 'true' }), auth: false });
  await rest.delete(Routes.webhook(wh.id));
  ok('post_via_webhook (create/execute/delete)', true);

  // link buttons
  const comp = await rest.post(Routes.channelMessages(chan.id), { body: { content: 'links', components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Site', url: 'https://example.com' }] }] } });
  ok('post_message_with_components (link button)', comp.components?.length === 1);
} catch (e) {
  fail++; console.log('  FAIL exception:', e?.status, e?.rawError?.message || e?.message);
} finally {
  for (const c of cleanup.reverse()) await c().catch(() => {});
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
