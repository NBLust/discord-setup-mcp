/**
 * Live check for the REAL blueprint engine against `mcp-test`.
 * Built standalone with tsup, run with node. Self-cleaning.
 *   npx tsup tests/_blueprint-livecheck.ts --format esm --out-dir /tmp/lc --target node18
 *   node /tmp/lc/_blueprint-livecheck.js
 */
import { Routes } from 'discord.js';
import { getRest } from '../src/client/rest.js';
import { applyBlueprint, planBlueprint, exportServer, loadBlueprint } from '../src/services/blueprint.js';

const GID = '1518725132057710653'; // mcp-test
const rest = getRest();

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) { pass++; console.log('  PASS', n); } else { fail++; console.log('  FAIL', n); } };

const bp = loadBlueprint({
  blueprint: {
    roles: [{ name: 'SmokeRole', color: '#00FF00', permissions: ['MANAGE_MESSAGES', 'PIN_MESSAGES'] }],
    categories: [
      { name: 'SMOKE-CAT', channels: [
        { name: 'smoke-welcome', type: 'text', topic: 'hi', messages: [{ content: 'welcome!', pin: true }] },
      ] },
    ],
  },
});

async function cleanup() {
  const chans: any[] = await rest.get(Routes.guildChannels(GID)) as any;
  for (const name of ['smoke-welcome']) {
    const c = chans.find((x) => x.name?.toLowerCase() === name);
    if (c) await rest.delete(Routes.channel(c.id)).catch(() => {});
  }
  const cat = chans.find((x) => x.type === 4 && x.name?.toLowerCase() === 'smoke-cat');
  if (cat) await rest.delete(Routes.channel(cat.id)).catch(() => {});
  const roles: any[] = await rest.get(Routes.guildRoles(GID)) as any;
  const role = roles.find((r) => r.name === 'SmokeRole');
  if (role) await rest.delete(Routes.guildRole(GID, role.id)).catch(() => {});
}

try {
  await cleanup(); // ensure clean start

  const plan = await planBlueprint(GID, bp);
  ok('plan: 1 role + 1 channel to create', plan.roles.create === 1 && plan.channels.create === 1);

  const r1 = await applyBlueprint(GID, bp);
  ok('apply: role created', r1.rolesCreated === 1);
  ok('apply: category + channel created', r1.categoriesCreated === 1 && r1.channelsCreated === 1);
  ok('apply: seeded + pinned 1 message', r1.messagesPosted === 1);

  const r2 = await applyBlueprint(GID, bp);
  ok('re-apply idempotent: 0 created', r2.rolesCreated === 0 && r2.channelsCreated === 0 && r2.categoriesCreated === 0);
  ok('re-apply idempotent: 0 messages (no dupes)', r2.messagesPosted === 0);
  ok('re-apply: role + channel skipped', r2.rolesSkipped === 1 && r2.channelsSkipped === 1);

  const exported = await exportServer(GID);
  ok('export: contains SmokeRole', !!exported.roles?.find((r) => r.name === 'SmokeRole'));
  ok('export: contains SMOKE-CAT with smoke-welcome', !!exported.categories?.find((c) => c.name.toLowerCase() === 'smoke-cat' && c.channels.some((ch) => ch.name === 'smoke-welcome')));
} catch (e: any) {
  fail++; console.log('  FAIL exception:', e?.status, e?.rawError?.message || e?.message);
} finally {
  await cleanup();
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
