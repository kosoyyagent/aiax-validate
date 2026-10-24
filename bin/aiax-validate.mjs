#!/usr/bin/env node
// npx aiax-validate <url> [--json] [--fixtures <dir>]
import { validateSite } from '../index.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const jsonOut = args.includes('--json');
const fxIdx = args.indexOf('--fixtures');
const fixturesDir = fxIdx > -1 ? args[fxIdx + 1] : null;

if (!url && !fixturesDir) {
  console.error('usage: aiax-validate <url> [--json] [--fixtures <dir>]');
  process.exit(2);
}

let fetchImpl;
if (fixturesDir) {
  // serve the site from a local directory: /.well-known/aiax.json + sections
  const dir = resolve(fixturesDir);
  fetchImpl = async (u) => {
    const p = new URL(u).pathname.replace(/^\//, '');
    const rel = p === '.well-known/aiax.json' ? 'aiax.json' : p;
    const f = join(dir, rel);
    if (!existsSync(f)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(f, 'utf8'), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

const report = await validateSite(url || 'file://fixtures', { fetch: fetchImpl });

if (jsonOut) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`${report.url} -> score ${report.score}/100 ${report.valid ? 'VALID' : 'INVALID'}`);
  for (const f of report.failures) console.log(`  x ${f}`);
}
process.exit(report.valid ? 0 : 1);
