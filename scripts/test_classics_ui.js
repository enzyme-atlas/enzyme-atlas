/**
 * Node-side UI contract test for the classics library.
 *
 * Loads the real i18n runtime plus classics.js against a minimal DOM stub and
 * asserts both the Chinese default render and the English render produced by the
 * language switch.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const classicData = JSON.parse(fs.readFileSync(path.join(root, 'data', 'classics.json'), 'utf8'));
const expectedCount = classicData.items.length;
const expectedCellCount = classicData.items.filter(item => item.sourceGroup === 'Cell 正刊').length;

const nodes = Object.fromEntries(
  ['classicCount', 'classicGrid', 'classicSourceStats', 'classicFilters'].map(id => [id, {
    innerHTML: '',
    textContent: '',
    addEventListener(type, handler) { this[type] = handler; }
  }])
);

global.document = {
  readyState: 'complete',
  title: '',
  documentElement: {},
  body: { getAttribute: () => 'classics' },
  getElementById: id => nodes[id] || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.window = global;
global.location = { search: '' };
global.localStorage = {
  store: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); }
};
global.fetch = async url => ({
  ok: true,
  json: async () => (String(url).includes('classics') ? classicData : {})
});

vm.runInThisContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8'), { filename: 'i18n.js' });

// classics.js renders its save / quick-look buttons through EA.reading, which
// reading-list.js provides in the browser. This harness asserts the library
// rendering itself, so stand in with a no-op that still counts registrations.
let registered = 0;
const registrations = () => registered;
EA.reading = {
  register: () => { registered += 1; },
  actionButtons: () => '<button type="button" class="action-button">收藏</button>',
  quickButton: () => '<button type="button" class="read-link">快速扫读</button>',
  onChange: () => {}
};

vm.runInThisContext(fs.readFileSync(path.join(root, 'classics.js'), 'utf8'), { filename: 'classics.js' });

function count(re, html) { return (html.match(re) || []).length; }
function assert(condition, message) { if (!condition) throw new Error(message); }

setImmediate(() => {
  const cardCount = count(/class="classic-card"/g, nodes.classicGrid.innerHTML);
  const filterCount = count(/data-source=/g, nodes.classicFilters.innerHTML);
  const doiCount = count(/https:\/\/doi\.org\//g, nodes.classicGrid.innerHTML);
  assert(cardCount === expectedCount && filterCount === 6 && doiCount === expectedCount,
    `zh initial render mismatch: cards=${cardCount}, filters=${filterCount}, doi=${doiCount}`);
  assert(nodes.classicCount.innerHTML.includes('共整理'), 'zh count copy missing');
  assert(nodes.classicGrid.innerHTML.includes('用实验体系展示基因复制'), 'zh notes missing');
  // Saving must be reachable from every card. `register` is cumulative across
  // re-renders, so measure the first render's share only.
  assert(registrations() === expectedCount,
    `every card of the initial render must register a record: ${registrations()}/${expectedCount}`);
  assert(count(/class="classic-actions"/g, nodes.classicGrid.innerHTML) === expectedCount,
    'cards are missing their save row');

  const beforeFilter = registrations();
  nodes.classicFilters.click({ target: { closest: () => ({ dataset: { source: 'Cell 正刊' } }) } });
  const cellCards = count(/class="classic-card"/g, nodes.classicGrid.innerHTML);
  assert(cellCards === expectedCellCount && nodes.classicCount.innerHTML.includes('Cell 正刊'),
    `zh Cell filter mismatch: cards=${cellCards}`);
  assert(nodes.classicCount.innerHTML.includes('篇'), 'zh filtered count copy missing');
  assert(registrations() - beforeFilter === expectedCellCount,
    `filtered cards must register a record: ${registrations() - beforeFilter}/${expectedCellCount}`);
  assert(count(/class="classic-actions"/g, nodes.classicGrid.innerHTML) === expectedCellCount,
    'filtered cards are missing their save row');

  // ---- switch to English and re-check the same view ----
  EA.setLang('en');
  assert(EA.getLang() === 'en', 'language switch did not take effect');
  const englishCards = count(/class="classic-card"/g, nodes.classicGrid.innerHTML);
  assert(englishCards === expectedCellCount, `en Cell filter mismatch: cards=${englishCards}`);
  const enHtml = nodes.classicGrid.innerHTML;
  assert(enHtml.includes('Cell (main journal)'), 'en source badge missing');
  assert(enHtml.includes('Original research') || enHtml.includes('Review') || enHtml.includes('Method'), 'en kind badge missing');
  assert(enHtml.includes('Open DOI / publisher page'), 'en DOI link copy missing');
  assert(enHtml.includes('Cell'), 'en Cell cards missing');
  assert(enHtml.includes('Telomere') || enHtml.includes('telomere') || enHtml.includes('Telomerase'), 'en Cell titles missing');
  assert(!nodes.classicCount.innerHTML.includes('篇'), `en count copy still Chinese: ${nodes.classicCount.innerHTML}`);
  assert(nodes.classicCount.innerHTML.includes('papers'), 'en filtered count copy missing');
  assert(nodes.classicFilters.innerHTML.includes('All'), 'en filter labels missing');
  assert(nodes.classicFilters.innerHTML.includes('Cell (main journal)'), 'en filter label for Cell missing');
  assert(nodes.classicFilters.innerHTML.includes('data-source="Cell 正刊"'), 'canonical filter key changed');

  // The "All" view in English must translate topics and notes as well.
  nodes.classicFilters.click({ target: { closest: () => ({ dataset: { source: '全部' } }) } });
  const enAllHtml = nodes.classicGrid.innerHTML;
  assert(count(/class="classic-card"/g, enAllHtml) === expectedCount, 'en All view card count mismatch');
  assert(enAllHtml.includes('Uses an experimental system to show how gene duplication'), 'en classic note missing');
  assert(enAllHtml.includes('Enzyme evolution'), 'en classic topic missing');
  assert(enAllHtml.includes('Nature (main journal)'), 'en source group missing');
  assert(!enAllHtml.includes('用实验体系展示基因复制'), 'Chinese note leaked into the English view');

  // ---- back to Chinese restores the original copy ----
  EA.setLang('zh');
  nodes.classicFilters.click({ target: { closest: () => ({ dataset: { source: '全部' } }) } });
  assert(nodes.classicGrid.innerHTML.includes('用实验体系展示基因复制'), 'zh copy not restored after switching back');
  assert(count(/class="classic-card"/g, nodes.classicGrid.innerHTML) === expectedCount, 'zh All view card count mismatch after switching back');

  console.log(`PASS: ${expectedCount} cards, 6 source filters, ${expectedCount} DOI links, Cell filter returns ${expectedCellCount} cards; zh/en switching verified`);
});
