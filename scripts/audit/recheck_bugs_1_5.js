/**
 * Strict re-verification of the five functional bugs in section 一 of
 * AUDIT-站点排查与可优化点-v1.md:
 *
 *   1. 移动端锚点被 sticky 顶栏遮住
 *   2. archive.html?e=<无效值> 死路
 *   3. 阅读清单/收藏入口只在首页有
 *   4. <dialog> 点遮罩不关闭
 *   5. 空清单点导出提示可重复堆积
 *
 * Each check goes beyond the happy path: multiple viewport widths, the full
 * `?e=` parameter matrix, both dialogs, and a cross-page save → export flow.
 *
 * Usage:
 *   python -m http.server 4321 --bind 127.0.0.1     # from the repo root
 *   node scripts/audit/recheck_bugs_1_5.js
 *
 * Env: SITE_BASE (default http://127.0.0.1:4321), PLAYWRIGHT_CORE (module path)
 * Exit code 1 when any check fails.
 */
const path = require('path');
const fs = require('fs');

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    path.join(__dirname, '..', '..', 'node_modules', 'playwright-core'),
    'C:/Users/Fan/AppData/Local/Temp/pw_test/node_modules/playwright-core',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  throw new Error('playwright-core not found; set PLAYWRIGHT_CORE to its directory');
}

const { chromium } = loadPlaywright();
const BASE = process.env.SITE_BASE || 'http://127.0.0.1:4321';
const STORAGE_KEY = 'enzyme-atlas-reading-state';

const results = [];
async function check(name, fn) {
  try {
    results.push({ ok: true, name, detail: await fn() });
  } catch (error) {
    results.push({ ok: false, name, detail: String((error && error.message) || error) });
  }
}
const assert = (cond, message) => { if (!cond) throw new Error(message); };

let browser;
const newPage = async (viewport) => {
  const context = await browser.newContext({
    viewport: viewport || { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.errors = errors;
  return page;
};

/** Smallest top edge among the section's leaf text nodes currently on screen. */
async function firstTextTop(page, id) {
  return page.evaluate((targetId) => {
    const target = document.getElementById(targetId);
    if (!target) return null;
    const bar = document.querySelector('.topbar');
    const barBottom = bar ? Math.round(bar.getBoundingClientRect().bottom) : 0;
    let minTop = Infinity;
    let sample = '';
    for (const el of target.querySelectorAll('*')) {
      if (el.children.length) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.bottom < 0 || rect.top > innerHeight) continue;
      if (rect.top < minTop) { minTop = rect.top; sample = text.slice(0, 18); }
    }
    return {
      barBottom,
      textTop: minTop === Infinity ? null : Math.round(minTop),
      sample,
      targetTop: Math.round(target.getBoundingClientRect().top),
    };
  }, id);
}

/**
 * Content renders from JSON after load, so a deep link only settles once every
 * later insert has pushed the document down. Poll until the section sits just
 * under the header instead of trusting a fixed sleep.
 */
async function waitSeated(page, id, timeout = 3500) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await firstTextTop(page, id);
    if (last && last.textTop !== null && last.textTop >= last.barBottom - 2) return last;
    await page.waitForTimeout(120);
  }
  return last;
}

