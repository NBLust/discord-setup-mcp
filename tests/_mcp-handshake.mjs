/** Spawns the built MCP server and verifies initialize + tools/list over stdio. */
import { spawn } from 'child_process';

const srv = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
srv.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
srv.stderr.on('data', () => {});
const send = (o) => srv.stdin.write(JSON.stringify(o) + '\n');
const rpc = (id, method, params) => new Promise((res) => { pending.set(id, res); send({ jsonrpc: '2.0', id, method, params }); });

const timeout = setTimeout(() => { console.log('TIMEOUT'); srv.kill(); process.exit(1); }, 10000);

const init = await rpc(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
const list = await rpc(2, 'tools/list', {});
clearTimeout(timeout);

const tools = list.result?.tools ?? [];
const names = new Set(tools.map((t) => t.name));
const expected = ['list_guilds', 'apply_blueprint', 'plan_blueprint', 'export_server', 'send_message', 'post_embed', 'create_forum_post', 'configure_automod', 'create_scheduled_event', 'create_invite', 'enable_community', 'configure_onboarding', 'set_welcome_screen', 'set_server_branding'];
const missing = expected.filter((n) => !names.has(n));

console.log('protocol:', init.result?.protocolVersion);
console.log('serverInfo:', JSON.stringify(init.result?.serverInfo));
console.log('tool count:', tools.length);
console.log(missing.length ? 'MISSING: ' + missing.join(', ') : 'all 14 key tools present');
srv.kill();
process.exit(tools.length >= 34 && missing.length === 0 ? 0 : 1);
