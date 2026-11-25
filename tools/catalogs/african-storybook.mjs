#!/usr/bin/env node
// Builds catalogs/african-storybook.json: every openly licensed (CC BY) storybook on africanstorybook.org,
// tidied for Kitab (titles fixed, languages named, reading levels labelled, an EPUB link for each).
// Kitab downloads the books straight from africanstorybook.org; this file only lists them.
//   node tools/catalogs/african-storybook.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const SITE = 'https://www.africanstorybook.org';
const UA = 'Kitab-sources-catalog/1.0 (https://github.com/mrboora04/kitab-sources; builds a list of open storybooks)';
const get = async (path) => {
  const r = await fetch(SITE + path, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`${path} answered ${r.status}`);
  return r.text();
};

// ISO 639-1 codes for the languages Kitab's language chips know; others keep their name only
const ISO = { English: 'en', French: 'fr', Portuguese: 'pt', Arabic: 'ar', Spanish: 'es', German: 'de', Afrikaans: 'af',
  Kiswahili: 'sw', Swahili: 'sw', isiZulu: 'zu', isiXhosa: 'xh', Sesotho: 'st', Setswana: 'tn', Yoruba: 'yo', Igbo: 'ig',
  Hausa: 'ha', Amharic: 'am', Somali: 'so', Luganda: 'lg', Kinyarwanda: 'rw', Shona: 'sn', Chichewa: 'ny', Akan: 'ak',
  Tigrinya: 'ti', Wolof: 'wo', Lingala: 'ln', Malagasy: 'mg', Oromo: 'om', 'Afaan Oromo': 'om', Xitsonga: 'ts',
  Tshivenda: 've', isiNdebele: 'nr', siSwati: 'ss', Sepedi: 'nso', Ewe: 'ee', Fulfulde: 'ff', Kirundi: 'rn', Twi: 'tw' };
const LEVELS = { 1: 'First words', 2: 'First sentences', 3: 'First paragraphs', 4: 'Longer paragraphs', 5: 'Read aloud' };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** Undoes HTML entities, then text that was UTF-8 read as Latin-1 ("Ã©" for "é"). */
function tidy(s) {
  let t = String(s || '').replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
    // named Latin-1 entities (&Oslash; &pound; ...): decode with a tiny table built from the browser's list
    const ch = LATIN1[e];
    return ch == null ? m : ch;
  });
  // UTF-8 that was read as Windows-1252: turn it back into bytes and read it again, only when that gives clean text
  const bytes = cp1252Bytes(t);
  if (bytes && bytes.some((x) => x >= 0x80)) {
    const fixed = Buffer.from(bytes).toString('utf8');
    const lost = (fixed.match(/\ufffd/g) || []).length;              // the site lost a byte here and there: drop those
    if (lost <= 2 && fixed.length < t.length) t = fixed.replace(/\ufffd/g, '');
  }
  return t.replace(/\s+/g, ' ').trim();
}
const CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
/** The Windows-1252 bytes of a text, or null when it has characters Windows-1252 does not have. */
function cp1252Bytes(t) {
  const out = [];
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if (c <= 0xff) out.push(c);
    else if (CP1252[c] != null) out.push(CP1252[c]);
    else return null;
  }
  return out;
}
const LATIN1 = {};
'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
  .split(' ').forEach((n, i) => { LATIN1[n] = String.fromCharCode(160 + i); });
LATIN1.dagger = '†'; LATIN1.sbquo = '‚'; LATIN1.lsquo = '‘'; LATIN1.rsquo = '’'; LATIN1.ldquo = '“'; LATIN1.rdquo = '”';
Object.assign(LATIN1, { fnof: '\u0192', circ: '\u02c6', tilde: '\u02dc', Dagger: '\u2021', permil: '\u2030', Scaron: '\u0160', scaron: '\u0161', lsaquo: '\u2039', rsaquo: '\u203a', OElig: '\u0152', oelig: '\u0153', Zcaron: '\u017d', zcaron: '\u017e', Yuml: '\u0178', bull: '\u2022' });
LATIN1.ndash = '–'; LATIN1.mdash = '—'; LATIN1.hellip = '…'; LATIN1.bdquo = '„'; LATIN1.euro = '€'; LATIN1.trade = '™';

/** One `push({id:"1",title:"..."})` line as an object, without running it. */
function objectOf(lit) {
  const out = {};
  const re = /([a-zA-Z_]+)\s*:\s*(?:"((?:[^"\\]|\\.)*)"|(true|false|-?\d+(?:\.\d+)?))/g;
  let m;
  while ((m = re.exec(lit))) out[m[1]] = m[2] != null ? m[2].replace(/\\(.)/g, '$1') : m[3] === 'true' ? true : m[3] === 'false' ? false : Number(m[3]);
  return out;
}

const home = await get('/');
const langs = {};
for (const m of home.matchAll(/value=['"]?(\d{3,6})['"]?>([^<]{1,60})</g)) langs[m[1]] = tidy(m[2]);
const list = await get('/lists/booklist.website.php');
const books = [];
const seen = new Set();
for (const m of list.matchAll(/push\((\{[^\n]*?\})\);/g)) {
  const o = objectOf(m[1]);
  if (!o.id || seen.has(o.id) || !o.title) continue;
  seen.add(o.id);
  const langName = langs[o.lang] || '';
  const level = Number(o.level) || 0;
  books.push({
    id: String(o.id),
    title: tidy(o.title),
    authors: tidy(o.author).split(/\s*,\s*|\s{2,}/).filter(Boolean),
    summary: tidy(o.summary),
    lang: ISO[langName] || '',
    language: langName,
    level, levelName: LEVELS[level] || '',
    added: Number(o.date) || 0,
    formats: [{ format: 'EPUB', url: `${SITE}/read/downloadepub.php?id=${o.id}` }],
  });
}
if (books.length < 500) throw new Error(`only ${books.length} books found: the site may have changed`);
books.sort((a, b) => b.added - a.added);
const counts = {};
for (const b of books) if (b.language) counts[b.language] = (counts[b.language] || 0) + 1;
mkdirSync('catalogs', { recursive: true });
const out = {
  schema: 1, name: 'African Storybook', site: SITE, license: 'CC BY 4.0 (openly licensed storybooks)',
  updated: new Date().toISOString().slice(0, 10), count: books.length,
  languages: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, lang: ISO[name] || '', count: n })),
  books,
};
writeFileSync('catalogs/african-storybook.json', JSON.stringify(out) + '\n');
console.log(`african-storybook: ${books.length} books in ${Object.keys(counts).length} languages; top: ${out.languages.slice(0, 6).map((l) => `${l.name} ${l.count}`).join(', ')}`);