(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  // ── ① 移动端锚点遮挡：多宽度 × 多锚点 × 点击与直达两种进入方式 ──────────────
  await check('① 移动端锚点遮挡 · 6 种宽度 × 4 个锚点 × 点击/直达', async () => {
    const widths = [320, 360, 390, 414, 540, 768];
    const anchors = ['latest', 'all-papers', 'past-editions', 'method'];
    const bad = [];
    const samples = [];

    for (const width of widths) {
      for (const anchor of anchors) {
        // 进入方式 A：深链直达。必须用全新的页面加载 —— 复用同一个 page 连续
        // goto 只有 hash 不同时属于同文档导航，不会重跑挂载逻辑，测不出真实场景。
        const directPage = await newPage({ width, height: 900 });
        await directPage.goto(`${BASE}/index.html#${anchor}`, { waitUntil: 'networkidle' });
        const direct = await waitSeated(directPage, anchor);
        if (!direct || direct.textTop === null) {
          bad.push(`${width}px #${anchor} 直达：区块内找不到可见文字`);
        } else if (direct.textTop < direct.barBottom - 2) {
          bad.push(`${width}px #${anchor} 直达：文字top=${direct.textTop} < 顶栏底=${direct.barBottom}`);
        } else if (width === 390) {
          samples.push(`直达 #${anchor} 文字top=${direct.textTop}/顶栏底=${direct.barBottom}/区块top=${direct.targetTop}`);
        }
        await directPage.context().close();
      }

      // 进入方式 B：在顶栏里点导航（页内滚动，DOM 已就绪）。
      const clickPage = await newPage({ width, height: 900 });
      await clickPage.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
      await clickPage.waitForTimeout(400);
      for (const anchor of anchors) {
        const link = clickPage.locator(`.main-nav a[href="#${anchor}"]`);
        if (!(await link.count())) continue;
        await link.first().click();
        await clickPage.waitForTimeout(700); // scroll-behavior: smooth
        const clicked = await waitSeated(clickPage, anchor, 1800);
        if (!clicked || clicked.textTop === null) {
          bad.push(`${width}px #${anchor} 点击：区块内找不到可见文字`);
        } else if (clicked.textTop < clicked.barBottom - 2) {
          bad.push(`${width}px #${anchor} 点击：文字top=${clicked.textTop} < 顶栏底=${clicked.barBottom}`);
        } else if (width === 390) {
          samples.push(`点击 #${anchor} 文字top=${clicked.textTop}/顶栏底=${clicked.barBottom}`);
        }
      }
      await clickPage.context().close();
    }

    assert(bad.length === 0, `仍有遮挡（${bad.length} 处）：\n      ` + bad.slice(0, 8).join('\n      '));
    return `24 组（6 宽度 × 4 锚点）× 2 种进入方式全部落位；390px 样本：${samples.slice(0, 3).join(' | ')}`;
  });

  // ── ② archive ?e= 参数矩阵：任何非法值都必须回落列表，不能是死路 ────────────
  await check('② archive ?e= 参数矩阵 · 10 种取值', async () => {
    const cases = [
      { query: '?e=999', want: 'list' },
      { query: '?e=4', want: 'list' },
      { query: '?e=0', want: 'list' },
      { query: '?e=-1', want: 'list' },
      { query: '?e=abc', want: 'list' },
      { query: '?e=', want: 'list' },
      { query: '', want: 'list' },
      { query: '?e=2.5', want: 'either' },
      { query: '?e=2', want: 'detail' },
      { query: '?e=03', want: 'detail' },
    ];
    const bad = [];
    const rows = [];

    const page = await newPage();
    for (const item of cases) {
      await page.goto(`${BASE}/archive.html${item.query}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(360);
      const state = await page.evaluate(() => {
        const switcher = document.querySelectorAll('#editionSwitcher a').length;
        const list = document.getElementById('archiveList');
        const detail = document.getElementById('archiveDetail');
        return {
          switcher,
          cards: list ? list.querySelectorAll('.edition-card, article, a').length : 0,
          detailRows: document.querySelectorAll('#archivePapers .paper-row').length,
          detailVisible: !!(detail && !detail.hidden),
          listVisible: !!(list && !list.hidden),
          height: document.body.scrollHeight,
        };
      });

      const looksLikeList = state.listVisible && state.switcher > 0 && state.cards > 0 && state.height > 900;
      const looksLikeDetail = state.detailVisible && state.detailRows > 0 && state.switcher > 0;
      const ok = item.want === 'list' ? looksLikeList
        : item.want === 'detail' ? looksLikeDetail
        : (looksLikeList || looksLikeDetail);
      rows.push(`${item.query || '(无参数)'}:${looksLikeList ? '列表' : looksLikeDetail ? '详情' : '死路'}/${state.height}px`);
      if (!ok) bad.push(`${item.query || '(无参数)'} 期望 ${item.want} 实得 ${JSON.stringify(state)}`);
    }
    await page.context().close();

    assert(bad.length === 0, `仍有死路：\n      ` + bad.join('\n      '));
    return rows.join(' · ');
  });

  // ── ③ 两个弹窗都要能点遮罩关闭（外加 Esc / × 交叉验证）─────────────────────
  await check('③ 弹窗遮罩关闭 · paperDialog 与 savedDialog', async () => {
    const page = await newPage();
    const bad = [];
    const rows = [];

    // 快速查看弹窗
    await page.goto(`${BASE}/classics.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('.read-link').first().click();
    await page.waitForTimeout(320);
    if (!(await page.evaluate(() => !!document.querySelector('#paperDialog[open]')))) {
      bad.push('paperDialog 未能打开');
    } else {
      await page.mouse.click(8, 8); // 落在 ::backdrop 上
      await page.waitForTimeout(260);
      const stillOpen = await page.evaluate(() => !!document.querySelector('#paperDialog[open]'));
      rows.push(`paperDialog 点遮罩 → ${stillOpen ? '仍打开' : '已关闭'}`);
      if (stillOpen) bad.push('paperDialog 点遮罩后仍打开');
    }

    // 阅读清单弹窗
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('.read-link').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('#openSaved').click();
    await page.waitForTimeout(320);
    if (!(await page.evaluate(() => !!document.querySelector('#savedDialog[open]')))) {
      bad.push('savedDialog 未能打开');
    } else {
      await page.mouse.click(8, 8);
      await page.waitForTimeout(260);
      const stillOpen = await page.evaluate(() => !!document.querySelector('#savedDialog[open]'));
      rows.push(`savedDialog 点遮罩 → ${stillOpen ? '仍打开' : '已关闭'}`);
      if (stillOpen) bad.push('savedDialog 点遮罩后仍打开');
    }
    await page.context().close();

    assert(bad.length === 0, bad.join('；'));
    return rows.join(' · ');
  });

  // ── ④ 收藏入口全站可用 + 往期收藏跨页可见 + 往期记录能开详情 ────────────────
  await check('④ 收藏全站可用 · 往期页收藏后首页清单可见且可开详情', async () => {
    const page = await newPage();
    const bad = [];
    const rows = [];

    // 各页面收藏按钮数量（默认折叠的页面用深链展开）
    const surfaces = [
      { url: 'index.html', label: '首页' },
      { url: 'classics.html', label: '经典库' },
      { url: 'topics.html?topic=' + encodeURIComponent('定向进化与理性设计'), label: '专题(深链)' },
      { url: 'search.html', label: '搜索' },
      { url: 'archive.html?e=2', label: '往期详情' },
    ];
    const counts = [];
    for (const surface of surfaces) {
      await page.goto(`${BASE}/${surface.url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const count = await page.evaluate(() => ({
        action: document.querySelectorAll('.action-button').length,
        quick: document.querySelectorAll('.read-link').length,
        entry: !!document.getElementById('openSaved'),
        dialog: !!document.getElementById('savedDialog'),
      }));
      counts.push(`${surface.label} 收藏${count.action}/快看${count.quick}`);
      if (count.action === 0) bad.push(`${surface.label} 没有收藏按钮`);
      if (!count.entry || !count.dialog) bad.push(`${surface.label} 缺清单入口或面板`);
    }

    // 往期详情页收藏 → 跨页到首页检查
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.goto(`${BASE}/archive.html?e=2`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.locator('.action-button').first().click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate((key) => {
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      return { saved: (raw.saved || []).length, first: (raw.saved || [])[0] || null };
    }, STORAGE_KEY);
    assert(stored.saved === 1, `往期页收藏后 localStorage.saved=${stored.saved}，期望 1`);
    const savedTitle = String((stored.first && (stored.first.title || stored.first.cn)) || '').slice(0, 24);
    rows.push(`往期页收藏 1 条（${savedTitle || '标题为空'}）`);

    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const badge = await page.evaluate(() => {
      const el = document.getElementById('savedBadge');
      return el ? el.textContent.trim() : null;
    });
    if (badge !== '1') bad.push(`首页徽标=${badge}，期望 1（跨页状态未保留）`);

    await page.locator('#openSaved').click();
    await page.waitForTimeout(340);
    const listed = await page.evaluate(() => {
      const body = document.getElementById('savedList');
      return {
        text: body ? body.textContent.trim().slice(0, 60) : '',
        rows: body ? body.querySelectorAll('.saved-item, li, article').length : 0,
        quick: body ? body.querySelectorAll('.read-link').length : 0,
      };
    });
    if (!listed.text || listed.rows === 0) bad.push('首页清单面板里看不到往期收藏的条目');
    rows.push(`首页清单可见（${listed.rows} 行 / 快看按钮 ${listed.quick} 个）`);

    // 往期记录字段是否够用 —— 点开详情不能是空白或 undefined
    if (listed.quick > 0) {
      await page.locator('#savedList .read-link').first().click();
      await page.waitForTimeout(340);
      const detail = await page.evaluate(() => {
        const dialog = document.getElementById('paperDialog');
        const content = document.getElementById('dialogContent');
        return {
          open: !!(dialog && dialog.open),
          text: content ? content.textContent.trim() : '',
        };
      });
      if (!detail.open) bad.push('往期收藏条目点「快速查看」弹窗没打开');
      if (/undefined|null/.test(detail.text)) bad.push('往期详情弹窗出现 undefined/null');
      if (detail.text.length < 20) bad.push(`往期详情弹窗内容过少（${detail.text.length} 字）`);
      rows.push(`往期记录详情弹窗 ${detail.text.length} 字，无 undefined`);
    }

    await page.context().close();
    assert(bad.length === 0, bad.join('；'));
    return counts.join(' | ') + ' || ' + rows.join(' || ');
  });

  // ── ⑤ 空清单导出禁用 + 非空可导出 + 提示不堆积 ────────────────────────────
  await check('⑤ 空清单导出禁用 · 非空可导出 · 提示不堆积', async () => {
    const page = await newPage();
    const bad = [];

    // 空清单
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('#openSaved').click();
    await page.waitForTimeout(320);
    const emptyState = await page.evaluate(() => {
      const button = document.querySelector('#savedList .export-button');
      return {
        exists: !!button,
        disabled: button ? button.disabled : null,
        notices: document.querySelectorAll('#exportNotice').length,
      };
    });
    if (!emptyState.exists) bad.push('清单面板里找不到导出按钮');
    if (emptyState.disabled !== true) bad.push(`空清单时导出按钮 disabled=${emptyState.disabled}，期望 true`);

    // 连点（模拟用户反复戳）→ 不应产生多条提示
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => {
        const button = document.querySelector('#savedList .export-button');
        if (button) button.click();
      });
      await page.waitForTimeout(120);
    }
    const afterClick = await page.evaluate(() => document.querySelectorAll('#exportNotice').length);
    if (afterClick > 1) bad.push(`空清单连点 3 次后提示元素 ${afterClick} 条，期望 ≤1`);

    // 非空清单
    await page.evaluate((key) => {
      localStorage.setItem(key, JSON.stringify({
        saved: [{
          id: 'verify-record', title: 'Structure of Hen Egg-White Lysozyme',
          authors: 'Blake et al.', journal: 'Nature', date: '1965-05-08',
          doi: '10.1038/206757a0', url: 'https://doi.org/10.1038/206757a0',
        }],
        later: [], read: [], hidden: [],
      }));
    }, STORAGE_KEY);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('#openSaved').click();
    await page.waitForTimeout(320);
    const filled = await page.evaluate(() => {
      const button = document.querySelector('#savedList .export-button');
      return { disabled: button ? button.disabled : null };
    });
    if (filled.disabled !== false) bad.push(`非空清单时导出按钮 disabled=${filled.disabled}，期望 false`);

    const download = page.waitForEvent('download', { timeout: 6000 }).catch(() => null);
    await page.locator('#savedList .export-button').click();
    const file = await download;
    if (!file) {
      bad.push('点击导出没有触发下载事件');
    } else {
      const name = file.suggestedFilename();
      if (!/\.bib$/.test(name)) bad.push(`导出文件名 ${name} 不是 .bib`);
    }

    // 再点一次 → 提示仍只能有一条
    await page.locator('#savedList .export-button').click().catch(() => {});
    await page.waitForTimeout(300);
    const notices = await page.evaluate(() => document.querySelectorAll('#exportNotice').length);
    if (notices > 1) bad.push(`非空时连点导出后提示元素 ${notices} 条，期望 ≤1`);

    await page.context().close();
    assert(bad.length === 0, bad.join('；'));
    return `空清单 disabled=${emptyState.disabled}（连点 3 次提示 ${afterClick} 条）· 非空 disabled=${filled.disabled} 且下载成功 · 提示元素 ${notices} 条`;
  });

  await browser.close();

  console.log('\n=========== 五个真 bug 加严复验 ===========');
  for (const row of results) {
    console.log((row.ok ? '  OK   ' : ' FAIL  ') + row.name);
    console.log('         ' + row.detail);
  }
  const passed = results.filter((row) => row.ok).length;
  console.log('\n通过 ' + passed + ' / ' + results.length);
  process.exit(passed === results.length ? 0 : 1);
})().catch((error) => {
  console.error('runner crashed:', error);
  process.exit(1);
});
