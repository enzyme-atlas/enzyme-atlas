const params = new URLSearchParams(location.search);
const initial = params.get('q') || '';
const query = document.getElementById('query');
const headerQuery = document.getElementById('headerQuery');
const title = document.getElementById('searchTitle');
const note = document.getElementById('searchNote');
const results = document.getElementById('searchResults');
query.value = initial;
headerQuery.value = initial;

/** Every searchable record, normalised to one shape (see normalise* below). */
let records = [];
let currentEdition = null;
let poolStats = { weekly: 0, past: 0, classic: 0 };

const T = (key, vars) => EA.t(key, vars);

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

/**
 * Weekly papers (data/papers.json and every archived edition) and the classics
 * library (data/classics.json) use different field names: date/summary for the
 * former, year/note for the latter, and the two draw from separate topic
 * vocabularies. Both are folded into one record shape here, so the rest of this
 * module never has to care which collection a result came from.
 */
function normaliseWeekly(record, edition) {
  return {
    id: record.id || record.doi || '',
    scope: 'weekly',
    edition,
    title: record.title || '',
    cn: record.cn || record.title || '',
    authors: record.authors || '',
    journal: record.journal || '',
    date: record.date || '',
    topic: record.topic || '',
    topicMap: 'topics',
    type: record.type || '',
    doi: record.doi || '',
    url: record.url || (record.doi ? 'https://doi.org/' + record.doi : ''),
    summary: record.summary || '',
    why: record.why || '',
    evidence: record.evidence || '',
    audience: record.audience || '',
    verification: record.verification || '',
    labels: record.labels || [],
    topics: [],
    sourceGroup: '',
    kind: '',
    note: '',
    en: record.en || null,
  };
}

function normaliseClassic(record) {
  const doi = record.doi || '';
  const classicNote = record.note || '';
  // Classics carry an English-only title and a single `note`. Mirror them into
  // cn/summary (and the inline `en` object) so the shared renderer and
  // EA.pick() work in both languages without special-casing the card.
  const en = Object.assign({}, record.en || {});
  if (!en.summary) en.summary = (record.en && record.en.note) || classicNote;
  return {
    id: doi,
    scope: 'classic',
    edition: null,
    title: record.title || '',
    cn: record.title || '',
    authors: record.authors || '',
    journal: record.journal || '',
    date: record.year ? String(record.year) : '',
    topic: record.topic || '',
    topicMap: 'classicTopics',
    type: '',
    doi,
    url: doi ? 'https://doi.org/' + doi : '',
    summary: classicNote,
    why: '',
    evidence: '',
    audience: '',
    verification: '',
    labels: [],
    topics: Array.isArray(record.topics) ? record.topics : [],
    sourceGroup: record.sourceGroup || '',
    kind: record.kind || '',
    note: classicNote,
    en,
  };
}

/** Topic label through the correct vocabulary (weekly vs classic topics). */
function topicLabel(record) {
  return record.topicMap === 'classicTopics' ? EA.v('classicTopics', record.topic) : EA.v('topics', record.topic);
}

/** Where a result came from: this week, a past edition, or the classics library. */
function scopeLabel(record) {
  if (record.scope === 'classic') return T('search_scope_classic');
  if (record.edition === currentEdition) return T('search_scope_current');
  return T('search_scope_past', { num: String(record.edition || '').padStart(2, '0') });
}

/** Searchable text for a record: canonical fields plus their English counterparts. */
function haystack(record) {
  const base = ['id', 'title', 'cn', 'authors', 'journal', 'date', 'topic', 'type', 'doi', 'url', 'summary', 'why', 'evidence', 'audience', 'verification', 'note', 'sourceGroup', 'kind']
    .map(key => record[key] || '');
  const labels = (record.labels || []).map(label => `${label} ${EA.v('labels', label)}`);
  const topicTerms = [record.topic, EA.v('topics', record.topic), EA.v('classicTopics', record.topic)]
    .concat(record.topics || [])
    .concat((record.topics || []).map(name => EA.v('topics', name)));
  const english = record.en
    ? Object.keys(record.en).map(key => record.en[key]).filter(value => typeof value === 'string')
    : [];
  return base.concat(labels, topicTerms, english).join(' ').toLowerCase();
}

/** Every whitespace-separated term must appear (AND), so extra words narrow the hit. */
function matches(record, terms) {
  const text = haystack(record);
  return terms.every(term => text.includes(term));
}

