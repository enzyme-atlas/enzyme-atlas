/**
 * Shared site shell, loaded on every page.
 *
 * Two jobs, both of which used to be homepage-only:
 *   1. The reading list + record detail dialog. Saving used to live inside
 *      app.js, so the reading list and the quick-look dialog existed only on the
 *      homepage — the three pages with the most papers (classics library,
 *      research topics, search results) could not save anything.
 *   2. Shell furniture every page needs: the header reading-list button, the
 *      nav overflow fade, and re-seating in-page deep links after the async
 *      content has grown the document.
 *
 * The filename is historical — it started as the reading list alone. If a third
 * shell concern shows up, split the shell parts into their own module.
 *
 * Storage shape (localStorage `enzyme-atlas-reading-state`):
 *   { saved: [record], later: [record], read: [record], hidden: [record] }
 * where `record` is a self-contained snapshot — id, title, cn, authors,
 * journal, date, doi, url and the optional review fields. Records are snapshots
 * rather than bare ids on purpose: a paper saved from the classics library must
 * still render in the reading list on the homepage, whose data file does not
 * contain it. Older builds stored bare id strings; those are migrated on read.
 *
 * Exposed as `window.EA.reading`.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'enzyme-atlas-reading-state';
  const KINDS = ['saved', 'later', 'read', 'hidden'];

  /** Live lookup for records referenced by inline handlers (never serialised). */
  const registry = new Map();
  const listeners = [];

  const T = (key, vars) => (window.EA ? window.EA.t(key, vars) : key);

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[char]));
  }

  /** Coerce any data item (weekly paper or classic) into a storable record. */
  function recordFrom(item) {
    if (!item) return null;
    if (typeof item === 'string') return { id: item, title: item, cn: item };
    const doi = item.doi || '';
    const id = item.id || doi || item.title || '';
    if (!id) return null;
    return {
      id: String(id),
      title: item.title || '',
      cn: item.cn || item.title || '',
      authors: item.authors || '',
      journal: item.journal || '',
      date: item.date || (item.year ? String(item.year) : ''),
      type: item.type || '',
      kind: item.kind || '',
      doi,
      url: item.url || (doi ? 'https://doi.org/' + doi : ''),
      topic: item.topic || '',
      topicMap: item.topicMap === 'classicTopics' ? 'classicTopics' : 'topics',
      summary: item.summary || item.note || '',
      why: item.why || '',
      evidence: item.evidence || '',
      audience: item.audience || '',
      verification: item.verification || '',
      minutes: item.minutes || 0,
      scope: item.scope || '',
      edition: item.edition || null,
      en: item.en && typeof item.en === 'object' ? item.en : null,
    };
  }

  function readState() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (error) {
      raw = {};
    }
    const state = {};
    KINDS.forEach((kind) => {
      const list = Array.isArray(raw[kind]) ? raw[kind] : [];
      const byId = new Map();
      list.forEach((entry) => {
        const record = recordFrom(entry);
        if (record) byId.set(record.id, record);
      });
      state[kind] = [...byId.values()];
    });
    return state;
  }

  const state = readState();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* storage unavailable: the list simply does not persist */
    }
    const badge = document.getElementById('savedBadge');
    if (badge) badge.textContent = String(count());
    const button = document.getElementById('openSaved');
    if (button) button.setAttribute('aria-label', T('reading_list') + ' (' + count() + ')');
  }

  function count() {
    return state.saved.length + state.later.length;
  }

  function isActive(id, kind) {
    return Boolean(state[kind]) && state[kind].some((record) => record.id === id);
  }

  function findRecord(id) {
    if (registry.has(id)) return registry.get(id);
    for (const kind of KINDS) {
      const hit = state[kind].find((record) => record.id === id);
      if (hit) return hit;
    }
    return { id, title: id, cn: id };
  }

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.error('reading list listener failed', error);
      }
    });
  }

  /**
   * Move a record into `kind`, or clear it from every list when kind is 'clear'.
   * Toggling the active kind removes it again, so the buttons work as switches.
   */
  function move(record, kind) {
    const entry = recordFrom(record);
    if (!entry) return;
    registry.set(entry.id, entry);
    const alreadyActive = kind !== 'clear' && isActive(entry.id, kind);
    KINDS.forEach((key) => {
      state[key] = state[key].filter((item) => item.id !== entry.id);
    });
    if (kind !== 'clear' && !alreadyActive) state[kind].push(entry);
    persist();
    emit();
  }

  function toggle(id, kind) {
    move(findRecord(id), kind);
  }

  function clearAll() {
    KINDS.forEach((key) => { state[key] = []; });
    persist();
    emit();
  }

  /** Save/later/read buttons — same markup app.js used, now shared. */
  function actionButtons(record, compact = false) {
    const entry = recordFrom(record);
    if (!entry) return '';
    registry.set(entry.id, entry);
    const id = escapeHtml(entry.id);
    const button = (kind, onLabel, offLabel) => {
      const active = isActive(entry.id, kind);
      return '<button type="button" class="action-button' + (active ? ' active' : '') +
        '" onclick="EA.reading.toggle(\'' + id + '\',\'' + kind + '\')">' +
        (active ? onLabel : offLabel) + '</button>';
    };
    return button('saved', T('act_saved'), T('act_save')) +
      button('later', T('act_later_on'), T('act_later')) +
      (compact ? '' : button('read', T('act_read_on'), T('act_read')));
  }

  /** Round star button used on the homepage feature cards. */
  function starButton(record) {
    const entry = recordFrom(record);
    if (!entry) return '';
    registry.set(entry.id, entry);
    const active = isActive(entry.id, 'saved');
    return '<button type="button" class="save-btn' + (active ? ' saved' : '') +
      '" aria-label="' + (active ? T('act_saved') : T('act_save')) +
      '" onclick="EA.reading.toggle(\'' + escapeHtml(entry.id) + '\',\'saved\')">' +
      (active ? '★' : '☆') + '</button>';
  }

  /** Compact "quick look" button; the dialog itself is shared below. */
  function quickButton(record) {
    const entry = recordFrom(record);
    if (!entry) return '';
    registry.set(entry.id, entry);
    return '<button type="button" class="read-link" onclick="EA.reading.openDetail(\'' +
      escapeHtml(entry.id) + '\')">' + T('act_quick') + '</button>';
  }

  function doiLink(record, extraClass = 'source-link') {
    const entry = recordFrom(record);
    if (!entry || !entry.url) return '';
    return '<a class="' + extraClass + '" href="' + escapeHtml(entry.url) +
      '" target="_blank" rel="noopener">' + T('act_doi') + '</a>';
  }

  /* ---------------------------------------------------------------- dialogs */

  function field(record, labelKey, value) {
    if (!value) return '';
    return '<div><h3>' + T(labelKey) + '</h3><p>' + escapeHtml(value) + '</p></div>';
  }

  /** Open the detail dialog. Renders whichever review fields the record has. */
  function openDetail(id) {
    const record = findRecord(id);
    const dialog = document.getElementById('paperDialog');
    const content = document.getElementById('dialogContent');
    if (!dialog || !content) return;
    const title = window.EA ? window.EA.paperTitle(record) : (record.cn || record.title);
    const topic = record.topic && window.EA
      ? window.EA.v(record.topicMap === 'classicTopics' ? 'classicTopics' : 'topics', record.topic)
      : '';
    const type = record.type && window.EA ? window.EA.typeLabel(record.type) : '';
    const meta = [topic, type, record.minutes ? T('min_scan', { n: record.minutes }) : '']
      .filter(Boolean).join(' · ');
    const grid = [
      field(record, 'q_summary', record.summary),
      field(record, 'q_why', record.why),
      field(record, 'q_evidence', record.evidence),
      field(record, 'q_audience', record.audience),
    ].join('');
    content.innerHTML =
      '<div class="modal-copy quick-card">' +
      '<p class="eyebrow">' + escapeHtml(meta) + '</p>' +
      '<h2>' + escapeHtml(title) + '</h2>' +
      '<p class="detail-meta">' + escapeHtml(record.title) + '<br>' +
      escapeHtml([record.authors, record.journal, record.date].filter(Boolean).join(' · ')) + '</p>' +
      (grid ? '<div class="quick-grid">' + grid + '</div>' : '') +
      (record.verification ? '<p class="verification-note"><b>' + T('q_verification') + '</b>' +
        escapeHtml(record.verification) + '</p>' : '') +
      '<div class="detail-actions">' + actionButtons(record) + doiLink(record, 'primary-button') + '</div>' +
      '</div>';
    dialog.showModal();
  }

  function readingSection(label, kind) {
    const records = state[kind];
    const body = records.length
      ? records.map((record) => {
        const title = window.EA ? window.EA.paperTitle(record) : (record.cn || record.title);
        const sub = [record.journal, record.date].filter(Boolean).join(' · ');
        const doi = record.url
          ? '<a href="' + escapeHtml(record.url) + '" target="_blank" rel="noopener">DOI ↗</a>'
          : '';
        return '<div class="saved-item"><span><b>' + escapeHtml(title) + '</b>' +
          '<small>' + escapeHtml(sub) + '</small></span><span>' + doi +
          '<button type="button" onclick="EA.reading.move(\'' + escapeHtml(record.id) +
          '\',\'clear\')">' + T('act_remove') + '</button></span></div>';
      }).join('')
      : '<p>' + T('list_empty') + '</p>';
    return '<section class="reading-section"><h3>' + label +
      ' <small>' + records.length + '</small></h3>' + body + '</section>';
  }

  /** BibTeX of everything saved; exported as a .bib download. */
  function exportSaved() {
    const records = state.saved;
    const notice = document.getElementById('exportNotice');
    if (!records.length) {
      if (notice) notice.hidden = false;
      return;
    }
    if (notice) notice.hidden = true;
    const bib = (item) => '@article{' + item.id + ',\n  title={' + item.title +
      '},\n  author={' + item.authors + '},\n  journal={' + item.journal +
      '},\n  year={' + String(item.date).slice(0, 4) + '},\n  doi={' + item.doi +
      '},\n  url={' + item.url + '}\n}';
    const blob = new Blob([records.map(bib).join('\n\n')], { type: 'application/x-bibtex' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'enzyme-atlas-reading-list.bib';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function renderSaved() {
    const body = document.getElementById('savedList');
    if (!body) return;
    const disabled = state.saved.length ? '' : ' disabled';
    body.innerHTML =
      '<button type="button" class="export-button" onclick="EA.reading.exportSaved()"' + disabled + '>' +
      T('export_bibtex') + '</button>' +
      '<p class="form-note" id="exportNotice" hidden>' + T('export_needs_saved') + '</p>' +
      readingSection(T('sec_saved'), 'saved') +
      readingSection(T('sec_later'), 'later') +
      readingSection(T('sec_read'), 'read') +
      readingSection(T('sec_hidden'), 'hidden');
  }

  function openSavedList() {
    renderSaved();
    const dialog = document.getElementById('savedDialog');
    if (dialog) dialog.showModal();
  }

  /**
   * Native <dialog> only closes on Esc or a form submit; clicking the backdrop
   * does nothing unless it is wired up here.
   */
  function wireBackdropClose(dialog) {
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right ||
        event.clientY < box.top || event.clientY > box.bottom;
      if (outside) dialog.close();
    });
  }

  function renderShellTexts() {
    const savedEyebrow = document.getElementById('savedEyebrow');
    if (savedEyebrow) savedEyebrow.textContent = T('saved_eyebrow');
    const savedTitle = document.getElementById('savedTitle');
    if (savedTitle) savedTitle.textContent = T('saved_title');
    document.querySelectorAll('#savedDialog .dialog-close, #paperDialog .dialog-close').forEach((button) => {
      button.setAttribute('aria-label', T('dialog_close'));
    });
  }

  /* ------------------------------------------------------------------ mount */

  function injectDialogs() {
    if (!document.getElementById('paperDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'paperDialog';
      dialog.innerHTML = '<button type="button" class="dialog-close" aria-label="' +
        T('dialog_close') + '">×</button><div id="dialogContent"></div>';
      document.body.appendChild(dialog);
      dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    }
    if (!document.getElementById('savedDialog')) {
      const dialog = document.createElement('dialog');
      dialog.id = 'savedDialog';
      dialog.innerHTML = '<button type="button" class="dialog-close" aria-label="' +
        T('dialog_close') + '">×</button><div class="modal-copy">' +
        '<p class="eyebrow" id="savedEyebrow"></p><h2 id="savedTitle"></h2>' +
        '<div id="savedList"></div></div>';
      document.body.appendChild(dialog);
      dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
    }
    ['paperDialog', 'savedDialog'].forEach((id) => {
      const dialog = document.getElementById(id);
      if (dialog && !dialog.dataset.backdropWired) {
        dialog.dataset.backdropWired = '1';
        wireBackdropClose(dialog);
      }
    });
  }

  /** Reading-list entry button, injected into the header of every page. */
  function injectButton() {
    const actions = document.querySelector('.header-actions');
    if (!actions || document.getElementById('openSaved')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button';
    button.id = 'openSaved';
    button.setAttribute('title', T('reading_list'));
    button.setAttribute('aria-label', T('reading_list'));
    button.innerHTML = '⌑<span id="savedBadge">0</span>';
    button.addEventListener('click', openSavedList);
    actions.insertBefore(button, actions.firstChild);
  }

  /**
   * The nav row scrolls horizontally on very narrow screens with the scrollbar
   * hidden, so reveal a fade over the clipped edge only while it overflows.
   */
  function syncNavOverflow() {
    const nav = document.querySelector('.main-nav');
    if (!nav) return;
    nav.classList.toggle('nav-scrollable', nav.scrollWidth > nav.clientWidth + 1);
  }

  /**
   * Re-seat an in-page deep link once the async content has finished growing.
   *
   * The homepage renders its paper lists from JSON, so the browser performs the
   * initial `#hash` scroll while the target section is still short. Every record
   * appended afterwards pushes that section further down, and the deep link ends
   * up far from its target — measured on a 390px viewport, opening
   * `index.html#method` left the section 2900px below the fold.
   *
   * Re-position a few times while the page settles, and hand control back the
   * moment the reader scrolls or interacts with anything other than an anchor.
   */
  function reseatAnchor() {
    const raw = decodeURIComponent(location.hash.slice(1));
    if (!raw) return;

    let readerTookOver = false;
    const yieldToReader = () => { readerTookOver = true; };

    window.addEventListener('wheel', yieldToReader, { passive: true, once: true });
    window.addEventListener('touchmove', yieldToReader, { passive: true, once: true });
    // Tapping an in-page link means the browser is already moving to an anchor,
    // so keep correcting; anything else counts as the reader taking over.
    window.addEventListener('pointerdown', (event) => {
      const anchor = event.target && event.target.closest && event.target.closest('a[href^="#"]');
      if (!anchor) yieldToReader();
    }, { passive: true, once: true });
    window.addEventListener('keydown', (event) => {
      if (/^(Arrow|Page|Home|End|Spacebar| )/.test(event.key)) yieldToReader();
    }, { once: true });
    // Navigating to a different anchor is a new intent: stop pulling the page
    // back to this one, otherwise a clicked section link gets yanked away
    // mid-scroll by whichever timer is still pending.
    window.addEventListener('hashchange', yieldToReader, { once: true });

    const seat = () => {
      if (readerTookOver) return;
      if (decodeURIComponent(location.hash.slice(1)) !== raw) return;
      const target = document.getElementById(raw);
      if (!target) return;
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const offset = target.getBoundingClientRect().top;
      if (Math.abs(offset - pad) < 6) return;
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto'; // bypass the site-wide smooth scrolling
      window.scrollTo(0, Math.round(window.scrollY + offset - pad));
      root.style.scrollBehavior = previous;
    };

    [80, 260, 620, 1200, 2000].forEach((delay) => setTimeout(seat, delay));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(seat);
    window.addEventListener('load', seat);
  }

  function mount() {
    injectDialogs();
    injectButton();
    renderShellTexts();
    persist();
    syncNavOverflow();
    reseatAnchor();
    window.addEventListener('resize', syncNavOverflow);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncNavOverflow);
    // Switching language redraws every page's static text; the shell strings and
    // an already-open panel belong to this module, so refresh them here.
    if (window.EA && window.EA.onChange) {
      window.EA.onChange(() => {
        renderShellTexts();
        const dialog = document.getElementById('savedDialog');
        if (dialog && dialog.open) renderSaved();
      });
    }
  }

  window.EA = window.EA || {};
  window.EA.reading = {
    KINDS,
    state,
    recordFrom,
    register(record) {
      const entry = recordFrom(record);
      if (entry) registry.set(entry.id, entry);
      return entry;
    },
    isActive,
    count,
    move,
    toggle,
    clearAll,
    actionButtons,
    starButton,
    quickButton,
    doiLink,
    openDetail,
    renderSaved,
    openSavedList,
    exportSaved,
    onChange(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    },
    mount,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
