/* Research topics: aggregate classics + weekly papers under each unified topic. */
const browserNode = document.getElementById('topicsBrowser');

const T = (key, vars) => EA.t(key, vars);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function doiUrl(doi) {
  return `https://doi.org/${encodeURI(doi)}`;
}

let topics = [];
let classics = [];
let papers = [];       // current + archived weekly papers (with edition/date)
let openTopic = null;  // key of the currently expanded topic

function topicLabel(key) {
  return EA.getLang() === 'zh' ? key : (EA.v('topics', key) || key);
}

function topicDescription(topic) {
  return EA.getLang() === 'zh' ? topic.description : (topic.en_description || topic.description);
}

/** One-line summary so a reader can tell whether an entry is worth opening. */
function entryNote(item, field) {
  const raw = EA.pick(item, field) || item.summary || item.note || '';
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (text.length <= 96) return text;
  return text.slice(0, 96).trimEnd() + '…';
}

function readingRecord(item, isClassic) {
  const doi = item.doi || '';
  return {
    id: isClassic ? (doi || item.title) : (item.id || doi || item.title),
    title: item.title || '',
    cn: item.cn || item.title || '',
    authors: item.authors || '',
    journal: item.journal || '',
    date: isClassic ? (item.year ? String(item.year) : '') : (item.date || ''),
    type: item.type || '',
    doi,
    url: doi ? doiUrl(doi) : (item.url || ''),
    topic: item.topic || '',
    topicMap: isClassic ? 'classicTopics' : 'topics',
    summary: isClassic ? (EA.pick(item, 'note') || '') : (item.summary || ''),
    why: item.why || '',
    evidence: item.evidence || '',
    audience: item.audience || '',
    verification: item.verification || '',
    minutes: item.minutes || 0,
    edition: item.edition || null,
    en: item.en || null,
  };
}

/**
 * Title for one entry. Classic records carry a single English `title` (they come
 * from the classics library and have no `cn` field), so `EA.paperTitle` — which
 * returns `item.cn` in Chinese — would render "undefined" for them.
 */
function itemTitle(item, isClassic) {
  if (isClassic) return escapeHtml(item.title || '');
  return escapeHtml(EA.paperTitle(item) || item.title || '');
}

function renderItemRow(item, isClassic) {
  const record = readingRecord(item, isClassic);
  EA.reading.register(record);
  const note = entryNote(item, isClassic ? 'note' : 'summary');
  return `
    <li class="topic-item">
      <span class="topic-item-year">${isClassic ? item.year : item.date}</span>
      <div class="topic-item-main">
        <a href="${doiUrl(item.doi)}" target="_blank" rel="noopener">${itemTitle(item, isClassic)} ↗</a>
        <span class="topic-item-meta">${escapeHtml(item.authors)} · ${escapeHtml(item.journal)}</span>
        ${note ? `<p class="topic-item-note">${escapeHtml(note)}</p>` : ''}
        <span class="topic-item-actions">${EA.reading.actionButtons(record, true)}${EA.reading.quickButton(record)}</span>
      </div>
    </li>`;
}

function renderTopicClassics(topicKey) {
  const items = classics.filter(item => (item.topics || []).includes(topicKey));
  if (!items.length) return '';
  return `
    <div class="topic-group">
      <h4>${T('topics_classics')}</h4>
      <ul class="topic-item-list">
        ${items.map(item => renderItemRow(item, true)).join('')}
      </ul>
    </div>`;
}

function renderTopicPapers(topicKey) {
  const items = papers.filter(item => (item.topics || []).includes(topicKey));
  if (!items.length) return '';
  return `
    <div class="topic-group">
      <h4>${T('topics_weekly')}</h4>
      <ul class="topic-item-list">
        ${items.map(item => renderItemRow(item, false)).join('')}
      </ul>
    </div>`;
}