function poolNote() {
  return T('search_pool_note', {
    weekly: poolStats.weekly,
    past: poolStats.past,
    classic: poolStats.classic,
    total: records.length,
  });
}

/**
 * Without a query the result list is the entire pool (100+ records, an 11k-pixel
 * wall of text), so the idle view previews the first page instead and asks for a
 * keyword. Any real query always shows every hit.
 *
 * `EA_SEARCH_PREVIEW_LIMIT` lets the Node contract test lift the cap: pool
 * completeness is only observable when every record is rendered.
 */
const PREVIEW_LIMIT = Number.isFinite(globalThis.EA_SEARCH_PREVIEW_LIMIT)
  ? globalThis.EA_SEARCH_PREVIEW_LIMIT
  : 30;

function render(value) {
  const clean = value.trim();
  const terms = clean.toLowerCase().split(/\s+/).filter(Boolean);
  const matched = terms.length ? records.filter(record => matches(record, terms)) : records;
  const collapsed = !terms.length && matched.length > PREVIEW_LIMIT;
  const list = collapsed ? matched.slice(0, PREVIEW_LIMIT) : matched;
  title.textContent = clean ? T('search_results_title', { q: clean }) : T('search_title');
  note.textContent = clean
    ? T('search_note', { n: matched.length })
    : (collapsed
      ? T('search_preview_note', { shown: list.length, total: matched.length })
      : poolNote());
  results.innerHTML = list.map(record => {
    EA.reading.register(record);
    return `<article class="search-row"><small>${escapeHtml(record.date)}</small><div><h2><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener">${escapeHtml(EA.paperTitle(record))} ↗</a></h2><p>${escapeHtml(record.authors)} · ${escapeHtml(record.journal)} · DOI: ${escapeHtml(record.doi)}</p><span class="topic-item-actions">${EA.reading.actionButtons(record, true)}${EA.reading.quickButton(record)}</span></div><span>${escapeHtml(topicLabel(record))}<em class="search-scope">${escapeHtml(scopeLabel(record))}</em></span></article>`;
  }).join('')
    || `<p class="search-note">${T('search_empty')}</p>`;
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Build the pool from every record the site publishes: the current edition, the
 * classics library, and every archived edition. Past editions are discovered
 * through data/editions.json, which the publisher rebuilds on each release, so
 * future editions enter the pool automatically without editing this file.
 */
async function loadPool() {
  const pool = [];
  const seen = new Set();
  const push = record => {
    const key = (record.doi || record.id || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    pool.push(record);
  };

  const response = await fetch('data/papers.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const current = await response.json();
  currentEdition = current.edition;
  (current.items || []).forEach(item => push(normaliseWeekly(item, current.edition)));
  const weeklyCount = pool.length;

  try {
    const classics = await fetchJson('data/classics.json');
    (classics.items || []).forEach(item => push(normaliseClassic(item)));
  } catch (error) {
    console.error('经典论文载入失败', error);
  }
  const classicCount = pool.length - weeklyCount;

  let pastCount = 0;
  try {
    const manifest = await fetchJson('data/editions.json');
    for (const entry of manifest.editions || []) {
      if (entry.path === 'data/papers.json') continue;
      try {
        const data = await fetchJson(entry.path);
        const before = pool.length;
        (data.items || []).forEach(item => push(normaliseWeekly(item, entry.edition)));
        pastCount += pool.length - before;
      } catch (error) {
        console.error('往期数据载入失败', entry.path, error);
      }
    }
  } catch (error) {
    console.error('期号清单载入失败', error);
  }

  poolStats = { weekly: weeklyCount, past: pastCount, classic: classicCount };
  return pool;
}

document.getElementById('searchForm').onsubmit = event => {
  event.preventDefault();
  const q = (query.value || '').trim();
  history.replaceState(null, '', '?q=' + encodeURIComponent(q));
  render(q);
  // 记录站内搜索词（无个人身份信息，仅上报搜索词本身）
  if (q && window.goatcounter) {
    window.goatcounter.count({ path: 'search', event: true, title: q.slice(0, 120) });
  }
};

EA.onChange(() => render(query.value));

// Save/quick-look buttons change state in place; re-render so labels follow.
EA.reading.onChange(() => {
  if (records.length) render(query.value);
});

loadPool()
  .then(pool => { records = pool; render(initial); })
  .catch(error => { console.error('文献数据载入失败', error); note.textContent = T('search_error'); });
