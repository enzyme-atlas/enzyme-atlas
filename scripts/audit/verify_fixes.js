/**
 * Browser verification for every fix applied to enzyme-literature-radar.
 *
 * Covers the fixes recorded in AUDIT-站点排查与可优化点-v1.md §9: mobile anchor
 * offset, the archive dead end, backdrop close, reading list on all five pages,
 * cross-page persistence, empty-list export, language / topic deep links, the
 * homepage reading path, search preview, archive wording, the share assets and
 * 404 page, plus the narrow-screen nav cue.
 *
 * Usage
 * -----
 *     python -m http.server 4321 --bind 127.0.0.1     # serve the repo root
 *     node scripts/audit/verify_fixes.js
 *
 * playwright-core is not a project dependency (the site ships no build step), so
 * point PLAYWRIGHT_CORE at an install if the default probe misses:
 *
 *     PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/audit/verify_fixes.js
 *
 * Exits non-zero if any check fails. Every check prints its measured values.
 */
const fs = require('node:fs');
const path = require('node:path');

const CANDIDATES = [
  process.env.PLAYWRIGHT_CORE,
  path.resolve(__dirname, '../../node_modules/playwright-core'),
  'C:/Users/Fan/AppData/Local/Temp/pw_test/node_modules/playwright-core',
].filter(Boolean);

const corePath = CANDIDATES.find(candidate => {
  try { return fs.existsSync(path.join(candidate, 'package.json')); } catch (error) { return false; }
});
if (!corePath) {
  console.error('playwright-core not found. Set PLAYWRIGHT_CORE to its directory.');
  process.exit(2);
}
const { chromium } = require(corePath);

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const results = [];
const errs = [];

function ok(name, detail) { results.push({ ok: true, name, detail: detail || '' }); }
function fail(name, detail) { results.push({ ok: false, name, detail: detail || '' }); }

