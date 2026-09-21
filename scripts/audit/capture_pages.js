const { chromium } = require('C:/Users/Fan/AppData/Local/Temp/pw_test/node_modules/playwright-core');
const BASE = 'http://127.0.0.1:4321';
const OUT = 'C:/Users/Fan/AppData/Local/Temp/site_fix/shots';
const fs = require('node:fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const shots = [
    { name: 'classics-desktop', page: 'classics.html', w: 1440, h: 1000, scroll: 700 },
    { name: 'search-desktop', page: 'search.html', w: 1440, h: 1000, scroll: 0, wait: 1400 },
    { name: 'topics-open-desktop', page: 'topics.html?topic=' + encodeURIComponent('定向进化与理性设计'), w: 1440, h: 1000, scroll: 260, wait: 1200 },
    { name: 'archive-e2-desktop', page: 'archive.html?e=2', w: 1440, h: 1000, scroll: 900, wait: 1200 },
    { name: 'notfound-desktop', page: '404.html', w: 1440, h: 900 },
    { name: 'classics-mobile', page: 'classics.html', w: 390, h: 844, scroll: 500 },
    { name: 'topics-open-mobile', page: 'topics.html?topic=' + encodeURIComponent('多酶级联反应'), w: 390, h: 844, scroll: 300, wait: 1200 },
    { name: 'archive-e999-mobile', page: 'archive.html?e=999', w: 390, h: 844, wait: 800 },
  ];
  for (const s of shots) {
    const pg = await b.newPage({ viewport: { width: s.w, height: s.h } });
    await pg.goto(`${BASE}/${s.page}`, { waitUntil: 'networkidle' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.waitForTimeout(s.wait || 600);
    if (s.scroll) { await pg.evaluate(y => window.scrollTo(0, y), s.scroll); await pg.waitForTimeout(300); }
    // report any element that sticks out horizontally
    const overflow = await pg.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const bad = [...document.querySelectorAll('body *')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > vw + 2 || r.left < -2);
      }).slice(0, 6).map(el => el.tagName + '.' + String(el.className).split(' ')[0] + ' right=' + Math.round(el.getBoundingClientRect().right));
      return { vw, docW: document.documentElement.scrollWidth, bad };
    });
    await pg.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log(`${s.name.padEnd(22)} doc=${overflow.docW} vw=${overflow.vw}${overflow.docW > overflow.vw ? '  <横向溢出!>' : ''}`);
    if (overflow.bad.length) console.log('   溢出元素:', overflow.bad.join(' | '));
    await pg.close();
  }
  await b.close();
  console.log('DONE');
})();
