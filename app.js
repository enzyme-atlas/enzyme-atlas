/**
 * Homepage runtime: current edition, featured picks, full intake and the past
 * edition grid.
 *
 * The reading list, its buttons and the record detail dialog live in
 * reading-list.js so every page shares one implementation — see EA.reading.
 */
let papers = [];
let editionObservations = [];
let currentEdition = null;
let editionManifest = null;
const T = (key, vars) => EA.t(key, vars);
const typeLabel = type => EA.typeLabel(type);
const editionLabel = num => String(num).padStart(2, '0');

function labels(item) { return EA.pickList(item, 'labels').map(label => `<span class="recommend-label">${label}</span>`).join(''); }

function featureCard(item) {
  const type = typeLabel(item.type);
  return `<article class="feature-card"><div class="card-meta"><span>${EA.v('topics', item.topic)} · ${type}</span><span>${T('minutes_short', { n: item.minutes })}</span></div><h3>${EA.paperTitle(item)}</h3><p class="card-summary">${EA.pick(item, 'summary')}</p><p class="card-why"><b>${T('card_why')}</b>${EA.pick(item, 'why')}</p><div class="card-labels">${labels(item)}</div><p class="card-audience">${T('card_audience_prefix')}${EA.pick(item, 'audience')}</p><div class="card-actions"><span>${EA.reading.quickButton(item)}${EA.reading.doiLink(item)}</span>${EA.reading.starButton(item)}</div></article>`;
}

function renderEdition() {
  if (!currentEdition) return;
  const featuredCount = papers.filter(item => item.featured).length;
  const range = `${currentEdition.periodStart.slice(5).replace('-', '.')}–${currentEdition.periodEnd.slice(5).replace('-', '.')}`;
  document.getElementById('editionDate').textContent = T('edition_date', {
    num: editionLabel(currentEdition.edition),
    date: currentEdition.updatedAt.replaceAll('-', '.'),
  });
  document.getElementById('editionSummary').innerHTML = T('edition_summary_html', {
    total: papers.length,
    featured: featuredCount,
    range,
  });
  document.getElementById('featuredTitle').textContent = T('featured_title', { n: featuredCount });
}

function renderFeatured() { document.getElementById('featuredGrid').innerHTML = papers.filter(item => item.featured).slice(0, 5).map(featureCard).join(''); }

function renderObservations() {
  const fallback = [[T('obs_f1'), T('obs_f1_body')], [T('obs_f2'), T('obs_f2_body')], [T('obs_f3'), T('obs_f3_body')]];
  const localized = editionObservations.length
    ? editionObservations.map((item, index) => {
        const en = (currentEdition && currentEdition.observationsEn) ? currentEdition.observationsEn[index] : null;
        return (EA.getLang() === 'en' && en) ? en : item;
      })
    : fallback;
  document.getElementById('observationGrid').innerHTML = localized.map((item, index) => `<article><span>0${index + 1}</span><h3>${item[0]}</h3><p>${item[1]}</p></article>`).join('');
}

function renderPapers() {
  const hidden = EA.reading.state.hidden.map(record => record.id);
  const list = [...papers].filter(item => !hidden.includes(item.id)).sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById('resultCount').innerHTML = T('intake_count_html', { total: papers.length, shown: list.length, hidden: hidden.length });
  document.getElementById('paperList').innerHTML = list.map(item => `<article class="paper-row"><span class="paper-date">${item.date}</span><div class="paper-main"><a class="paper-title paper-title-link" href="${item.url}" target="_blank" rel="noopener">${EA.paperTitle(item)} ↗</a><div class="paper-sub">${item.authors} · ${item.journal}</div><div class="row-labels"><span class="topic-label">${EA.v('topics', item.topic)}</span>${labels(item)}</div></div><div class="paper-score"><b>${item.minutes}</b><span>${T('minutes_unit')}</span></div><div class="read-state">${EA.reading.actionButtons(item, true)}${hideButton(item)}</div></article>`).join('') || `<p class="empty-state">${T('empty_intake')}</p>`;
}

/** Hide keeps using the shared list state, but goes through the record registry. */
function hideButton(item) {
  EA.reading.register(item);
  return `<button type="button" class="muted-button" onclick="EA.reading.toggle('${item.id}','hidden')">${T('act_hide')}</button>`;
}

function renderEditions() {
  const grid = document.getElementById('editionGrid');
  const note = document.getElementById('editionsNote');
  if (!grid) return;
  const all = (editionManifest && editionManifest.editions) || [];
  const current = currentEdition ? currentEdition.edition : null;
  const past = all.filter(entry => entry.edition !== current);
  if (!past.length) {
    grid.innerHTML = '';
    if (note) note.hidden = false;
    return;
  }
  if (note) note.hidden = true;
  grid.innerHTML = past.map(entry => `
    <a class="edition-card" href="archive.html?e=${entry.edition}">
      <div class="edition-card-top"><span class="edition-number">${editionLabel(entry.edition)}</span><span class="edition-tag">${T('archive_open')}</span></div>
      <p class="edition-card-meta">${T('editions_card_meta', { date: entry.updatedAt.replaceAll('-', '.'), num: editionLabel(entry.edition) })}</p>
      <h3>${EA.pick(entry, 'headline') || entry.updatedAt}</h3>
      <p class="edition-card-counts">${T('editions_card_counts', { total: entry.itemCount, featured: entry.featuredCount })}</p>
    </a>
  `).join('');
}

/** Homepage quick look: register the full record so the dialog shows every field. */
function openPaper(id) {
  const item = papers.find(entry => entry.id === id);
  if (item) EA.reading.register(item);
  EA.reading.openDetail(id);
}

function renderAll() { renderFeatured(); renderObservations(); renderPapers(); }

async function init() {
  try {
    const [papersResponse, manifestResponse] = await Promise.all([
      fetch('data/papers.json'),
      fetch('data/editions.json'),
    ]);
    if (!papersResponse.ok) throw new Error('data unavailable');
    const data = await papersResponse.json();
    papers = data.items;
    editionObservations = data.observations || [];
    currentEdition = data;
    if (manifestResponse.ok) editionManifest = await manifestResponse.json();
    renderEdition();
  } catch (error) {
    document.getElementById('resultCount').textContent = T('data_error');
    return;
  }
  renderAll();
  renderEditions();
}

document.getElementById('openSaved').addEventListener('click', () => EA.reading.openSavedList());

// Re-render the lists that show button state, and the panel if it is open.
EA.reading.onChange(() => {
  renderFeatured();
  renderPapers();
  const dialog = document.getElementById('savedDialog');
  if (dialog && dialog.open) EA.reading.renderSaved();
});

EA.onChange(() => {
  renderEdition();
  renderAll();
  renderEditions();
  const dialog = document.getElementById('savedDialog');
  if (dialog && dialog.open) EA.reading.renderSaved();
});

init();
