/**
 * Node-side UI contract test for the literature search pool.
 *
 * Loads the real i18n runtime plus search.js against a minimal DOM stub and
 * asserts that the pool covers every published record (current edition, past
 * editions and the classics library), that a lookup reaches records from each
 * source, and that both languages render.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));

const papers = read('papers.json');
const classics = read('classics.json');
const manifest = read('editions.json');

// Every archived edition listed by the manifest (the current one points at papers.json).
const history = manifest.editions
  .filter(entry => entry.path !== 'data/papers.json')
  .map(entry => ({ path: entry.path, data: read(entry.path.replace('data/', '')) }));

const expectedWeekly = papers.items.length;
const expectedClassic = classics.items.length;
const expectedPast = history.reduce((total, entry) => total + entry.data.items.length, 0);
const expectedTotal = expectedWeekly + expectedClassic + expectedPast;

const files = { 'data/papers.json': papers, 'data/classics.json': classics, 'data/editions.json': manifest };
history.forEach(entry => { files[entry.path] = entry.data; });

const make = () => ({ innerHTML: '', textContent: '', value: '', addEventListener(type, handler) { this[type] = handler; } });
const nodes = Object.fromEntries(
  ['query', 'headerQuery', 'searchTitle', 'searchNote', 'searchResults', 'searchForm'].map(id => [id, make()])
);

global.document = {
  readyState: 'complete',
  title: '',
  documentElement: {},
  body: { getAttribute: () => 'search' },
  getElementById: id => nodes[id] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.window = global;
global.location = { search: '' };
global.history = { replaceState() {} };
global.localStorage = {
  store: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); }
};
global.fetch = async url => {
  const key = String(url);
  if (Object.prototype.hasOwnProperty.call(files, key)) return { ok: true, json: async () => files[key] };
  return { ok: false, status: 404, json: async () => ({}) };
};

vm.runInThisContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), { filename: 'i18n.js' });

// The idle result list previews only the first page, so lift the cap to assert
// that the pool really spans every published record.
global.EA_SEARCH_PREVIEW_LIMIT = 100000;

// search.js renders its save / quick-look buttons through EA.reading, provided
// by reading-list.js in the browser. This harness only asserts which records are
// found, so stand in with a no-op.
EA.reading = {
  register: () => {},
  actionButtons: () => '',
  quickButton: () => '',
  onChange: () => {}
};

vm.runInThisContext(fs.readFileSync(path.join(root, 'search.js'), 'utf8'), { filename: 'search.js' });

const count = (re, html) => (html.match(re) || []).length;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function search(term) {
  nodes.query.value = term;
  nodes.searchForm.onsubmit({ preventDefault() {} });
  return nodes.searchResults.innerHTML;
}

setImmediate(() => {
  // ---- the pool spans every published record ----
  const all = nodes.searchResults.innerHTML;
  assert(count(/class="search-row"/g, all) === expectedTotal,
    `pool size mismatch: rows=${count(/class="search-row"/g, all)}, expected=${expectedTotal}`);
  assert(count(/search-scope">本周精选/g, all) === expectedWeekly, 'current-edition badge count mismatch');
  assert(count(/search-scope">往期/g, all) === expectedPast, 'past-edition badge count mismatch');
  assert(count(/search-scope">经典论文库/g, all) === expectedClassic, 'classics badge count mismatch');
  assert(nodes.searchNote.textContent.includes(String(expectedTotal)), 'idle note does not report the full pool');

  // ---- a lookup reaches a record that only exists in the classics library ----
  const classicHit = search('gene duplication');
  assert(classicHit.includes('Gene duplication in experimental enzyme evolution'), 'classics record is not searchable');
  assert(classicHit.includes('search-scope">经典论文库'), 'classics hit is not labelled as such');

  // ---- a lookup reaches a record that only exists in a past edition ----
  // Probes are taken from the live data instead of a hard-coded title: the
  // weekly rollover moves the previous edition into the archive, so a fixed
  // title would stop describing "the current edition" the moment it ships.
  const oldestArchive = history[history.length - 1];
  const pastProbe = oldestArchive.data.items[0].doi;
  const pastHit = search(pastProbe);
  assert(pastHit.includes(pastProbe), 'past-edition record is not searchable');
  assert(/search-scope">往期 0\d/.test(pastHit), 'past-edition hit is not labelled with its edition');

  // ---- a lookup reaches a record from the current edition ----
  const currentProbe = papers.items[0].doi;
  const currentHit = search(currentProbe);
  assert(currentHit.includes(currentProbe), 'current-edition record is not searchable');
  assert(currentHit.includes('search-scope">本周精选'), 'current-edition hit is not labelled as such');

  // ---- whitespace terms are ANDed, so an impossible pair matches nothing ----
  assert(count(/class="search-row"/g, search(`${currentProbe} ${pastProbe}`)) === 0, 'multi-term search is not ANDed');

  // ---- English mode keeps the same pool and reaches the same records ----
  nodes.query.value = '';
  EA.setLang('en');
  assert(EA.getLang() === 'en', 'language switch did not take effect');
  const enAll = nodes.searchResults.innerHTML;
  assert(count(/search-scope">Classics/g, enAll) === expectedClassic, 'en classics badge count mismatch');
  assert(count(/search-scope">This week/g, enAll) === expectedWeekly, 'en current-edition badge count mismatch');
  const enHit = search('directed evolution');
  assert(count(/class="search-row"/g, enHit) > 0, 'English search returned nothing');
  assert(!enHit.includes('经典论文库'), 'Chinese scope label leaked into the English view');

  nodes.query.value = '';
  EA.setLang('zh');
  assert(nodes.searchResults.innerHTML.includes('经典论文库'), 'Chinese copy not restored after switching back');

  console.log(`PASS: pool=${expectedTotal} (this week ${expectedWeekly} + past ${expectedPast} + classics ${expectedClassic}); classics, past and current lookups reachable; zh/en verified`);
});
