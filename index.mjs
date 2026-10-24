// aiax-validate: fetch a site's AIAX manifest + sections, validate against the
// AIAX 0.1 schemas, score the site, explain every failure.
// validateSite(url, {fetch?}) -> Report
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SCHEMA_DIR = join(fileURLToPath(import.meta.url), '..', 'schemas');
const manifestSchema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'manifest.schema.json'), 'utf8'));
const sectionSchema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'section.schema.json'), 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const vManifest = ajv.compile(manifestSchema);
const vSection = ajv.compile(sectionSchema);

const fmt = errs => (errs || []).map(e => `${e.instancePath || '/'} ${e.message}`);

export async function validateSite(url, { fetch: fx } = {}) {
  fx = fx ?? globalThis.fetch;
  const base = String(url).replace(/\/+$/, '');
  const report = { url: base, manifest: null, sections: [], failures: [], score: 0, valid: false };

  let manifest;
  try {
    const r = await fx(`${base}/.well-known/aiax.json`);
    if (!r.ok) { report.failures.push(`manifest fetch: HTTP ${r.status}`); return finish(report); }
    manifest = await r.json();
  } catch (e) {
    report.failures.push(`manifest fetch failed: ${e.message}`); return finish(report);
  }
  report.manifest = { present: true };

  if (!vManifest(manifest)) {
    report.failures.push(...fmt(vManifest.errors).map(e => `manifest schema: ${e}`));
    return finish(report);
  }
  report.manifest.valid = true;
  report.score += 40;

  for (const ep of manifest.entry_points || []) {
    const sec = { id: ep.id, url: ep.url };
    try {
      const abs = new URL(ep.url, base).href;
      const r = await fx(abs);
      if (!r.ok) { sec.error = `HTTP ${r.status}`; report.failures.push(`section ${ep.id}: HTTP ${r.status}`); report.sections.push(sec); continue; }
      const doc = await r.json();
      if (vSection(doc)) {
        sec.valid = true; report.score += Math.round(60 / manifest.entry_points.length);
      } else {
        sec.errors = fmt(vSection.errors);
        report.failures.push(...sec.errors.map(e => `section ${ep.id}: ${e}`));
      }
    } catch (e) {
      sec.error = e.message; report.failures.push(`section ${ep.id}: ${e.message}`);
    }
    report.sections.push(sec);
  }
  return finish(report);
}

function finish(report) {
  report.score = Math.min(100, report.score);
  report.valid = report.failures.length === 0 && !!report.manifest?.valid;
  return report;
}