async function check(name, fn) {
  try {
    const detail = await fn();
    ok(name, detail);
  } catch (error) {
    fail(name, String(error && error.message ? error.message : error));
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const newPage = async (viewport) => {
    const pg = await browser.newPage({ viewport: viewport || { width: 1440, height: 900 } });
    pg.on('pageerror', e => errs.push('pageerror: ' + String(e)));
    pg.on('console', m => {
      if (m.type() === 'error' && !/favicon|404 \(Not Found\)|Failed to load resource/i.test(m.text())) {
        errs.push('console: ' + m.text());
      }
    });
    return pg;
  };

  // ---------------------------------------------------------------- P0-1 anchor offset
  await check('P0-1 移动端锚点不被顶栏遮挡', async () => {
    const pg = await newPage({ width: 390, height: 844 });
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    const out = [];
    for (const id of ['latest', 'all-papers', 'past-editions', 'method']) {
      await pg.evaluate(() => window.scrollTo(0, 0));
      await pg.waitForTimeout(120);
      await pg.evaluate(t => { location.hash = ''; location.hash = '#' + t; }, id);
      await pg.waitForTimeout(700);
      const r = await pg.evaluate((t) => {
        const sec = document.getElementById(t);
        const bar = document.querySelector('.topbar');
        const heading = sec.querySelector('h2, h1');
        return {
          barBottom: Math.round(bar.getBoundingClientRect().bottom),
          headingTop: Math.round(heading.getBoundingClientRect().top),
          scrollY: Math.round(window.scrollY),
        };
      }, id);
      const covered = r.headingTop < r.barBottom - 1;
      out.push(`${id}: 标题top=${r.headingTop} 顶栏底=${r.barBottom}${covered ? ' <遮挡>' : ''}`);
      if (covered) throw new Error(`${id} 仍被遮挡 ${r.barBottom - r.headingTop}px`);
    }
    await pg.close();
    return out.join(' | ');
  });

  // ---------------------------------------------------------------- P0-2 archive dead end
  await check('P0-2 archive 无效期号回落到列表', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/archive.html?e=999`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => ({
      listHidden: document.getElementById('archiveList').hidden,
      listCards: document.querySelectorAll('#archiveList .edition-card').length,
      switcherItems: document.querySelectorAll('#editionSwitcher a').length,
      status: document.getElementById('archiveStatus').textContent.trim(),
      detailHidden: document.getElementById('archiveDetail').hidden,
      bodyH: document.body.scrollHeight,
    }));
    await pg.close();
    if (r.listHidden || r.listCards === 0) throw new Error('列表未回落: ' + JSON.stringify(r));
    if (r.switcherItems === 0) throw new Error('切换器为空: ' + JSON.stringify(r));
    return `列表 ${r.listCards} 张 / 切换器 ${r.switcherItems} 项 / 页高 ${r.bodyH}px / 提示「${r.status.slice(0, 24)}…」`;
  });

  // ---------------------------------------------------------------- P1 backdrop close
  await check('P1 弹窗点遮罩关闭', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/classics.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(400);
    await pg.locator('.classic-card .read-link').first().click();
    await pg.waitForTimeout(300);
    const opened = await pg.evaluate(() => !!document.querySelector('#paperDialog[open]'));
    await pg.mouse.click(6, 6);
    await pg.waitForTimeout(300);
    const after = await pg.evaluate(() => !!document.querySelector('#paperDialog[open]'));
    await pg.close();
    if (!opened) throw new Error('快速查看弹窗未打开');
    if (after) throw new Error('点遮罩后弹窗仍开着');
    return '快速查看弹窗点遮罩已关闭';
  });

  // ---------------------------------------------------------------- P0-3 reading list everywhere
  await check('P0-3 阅读清单入口在 5 个页面都存在', async () => {
    const pg = await newPage();
    // topics and archive only list papers after a topic / edition is opened, so
    // probe them through a deep link that actually renders items.
    const pages = [
      ['index.html', '首页'],
      ['classics.html', '经典库'],
      ['topics.html?topic=' + encodeURIComponent('定向进化与理性设计'), '研究专题（展开后）'],
      ['search.html', '搜索'],
      ['archive.html?e=2', '往期详情'],
    ];
    const out = [];
    for (const [page, label] of pages) {
      await pg.goto(`${BASE}/${page}`, { waitUntil: 'networkidle' });
      await pg.waitForTimeout(900);
      const r = await pg.evaluate(() => ({
        entry: !!document.querySelector('.header-actions #openSaved'),
        dialog: !!document.getElementById('savedDialog'),
        actionButtons: document.querySelectorAll('.action-button').length,
        quick: document.querySelectorAll('.read-link').length,
      }));
      if (!r.entry || !r.dialog) throw new Error(`${label} 缺清单入口/面板: ${JSON.stringify(r)}`);
      if (r.actionButtons === 0) throw new Error(`${label} 一个收藏按钮都没有`);
      out.push(`${label} 收藏 ${r.actionButtons} / 快看 ${r.quick}`);
    }
    await pg.close();
    return out.join(' | ');
  });

  await check('P0-3 在经典库收藏 → 首页清单里能看到', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/classics.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(500);
    await pg.evaluate(() => localStorage.clear());
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForTimeout(500);
    const title = await pg.locator('.classic-card h2').first().innerText();
    await pg.locator('.classic-card .action-button').first().click();
    await pg.waitForTimeout(400);
    const badge = await pg.evaluate(() => document.getElementById('savedBadge').textContent);
    if (badge !== '1') throw new Error('收藏后徽标未变 1，实际 ' + badge);
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(600);
    const badge2 = await pg.evaluate(() => document.getElementById('savedBadge').textContent);
    await pg.locator('#openSaved').click();
    await pg.waitForTimeout(400);
    const panel = await pg.evaluate(() => document.getElementById('savedList') && document.getElementById('savedList').innerText);
    await pg.close();
    if (badge2 !== '1') throw new Error('换页后徽标丢了：' + badge2);
    if (!panel.includes(title.slice(0, 18))) throw new Error('首页清单里没找到经典库收藏的条目');
    return `跨页保留：${title.slice(0, 26)}…`;
  });

  await check('P0-3 往期详情页可收藏', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/archive.html?e=2`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(700);
    const r = await pg.evaluate(() => ({
      kind: document.querySelectorAll('#archiveFeatured .action-button, #archiveFeatured .save-btn').length,
      rows: document.querySelectorAll('#archivePapers .action-button').length,
    }));
    await pg.close();
    if (r.kind + r.rows === 0) throw new Error('往期详情页仍无收藏入口');
    return `精选卡 ${r.kind} 个 + 收录行 ${r.rows} 个收藏按钮`;
  });

  // ---------------------------------------------------------------- P1 empty-list export
  await check('P1 空清单导出按钮禁用', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(600);
    await pg.evaluate(() => localStorage.clear());
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForTimeout(700);
    await pg.locator('#openSaved').click();
    await pg.waitForTimeout(400);
    const r = await pg.evaluate(() => {
      const b = document.querySelector('.export-button');
      return { disabled: !!b && b.disabled, text: b ? b.textContent.trim() : '' };
    });
    await pg.close();
    if (!r.disabled) throw new Error('空清单时导出按钮未禁用');
    return `导出按钮 disabled（文案「${r.text}」）`;
  });

  // ---------------------------------------------------------------- P1 language deep link
  await check('P1 语言切换写入 URL 且可深链', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/classics.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(500);
    await pg.locator('.lang-switch button, [data-lang-slot] button').nth(1).click();
    await pg.waitForTimeout(400);
    const url = pg.url();
    const isEn = await pg.evaluate(() => document.querySelector('.classic-card h2') && document.documentElement.lang);
    const fresh = await newPage();
    await fresh.goto(`${BASE}/classics.html?lang=en`, { waitUntil: 'networkidle' });
    await fresh.waitForTimeout(600);
    const freshLang = await fresh.evaluate(() => ({ lang: document.documentElement.lang, title: document.title }));
    await fresh.close();
    await pg.close();
    if (!/[?&]lang=en/.test(url)) throw new Error('切换后 URL 未带 lang：' + url);
    if (freshLang.lang !== 'en') throw new Error('?lang=en 未生效：' + JSON.stringify(freshLang));
    return `切换后 URL=${url.split('?')[1]}；?lang=en 直接生效（${freshLang.lang}）`;
  });

  // ---------------------------------------------------------------- P1 topic deep link
  await check('P1 专题可深链（?topic=）', async () => {
    const key = '定向进化与理性设计';
    const pg = await newPage();
    await pg.goto(`${BASE}/topics.html?topic=${encodeURIComponent(key)}`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(900);
    const r = await pg.evaluate(() => {
      const open = document.querySelector('.topic-card.open');
      return {
        openHead: open ? open.querySelector('h2').textContent.trim() : null,
        url: location.search,
        items: document.querySelectorAll('.topic-card.open .topic-item').length,
        notes: document.querySelectorAll('.topic-card.open .topic-item-note').length,
      };
    });
    await pg.close();
    if (r.openHead !== key) throw new Error('深链未展开目标专题：' + JSON.stringify(r));
    if (r.items === 0) throw new Error('展开后没有条目');
    if (r.notes === 0) throw new Error('专题条目仍无摘要');
    return `${key} 自动展开 ${r.items} 条（带摘要 ${r.notes} 条）；URL ${r.url}`;
  });

  await check('P1 点专题后 URL 同步 ?topic=', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/topics.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(700);
    await pg.locator('.topic-card-head').nth(1).click();
    await pg.waitForTimeout(400);
    const url = pg.url();
    await pg.close();
    if (!/[?&]topic=/.test(url)) throw new Error('展开专题后 URL 未同步：' + url);
    return decodeURIComponent(url.split('?')[1]);
  });

  // ---------------------------------------------------------------- P2 homepage reading path
  await check('P2 首页推荐阅读路径可点', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(500);
    const r = await pg.evaluate(() => {
      const links = [...document.querySelectorAll('.reading-path li a')];
      return { n: links.length, hrefs: links.map(a => a.getAttribute('href')) };
    });
    if (r.n !== 4) throw new Error('可点路径数不是 4，实际 ' + r.n);
    if (r.hrefs.some(h => !/^topics\.html\?topic=/.test(h))) throw new Error('href 未指向专题深链：' + r.hrefs.join(','));
    await pg.locator('.reading-path li a').first().click();
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(900);
    const landed = await pg.evaluate(() => {
      const open = document.querySelector('.topic-card.open');
      return { head: open ? open.querySelector('h2').textContent.trim() : null, url: location.search };
    });
    await pg.close();
    if (!landed.head) throw new Error('点击后未落到展开的专题');
    return `4 条均可点，首条落到「${landed.head}」`;
  });

  // ---------------------------------------------------------------- P2 search preview
  await check('P2 搜索空查询收敛展示量', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1200);
    const r = await pg.evaluate(() => ({
      rows: document.querySelectorAll('.search-row').length,
      note: document.getElementById('searchNote').textContent.trim(),
      bodyH: document.body.scrollHeight,
      actions: document.querySelectorAll('.search-row .topic-item-actions').length,
    }));
    await pg.close();
    if (r.rows > 30) throw new Error('空查询仍渲染 ' + r.rows + ' 条');
    if (!/108/.test(r.note)) throw new Error('提示未报出检索池总数：' + r.note);
    if (r.actions !== r.rows) throw new Error('搜索结果缺收藏按钮');
    return `渲染 ${r.rows} 条（页高 ${r.bodyH}px），提示「${r.note.slice(0, 34)}…」`;
  });

  // ---------------------------------------------------------------- P2 archive wording
  await check('P2 往期列表量词用「期」', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/archive.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(500);
    const r = await pg.evaluate(() => document.getElementById('archiveStatus').textContent.trim());
    await pg.close();
    if (!/期/.test(r)) throw new Error('量词没改：' + r);
    if (/^\D*3 篇/.test(r)) throw new Error('仍写作「篇」：' + r);
    return r;
  });

  // ---------------------------------------------------------------- P1 meta / SEO assets
  await check('P1 favicon / og:image / robots / sitemap / 404 均可访问', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    const meta = await pg.evaluate(() => ({
      icon: (document.querySelector('link[rel="icon"]') || {}).getAttribute
        ? document.querySelector('link[rel="icon"]').getAttribute('href') : null,
      theme: (document.querySelector('meta[name="theme-color"]') || {}).content || null,
      og: (document.querySelector('meta[property="og:image"]') || {}).content || null,
      twitter: (document.querySelector('meta[name="twitter:card"]') || {}).content || null,
    }));
    const assets = {};
    for (const p of ['favicon.png', 'og-cover.png', 'robots.txt', 'sitemap.xml']) {
      const res = await pg.request.get(`${BASE}/${p}`);
      assets[p] = res.status();
    }
    const nf = await pg.request.get(`${BASE}/404.html`);
    await pg.close();
    const bad = Object.entries(assets).filter(([, s]) => s !== 200).map(([k, s]) => `${k}=${s}`);
    if (bad.length) throw new Error('资源不可访问: ' + bad.join(', '));
    if (nf.status() !== 200) throw new Error('404.html 不可访问: ' + nf.status());
    if (!meta.og || !/og-cover\.png$/.test(meta.og)) throw new Error('og:image 未指向真实卡片');
    if (!meta.theme) throw new Error('缺 theme-color');
    return `favicon/og/robots/sitemap/404 全 200；theme-color=${meta.theme}；twitter=${meta.twitter}`;
  });

  await check('P1 分享卡与 favicon 是真实文件（非空 data URI）', async () => {
    const pg = await newPage();
    const r = {};
    for (const p of ['favicon.png', 'og-cover.png']) {
      const res = await pg.request.get(`${BASE}/${p}`);
      r[p] = (await res.body()).length;
    }
    await pg.close();
    if (r['favicon.png'] < 200) throw new Error('favicon 太小: ' + r['favicon.png']);
    if (r['og-cover.png'] < 5000) throw new Error('og-cover 太小: ' + r['og-cover.png']);
    return `favicon ${r['favicon.png']}B / og-cover ${r['og-cover.png']}B（均为真实 PNG，非空 data URI）`;
  });

  // ---------------------------------------------------------------- P2 search form button
  await check('P2 搜索表单按钮为 submit', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
    const r = await pg.evaluate(() => {
      const b = document.querySelector('#searchForm button');
      return { type: b.getAttribute('type'), tag: b.tagName };
    });
    await pg.close();
    if (r.type !== 'submit') throw new Error('按钮 type=' + r.type);
    return `<button type="submit">`;
  });

  // ---------------------------------------------------------------- nav overflow cue
  await check('P2 窄屏导航溢出有渐隐提示', async () => {
    const pg = await newPage({ width: 330, height: 780 });
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.waitForTimeout(400);
    const r = await pg.evaluate(() => {
      const nav = document.querySelector('.main-nav');
      const styles = getComputedStyle(nav);
      return {
        scrollable: nav.classList.contains('nav-scrollable'),
        overflowing: nav.scrollWidth > nav.clientWidth + 1,
        mask: styles.maskImage || styles.webkitMaskImage,
        navW: nav.clientWidth, scrollW: nav.scrollWidth,
      };
    });
    await pg.close();
    if (r.overflowing && !r.scrollable) throw new Error('导航溢出但未加提示类: ' + JSON.stringify(r));
    if (r.scrollable && (!r.mask || r.mask === 'none')) throw new Error('提示类没有实际样式');
    return r.overflowing ? `溢出 ${r.scrollW}>${r.navW}px，渐隐已启用` : `未溢出（${r.navW}px 容得下），提示正确未启用`;
  });

  // ---------------------------------------------------------------- 404 page usability
  await check('P1 404 页有回首页入口且可中英切换', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/404.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(400);
    const r = await pg.evaluate(() => ({
      entries: document.querySelectorAll('.notfound-grid a').length,
      links: [...document.querySelectorAll('.notfound-grid a')].map(a => a.getAttribute('href')),
      is404: document.title.includes('不存在'),
      langSlot: document.querySelectorAll('[data-lang-slot] button').length,
    }));
    await pg.close();
    if (r.entries < 4) throw new Error('404 页入口太少：' + r.entries);
    if (r.langSlot < 2) throw new Error('404 页语言切换缺失');
    return `${r.entries} 个入口（${r.links.slice(0, 3).join(', ')}…），中英切换可用`;
  });

  // ---------------------------------------------------------------- reading-list per-page save flow
  await check('P0-3 搜索页收藏可用', async () => {
    const pg = await newPage();
    await pg.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => localStorage.clear());
    await pg.reload({ waitUntil: 'networkidle' });
    await pg.waitForTimeout(1300);
    await pg.locator('.search-row .action-button').first().click();
    await pg.waitForTimeout(400);
    const badge = await pg.evaluate(() => document.getElementById('savedBadge').textContent);
    await pg.close();
    if (badge !== '1') throw new Error('搜索页收藏失败，徽标=' + badge);
    return '搜索页收藏 → 徽标 1';
  });

  await browser.close();

  console.log('\n================ 结果 ================');
  for (const r of results) console.log((r.ok ? '  OK   ' : ' FAIL  ') + r.name + '\n         ' + r.detail);
  const bad = results.filter(r => !r.ok);
  console.log('\n通过 ' + (results.length - bad.length) + ' / ' + results.length);
  if (errs.length) { console.log('\n控制台错误:'); errs.forEach(e => console.log('  ! ' + e)); }
  else console.log('控制台/页面错误：0');
  if (bad.length) { console.log('\n失败项:'); bad.forEach(b => console.log('  - ' + b.name + ' :: ' + b.detail)); }
  process.exit(bad.length ? 1 : 0);
})();
