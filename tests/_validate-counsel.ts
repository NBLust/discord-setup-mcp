/** Validates blueprints/counsel.yaml against the schema and plans it (read-only) on mcp-test. */
import { loadBlueprint, planBlueprint } from '../src/services/blueprint.js';

const bp = loadBlueprint({ file: 'blueprints/counsel.yaml' });
const channels = (bp.categories ?? []).reduce((n, c) => n + c.channels.length, 0);
console.log(`loaded: ${bp.roles?.length ?? 0} roles, ${bp.categories?.length ?? 0} categories, ${channels} channels`);

const plan = await planBlueprint('1518725132057710653', bp);
console.log('plan (read-only):', JSON.stringify(plan));
process.exit(bp.roles && bp.categories && channels > 0 ? 0 : 1);