function renderTopics() {
  browserNode.innerHTML = topics.map((topic, index) => {
    const isOpen = topic.key === openTopic;
    const count = topic.total;
    return `
      <article class="topic-card${isOpen ? ' open' : ''}" data-topic="${escapeHtml(topic.key)}" id="topic-${encodeURIComponent(topic.key)}">
        <button type="button" class="topic-card-head" aria-expanded="${isOpen}" aria-controls="topic-body-${index}">
          <small>${String(index + 1).padStart(2, '0')}</small>
          <div class="topic-card-title">
            <h2>${escapeHtml(topicLabel(topic.key))}</h2>
            <p>${escapeHtml(topicDescription(topic))}</p>
          </div>
          <span class="topic-card-count">${count}</span>
          <span class="topic-card-chevron" aria-hidden="true">${isOpen ? '−' : '+'}</span>
        </button>
        ${isOpen ? `<div class="topic-card-body" id="topic-body-${index}">
          ${renderTopicClassics(topic.key)}
          ${renderTopicPapers(topic.key)}
          ${count === 0 ? `<p class="topic-empty">${T('topics_empty')}</p>` : ''}
        </div>` : ''}
      </article>`;
  }).join('');
}

/**
 * Mirror the open topic into the URL so a single topic can be shared. Replaces
 * rather than pushes, since the card grid is one page and back should leave the
 * page, not step through every card the reader opened.
 */
function syncUrlTopic() {
  if (!window.history || !window.history.replaceState) return;
  let url;
  try {
    url = new URL(location.href);
  } catch (error) {
    return;
  }
  if (openTopic) {
    url.searchParams.set('topic', openTopic);
  } else {
    url.searchParams.delete('topic');
  }
  const next = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams : '') + url.hash;
  if (next !== location.pathname + location.search + location.hash) {
    history.replaceState(null, '', next);
  }
}

/** ?topic=<key> lets a link open straight onto one expanded topic. */
function requestedTopic() {
  const value = new URLSearchParams(location.search).get('topic');
  if (!value) return null;
  const match = topics.find(topic => topic.key === value || topic.key.toLowerCase() === value.toLowerCase());
  return match ? match.key : null;
}

function focusTopic(key) {
  const node = document.getElementById('topic-' + encodeURIComponent(key));
  if (node) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

browserNode.addEventListener('click', event => {
  const head = event.target.closest('.topic-card-head');
  if (!head) return;
  const card = head.closest('.topic-card');
  const key = card.dataset.topic;
  openTopic = (openTopic === key) ? null : key;
  syncUrlTopic();
  renderTopics();
  if (openTopic) focusTopic(openTopic);
});

EA.onChange(() => { if (topics.length) renderTopics(); });

// Button state inside the expanded list follows the shared reading list.
EA.reading.onChange(() => { if (topics.length) renderTopics(); });

Promise.all([
  fetch('data/topics.json').then(r => r.json()),
  fetch('data/classics.json').then(r => r.json()),
  fetch('data/papers.json').then(r => r.json()),
  fetch('data/editions.json').then(r => r.json()).catch(() => null),
]).then(([topicsData, classicsData, papersData, manifest]) => {
  topics = topicsData.topics;
  classics = classicsData.items;
  papers = papersData.items;

  // include archived weekly editions so a topic spans current + past weeks
  if (manifest && Array.isArray(manifest.editions)) {
    const historyPaths = manifest.editions
      .map(entry => entry.path)
      .filter(path => path && path.startsWith('data/history/'));
    return Promise.all(historyPaths.map(path => fetch(path).then(r => r.json()).catch(() => null)));
  }
  return [];
}).then(historyData => {
  for (const data of historyData) {
    if (data && Array.isArray(data.items)) papers.push(...data.items);
  }
  // sort weekly papers by date descending
  papers.sort((a, b) => (a.date < b.date ? 1 : -1));
  openTopic = requestedTopic();
  renderTopics();
  if (openTopic) focusTopic(openTopic);
}).catch(error => {
  console.error('研究专题载入失败', error);
  browserNode.innerHTML = `<p class="empty-state">${T('topics_error')}</p>`;
});
