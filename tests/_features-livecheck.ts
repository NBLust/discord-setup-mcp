/**
 * Live check for the REAL server-feature handlers against `mcp-test`.
 * Builds with tsup, runs with node. Enables Community then REVERTS it, and
 * cleans up every artifact. Run:
 *   npx tsup tests/_features-livecheck.ts --format esm --out-dir .livecheck --target node18 --no-dts
 *   node .livecheck/_features-livecheck.js
 */
import { Routes } from 'discord.js';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRest } from '../src/client/rest.js';
import { configureAutomodHandler } from '../src/tools/automod.js';
import { createScheduledEventHandler } from '../src/tools/events.js';
import { createInviteHandler } from '../src/tools/invites.js';
import { enableCommunityHandler, setWelcomeScreenHandler, configureOnboardingHandler } from '../src/tools/community.js';
import { setServerBrandingHandler } from '../src/tools/branding.js';

const GID = '1518725132057710653';
const rest = getRest();
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, extra?: any) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n, extra ? JSON.stringify(extra) : ''); } };

const cleanup: Array<() => Promise<any>> = [];

try {
  // temp channels
  const textCh: any = await rest.post(Routes.guildChannels(GID), { body: { name: 'feat-text', type: 0 } });
  cleanup.push(() => rest.delete(Routes.channel(textCh.id)));
  const voiceCh: any = await rest.post(Routes.guildChannels(GID), { body: { name: 'Feat Voice', type: 2 } });
  cleanup.push(() => rest.delete(Routes.channel(voiceCh.id)));

  // automod
  const am = await configureAutomodHandler({ guildId: GID, name: 'feat-no-scams', trigger: 'keyword', keywords: ['scamword'], alertChannelId: textCh.id });
  ok('configure_automod', am.success, am);
  if (am.success) { const id = (am.data as any).id; cleanup.push(() => rest.delete(`/guilds/${GID}/auto-moderation/rules/${id}`)); }

  // scheduled event (external)
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const end = new Date(Date.now() + 90_000_000).toISOString();
  const ev = await createScheduledEventHandler({ guildId: GID, name: 'Counsel AMA', entityType: 'external', startTime: start, endTime: end, location: 'X Space' });
  ok('create_scheduled_event', ev.success, ev);
  if (ev.success) { const id = (ev.data as any).id; cleanup.push(() => rest.delete(`/guilds/${GID}/scheduled-events/${id}`)); }

  // invite
  const inv = await createInviteHandler({ channelId: textCh.id });
  ok('create_invite', inv.success && /discord\.gg\//.test((inv.data as any)?.url), inv);

  // enable community (auto-creates rules + moderator-only)
  const ec = await enableCommunityHandler({ guildId: GID });
  ok('enable_community', ec.success && (ec.data as any)?.community === true, ec);

  // welcome screen (needs community)
  const ws = await setWelcomeScreenHandler({ guildId: GID, enabled: true, description: 'Welcome to Counsel', welcomeChannels: [{ channelId: textCh.id, description: 'Start here' }] });
  ok('set_welcome_screen (gated, now allowed)', ws.success, ws);

  // onboarding disable (avoids strict enable constraints; proves route + gating)
  const ob = await configureOnboardingHandler({ guildId: GID, enabled: false });
  ok('configure_onboarding (disable)', ob.success, ob);

  // branding: set a 1x1 png icon then revert
  const pngHex = '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6360000002000150d3c2a40000000049454e44ae426082';
  const pngPath = join(tmpdir(), 'feat-icon.png');
  writeFileSync(pngPath, Buffer.from(pngHex, 'hex'));
  const br = await setServerBrandingHandler({ guildId: GID, iconPath: pngPath });
  ok('set_server_branding (icon)', br.success, br);
} catch (e: any) {
  fail++; console.log('  FAIL exception:', e?.status, e?.rawError?.message || e?.message);
} finally {
  // revert community + delete its auto-created channels
  try {
    const g: any = await rest.get(Routes.guild(GID));
    const feats = (g.features ?? []).filter((f: string) => f !== 'COMMUNITY');
    await rest.patch(Routes.guild(GID), { body: { features: feats, verification_level: 0, explicit_content_filter: 0, icon: null } });
  } catch {}
  try {
    const chans: any[] = await rest.get(Routes.guildChannels(GID)) as any;
    for (const c of chans) {
      if (['rules', 'moderator-only'].includes((c.name ?? '').toLowerCase())) await rest.delete(Routes.channel(c.id)).catch(() => {});
    }
  } catch {}
  for (const c of cleanup.reverse()) await c().catch(() => {});
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
