#!/usr/bin/env node
// Runs every source against the real websites, the way Kitab does, and writes status.json.
//   node tools/live-check.mjs              check all sources (and Kitab's built-in ones)
//   node tools/live-check.mjs wikisource   check one
// The recipe runner is Kitab's own assets/js/sources.js (fetched from the Kitab repository, or KITAB_SOURCES_JS=path),
// so a source passes here only if it works in the app.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { DOMParser as LinkeDOMParser } from 'linkedom';

/** Browsers wrap a bare HTML fragment in <html><body>; linkedom does not, so do it here. */
class DOMParser {
  parseFromString(text, type) {
    const s = String(text);
    const whole = /^\s*(<!doctype|<html)/i.test(s) ? s : `<!doctype html><html><head></head><body>${s}</body></html>`;
    return new LinkeDOMParser().parseFromString(type === 'text/html' ? whole : s, type);
  }
}

const APP_JS = process.env.KITAB_SOURCES_JS || 'https://raw.githubusercontent.com/mrboora04/Kitab/main/assets/js/sources.js';
const UA = 'Kitab-sources-check/1.0 (https://github.com/mrboora04/kitab-sources; daily check of free book sources)';
const only = process.argv[2] || '';
const QUERY = 'history';

/* ---------- the app's network call, done with fetch ---------- */
async function fetchText(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, application/atom+xml, text/html;q=0.9, */*;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  } catch (e) {
    const err = new Error('Could not reach the site (' + (e.cause?.code || e.name || e.message) + ')');
    err.status = 0;
    throw err;
  }
  const body = await res.text();
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`The site answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return { status: res.status, url: res.url, body };
}

/** Kitab fetches a Project Gutenberg file from its mirror when gutenberg.org is down (Http.gutenbergMirror). */
function gutenbergMirror(url) {
  let u; try { u = new URL(url); } catch { return null; }
  if (!/^(www\.)?gutenberg\.org$/.test(u.hostname)) return null;
  if (u.pathname.startsWith('/cache/epub/')) return 'https://gutenberg.pglaf.org' + u.pathname;
  const m = /^\/ebooks\/(\d+)\.(epub3\.images|epub\.images|epub\.noimages|epub|txt\.utf-8|txt)$/.exec(u.pathname);
  if (!m) return null;
  const [, n, k] = m;
  const file = k === 'epub3.images' ? `pg${n}-images-3.epub` : k === 'epub.images' ? `pg${n}-images.epub` : k.startsWith('txt') ? `pg${n}.txt` : `pg${n}.epub`;
  return `https://gutenberg.pglaf.org/cache/epub/${n}/${file}`;
}

/** Downloads only the start of a book file: is it there, and is it a book? */
async function probeDownload(url, mirrored) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-2047' }, redirect: 'follow', signal: AbortSignal.timeout(60000) });
  const buf = Buffer.from(await res.arrayBuffer());
  if ((res.status >= 500 || res.status === 429) && !mirrored && gutenbergMirror(res.url)) return (await probeDownload(gutenbergMirror(res.url), true)) + ' (from the Gutenberg mirror)';
  if (res.status !== 200 && res.status !== 206) throw new Error(`the book file answered ${res.status}`);
  const head = buf.subarray(0, 5).toString('latin1');
  const kind = head.startsWith('%PDF') ? 'PDF' : head.startsWith('PK') ? 'EPUB' : '';
  if (!kind) throw new Error(`the book file is not an EPUB or PDF (${res.headers.get('content-type') || 'unknown type'})`);
  return kind;
}

/* ---------- load Kitab's recipe runner ---------- */
const appCode = /^https?:/.test(APP_JS) ? await (await fetch(APP_JS, { headers: { 'User-Agent': UA } })).text() : readFileSync(APP_JS, 'utf8');
const ctx = vm.createContext({
  store: { get: (k, d) => d, set() {} },
  Opds: { fetchText },
  DOMParser, URL, URLSearchParams, TextEncoder, crypto: globalThis.crypto, console, setTimeout, clearTimeout,
});
vm.runInContext(appCode + '\n;globalThis.__Sources = Sources;', ctx, { filename: 'sources.js' });
const Sources = ctx.__Sources;

/* ---------- which sources ---------- */
const index = JSON.parse(readFileSync('index.json', 'utf8'));
const defs = [];
for (const d of Object.values(Sources.builtin || {})) defs.push({ def: d, builtin: true });
for (const s of index.sources) defs.push({ def: JSON.parse(readFileSync(s.file, 'utf8')) });

