import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSite } from './index.mjs';

const manifest = {
  aiax_version: '0.1',
  product: { name: 'demo', one_line_purpose: 'demo agent', domain: 'testing' },
  entry_points: [{ id: 'brief', url: 'https://x.test/aiax/sections/brief.json', purpose: 'briefs', est_tokens: 300 }],
  pricing_summary: '0.01 USDC per brief',
  trust_signals: { score: 80, pact_endpoint: null, drs_receipt_count: null },
  mcp_endpoint: null,
  updated_at: '2026-10-23T00:00:00Z',
};
const section = {
  aiax_version: '0.1', section_id: 'brief', purpose: 'makes briefs',
  inputs: { type: 'object', properties: { q: { type: 'string' } } },
  outputs: 'text brief',
  pricing: { model: 'per_call', amount: '0.01', currency: 'USDC', rail: 'x402' },
  examples: [{ description: 'd', request: {}, response: {} }],
  pact_mandate_template: null,
};

const fakeFetch = map => async (url) => {
  for (const [k, v] of Object.entries(map))
    if (String(url).endsWith(k) || String(url) === k)
      return new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return new Response('nf', { status: 404 });
};

test('fully valid site -> valid, score 100', async () => {
  const r = await validateSite('https://x.test', { fetch: fakeFetch({
    '/.well-known/aiax.json': manifest, '/aiax/sections/brief.json': section }) });
  assert.equal(r.valid, true); assert.equal(r.score, 100);
});

test('missing manifest -> invalid with failure', async () => {
  const r = await validateSite('https://x.test', { fetch: fakeFetch({}) });
  assert.equal(r.valid, false);
  assert.ok(r.failures.some(f => f.includes('manifest fetch')));
});

test('schema violation reported per field', async () => {
  const bad = { ...manifest, aiax_version: '9.9' };
  const r = await validateSite('https://x.test', { fetch: fakeFetch({ '/.well-known/aiax.json': bad }) });
  assert.equal(r.valid, false);
  assert.ok(r.failures.some(f => f.includes('manifest schema') && f.includes('aiax_version')));
});

test('missing section counts as failure', async () => {
  const r = await validateSite('https://x.test', { fetch: fakeFetch({ '/.well-known/aiax.json': manifest }) });
  assert.equal(r.valid, false);
  assert.ok(r.failures.some(f => f.includes('section brief')));
});

test('section schema violation reported', async () => {
  const badSec = { ...section, section_id: 'BAD ID!' };
  const r = await validateSite('https://x.test', { fetch: fakeFetch({
    '/.well-known/aiax.json': manifest, '/aiax/sections/brief.json': badSec }) });
  assert.equal(r.valid, false);
  assert.ok(r.failures.some(f => f.includes('section brief')));
});

test('network error is a failure not a crash', async () => {
  const r = await validateSite('https://x.test', { fetch: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(r.valid, false);
  assert.match(r.failures[0], /ECONNREFUSED/);
});
