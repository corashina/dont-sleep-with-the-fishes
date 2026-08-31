import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import { startFrozenPlaytest } from './frozenPlaytest';

const { values } = parseArgs({
  options: { 'batch-dir': { type: 'string' }, port: { type: 'string', default: '4173' } },
});
const port = Number(values.port);
if (!values['batch-dir'] || !isAbsolute(values['batch-dir'])
  || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Usage: npm run playtest:serve -- --batch-dir <absolute batch folder> [--port 4173]');
}
const sourceRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const server = await startFrozenPlaytest({ sourceRoot, batchDir: values['batch-dir'], port });
console.log(`Frozen playtest: ${server.url}\nBuild metadata: ${server.metadataPath}`);
const stop = () => { void server.close(); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
if (await server.closed === 'invalidated') {
  console.error(`Playtest stopped: source or build changed. See ${server.metadataPath}`);
  process.exitCode = 1;
}
