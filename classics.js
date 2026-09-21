/* Canonical source groups (Chinese keys are also the data vocabulary and filter keys). */
const sourceOrder = ['全部', 'Nature 正刊', 'Science 正刊', 'Cell 正刊', 'Nature 子刊', '其他精选'];
const countNode = document.getElementById('classicCount');
const gridNode = document.getElementById('classicGrid');
const statsNode = document.getElementById('classicSourceStats');
const filtersNode = document.getElementById('classicFilters');

const T = (key, vars) => EA.t(key, vars);
const displaySource = source => (source === '全部' ? T('classics_filter_all') : EA.v('sourceGroups', source));

let classics = [];
let activeSource = '全部';

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function doiUrl(doi) {
  return `https://doi.org/${encodeURI(doi)}`;
}

function renderStats() {
  const counts = Object.fromEntries(sourceOrder.slice(1).map(source => [
    source,
    classics.filter(item => item.sourceGroup === source).length
  ]));
  statsNode.innerHTML = sourceOrder.slice(1).map(source => `
    <div class="classic-source-stat">
      <strong>${counts[source]}</strong>
      <span>${escapeHtml(displaySource(source))}</span>
    </div>
  `).join('');
}

function renderFilters() {
  filtersNode.innerHTML = sourceOrder.map(source => {
    const selected = source === activeSource;
    return `<button type="button" class="classic-filter${selected ? ' active' : ''}" data-source="${escapeHtml(source)}" aria-pressed="${selected}">${escapeHtml(displaySource(source))}</button>`;
  }).join('');
}

/** Classic record in the shape the shared reading list stores. */
function readingRecord(item) {
  return {
    id: item.doi || item.title,
    title: item.title,
    cn: item.title,
    authors: item.authors,
    journal: item.journal,
    date: item.year ? String(item.year) : '',
    doi: item.doi,
    url: doiUrl(item.doi),
    topic: item.topic,
    topicMap: 'classicTopics',
    summary: EA.pick(item, 'note'),
    en: item.en || null,
  };
}

function renderGrid() {
  const visible = activeSource === '全部'
    ? classics
    : classics.filter(item => item.sourceGroup === activeSource);
  const topicCount = new Set(visible.map(item => item.topic)).size;
  countNode.innerHTML = activeSource === '全部'
    ? T('classics_count_all', { n: classics.length, m: topicCount })
    : T('classics_count_filter', { source: escapeHtml(displaySource(activeSource)), n: visible.length, m: topicCount });
  gridNode.innerHTML = visible.map(item => {
    const record = readingRecord(item);
    EA.reading.register(record);
    return `
    <article class="classic-card">
      <div class="classic-meta"><span>${escapeHtml(EA.classicTopic(item))}</span><span>${item.year}</span></div>
      <div class="classic-badges"><span class="source-badge">${escapeHtml(EA.sourceGroup(item))}</span><span>${escapeHtml(EA.kind(item))}</span></div>
      <h2>${escapeHtml(item.title)}</h2>
      <p class="classic-note">${escapeHtml(EA.pick(item, 'note'))}</p>
      <div class="classic-actions">${EA.reading.actionButtons(record, true)}${EA.reading.quickButton(record)}</div>
      <div class="classic-bottom">
        <div class="classic-citation">${escapeHtml(item.authors)} · ${escapeHtml(item.journal)}</div>
        <a href="${doiUrl(item.doi)}" target="_blank" rel="noopener">${T('classics_doi_link')}</a>
      </div>
    </article>`;
  }).join('');
}

filtersNode.addEventListener('click', event => {
  const button = event.target.closest('button[data-source]');
  if (!button) return;
  activeSource = button.dataset.source;
  renderFilters();
  renderGrid();
});

EA.onChange(() => {
  if (!classics.length) return;
  renderStats();
  renderFilters();
  renderGrid();
});

// Save/quick-look buttons change state in place; re-render the grid so the
// button labels and active styling follow the shared reading list.
EA.reading.onChange(() => {
  if (classics.length) renderGrid();
});

fetch('data/classics.json')
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    classics = [...data.items].sort((a, b) => {
      const sourceDelta = sourceOrder.indexOf(a.sourceGroup) - sourceOrder.indexOf(b.sourceGroup);
      if (sourceDelta) return sourceDelta;
      const yearDelta = a.year - b.year;
      return yearDelta || a.title.localeCompare(b.title, 'en');
    });
    renderStats();
    renderFilters();
    renderGrid();
  })
  .catch(error => {
    console.error('经典论文载入失败', error);
    countNode.textContent = T('classics_error');
  });