const timed = async (fn) => { const t = Date.now(); try { return { ok: true, ...(await fn()), ms: Date.now() - t }; } catch (e) { return { ok: false, error: String(e.message || e), ms: Date.now() - t }; } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkSource(def) {
  Sources.installed[def.id] = { def };
  const out = { name: def.name, version: def.version, lists: [], search: null, book: null };
  if (def.type === 'opds') { out.skipped = 'OPDS sources are checked when they are opened in the app'; return out; }
  const samples = [];
  for (const b of def.browse || []) {
    const r = await timed(async () => {
      const f = await Sources.load(`ext:${def.id}?op=browse&k=${encodeURIComponent(b.key)}&page=1`);
      const n = f.entries.filter((e) => e.title).length;
      if (!n) throw new Error('the list came back empty');
      if (samples.length < 3) samples.push(...f.entries.filter((e) => e.title).slice(0, 3 - samples.length));
      return { count: n, covers: f.entries.filter((e) => e.cover).length };
    });
    out.lists.push({ key: b.key, label: b.label, ...r });
    await pause(400);
  }
  if (def.search) {
    out.search = await timed(async () => {
      const f = await Sources.load(`ext:${def.id}?op=search&q=${QUERY}&page=1`);
      const n = f.entries.filter((e) => e.title).length;
      if (!n) throw new Error(`no results for "${QUERY}"`);
      if (samples.length < 3) samples.push(...f.entries.filter((e) => e.title).slice(0, 3 - samples.length));
      return { count: n };
    });
  }
  // a book: the first of up to three that can be downloaded (one odd item does not fail the source)
  if (samples.length) {
    out.book = await timed(async () => {
      const why = [];
      for (const sample of samples) {
        try {
          let formats = sample.formats || [], read = sample.read || '';
          if ((!formats.length || !read) && sample.detail) { const d = (await Sources.load(sample.detail)).entries[0] || {}; if (!formats.length) formats = d.formats || []; read = read || d.read || ''; }
          // "Read now": the book's page list must open and have pages
          if (read && !out.pages) out.pages = await timed(async () => {
            const m = JSON.parse((await fetchText(read)).body);
            const n = (m.items || (m.sequences && m.sequences[0] && m.sequences[0].canvases) || []).length;
            if (!n) throw new Error('the page list has no pages');
            return { count: n, title: sample.title };
          });
          if (!formats.length) throw new Error('no EPUB or PDF to download');
          return { title: sample.title, format: await probeDownload(formats[0].url), tried: why.length + 1 };
        } catch (e) { why.push(`"${sample.title}": ${e.message}`); }
      }
      throw new Error(why.join('; '));
    });
  }
  return out;
}

const prev = existsSync('status.json') ? JSON.parse(readFileSync('status.json', 'utf8')) : { sources: {} };
const status = { checkedAt: new Date().toISOString(), sources: only ? prev.sources : {} };
for (const { def, builtin } of defs) {
  if (only && def.id !== only) continue;
  process.stdout.write(`${def.id} … `);
  const r = await checkSource(def);
  const parts = [...r.lists, r.search, r.book, r.pages].filter(Boolean);
  r.ok = !r.skipped && parts.length > 0 && parts.every((x) => x.ok);
  // a source is "working" when you can open a list or search, and download a book
  r.working = !!r.skipped || ((r.lists.some((x) => x.ok) || r.search?.ok) && !!r.book?.ok);
  // Some sites (behind Cloudflare) refuse GitHub's servers but not phones: that says nothing about the source
  if (!r.working && parts.length && parts.every((x) => !x.ok && /answered 403/.test(x.error))) {
    r.working = null;
    r.blocked = 'The site refuses requests from GitHub\'s servers, so it cannot be checked from here (phones are not affected)';
  }
  if (builtin) r.builtin = true;
  status.sources[def.id] = r;
  console.log(r.ok ? 'ok' : r.blocked ? 'could not be checked (the site blocks GitHub)' : r.working ? 'partly working' : 'NOT WORKING');
  for (const p of parts) if (!p.ok) console.log(`   ✗ ${p.label || (p === r.search ? 'search' : 'download')}: ${p.error}`);
}
writeFileSync('status.json', JSON.stringify(status, null, 2) + '\n');

// a short report for the GitHub run page and for the issue
const lines = ['| Source | State | Lists | Search | Book download | Read now |', '|---|---|---|---|---|---|'];
for (const [id, r] of Object.entries(status.sources)) {
  const lists = r.lists.length ? `${r.lists.filter((x) => x.ok).length}/${r.lists.length}` : '–';
  const cell = (x) => (!x ? '–' : x.ok ? '✓' : '✗ ' + x.error.replace(/\|/g, '/'));
  lines.push(`| ${r.name} (\`${id}\`) | ${r.skipped ? 'skipped' : r.ok ? '✅ working' : r.blocked ? '❔ blocks GitHub' : r.working ? '⚠️ partly' : '❌ not working'} | ${lists} | ${cell(r.search)} | ${cell(r.book)} | ${r.pages ? (r.pages.ok ? `✓ ${r.pages.count} pages` : cell(r.pages)) : '–'} |`);
}
writeFileSync('status.md', lines.join('\n') + '\n');
console.log('\n' + lines.join('\n'));
