# Enzyme Atlas 全站排查报告 · 可优化点清单 v1

- 排查日期：2026-09-18
- 排查对象：`enzyme-literature-radar`（本地 `http://127.0.0.1:4321` 全量复现）
- 线上地址：`https://enzyme-atlas.github.io/enzyme-atlas/`
- 覆盖页面：`index.html` / `classics.html` / `topics.html` / `archive.html` / `search.html`
- 结论摘要：**无死链、无 console 报错、无中英混排、数据计数全部自洽**；但存在 **5 个真功能 bug**、**5 处摆设件**、**3 类功能一致性缺口**，以及 SEO/分享层面的结构性缺失。

> ℹ️ 本文件是内部审计记录。排查时 `pages.yml` 使用 `path: .`（整个仓库都会发布上网），所以文末的 `prune_public.py` 修复项就是为此而做——部署前会把本报告与 `scripts/` 一起剪掉，不再上线。

---

## 排查方法（13 遍，逐遍升级手段）

| 遍次 | 手段 | 目标 |
|---|---|---|
| 1 | 读 5 个 HTML 全部可交互元素 | 找锚点/链接结构问题 |
| 2 | 扫全部 JS 的事件绑定与 DOM 查询 | 找"有按钮没人监听" |
| 3 | 核对 `papers/classics/topics/editions` 数据交叉计数 | 找数字不自洽 |
| 4 | 浏览器静态审计（死链、错误、可点击元素） | 死链/JS 错误 |
| 5 | 逐按钮真实点击 | 点了有没有反应 |
| 6 | 深挖导航锚点落点（含 `scroll-margin` / header 高度） | 跳转是否被遮挡 |
| 7 | 精确复测 `archive` 的 `?e=` 各种取值 | 参数异常时是否死路 |
| 8 | HTML `<button>` ↔ JS 选择器逐一对照 | 摆设件 |
| 9 | 截图级视觉验证（桌面 + 移动 + 深链 + 切语言） | 视觉/布局故障 |
| 10 | 搜索 10 种输入 + 深链分享 + 键盘可达 + SEO | 边界与可发现性 |
| 11 | 11 种视口宽度的裁切扫描 + 元信息检查 | 窄屏与分享元数据 |
| 12 | 阅读清单入口一致性矩阵 + 语言持久化 | 功能一致性 |
| 13 | 移动端锚点遮挡矩阵 + 弹窗关闭 + 参数矩阵 + 中英混排 | 复核并钉死结论 |

---

## 一、真 bug（功能性故障，会卡住用户）

| # | 问题 | 证据 | 影响 | 修法 |
|---|---|---|---|---|
| **B1** | **移动端点导航跳转后，目标区块标题被顶栏遮住 70–74px** | 390px 宽点「本周精选」：区块首行文字 `top=65`，顶栏底边 `139` → 遮 **74px**；「全部收录」遮 **70px**。桌面端因 `.section` 的 `padding-top:88px` > 顶栏 72px 侥幸无碍 | 手机用户点完导航**看不见自己跳到了哪个区块**。小红书来的读者几乎全是手机访问 | `html { scroll-padding-top: 150px }`，或给 `#latest / #all-papers / #past-editions` 加 `scroll-margin-top: 150px`（移动端顶栏 139px + 余量） |
| **B2** | **`archive.html?e=<不存在期号>` 是死路** | `?e=4`：状态栏只剩「未找到该期号，请从列表中选择。」，切换器 **0 项**、列表 **0 张**、详情隐藏，页面近乎全空白，只有一条「← 返回期号列表」 | 从旧链接或手改 URL 进来会**卡在一个什么都没有的页面** | `archive.js:76-79` 改成：找不到期号时**回落到列表**（`renderSwitcher(); renderList(); listNode.hidden=false;`），而不是直接 `return` |
| **B3** | **弹窗点遮罩层不关闭** | `<dialog>` 原生行为。实测点弹窗外部空白后 `document.querySelector('dialog[open]')` 仍为 `paperDialog` | 用户点空白区以为能关 → **没反应**（Esc 和 × 是可用的） | 给两个 dialog 加：`dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); })` |
| **B4** | **空清单点「导出收藏为 BibTeX」可重复触发、提示堆积** | 连点两次 → `#savedList` 里插入 **2 条**「请先收藏至少一篇文献。」 | 提示重复出现；无收藏时导出按钮仍可点 | 空清单时给按钮加 `disabled`；提示改为固定节点而非 `insertAdjacentHTML` |
| **B5** | **往期详情页没有收藏入口** | `archive.html?e=2`：`.action-button, .save-btn` 数量 = **0**；页面只有 DOI 外链 | 浏览往期 9 篇时**一篇都存不了**，必须回首页当期再找一遍 | 复用 `app.js` 的 `actionButtons()`；若有意不给，至少把 `archive-note` 的说明放在更显眼位置 |

---

## 二、摆设件（看着能点、或已写好接口，实际没有实质作用）

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| **D1** | **首页「推荐阅读路径」4 条完全不可点** | `.reading-path li` × 4：内部 `<a>` 数量 = **0**，`cursor: auto`，无 `role`/`tabindex` | 长得像目录条目却点不动。让每条跳转到对应专题（`topics.html` 对应 key），或改成明确的纯文字说明 |
| **D2** | **经典论文库 83 张卡片主体不能点** | 83/83 只有 DOI 外链（`onlyExternal: 83`，`hasInternal: 0`）；点卡片标题无反应、不弹窗 | 首页有「快速查看」弹窗，经典库没有。建议复用同一弹窗，让用户站内就能读摘要 |
| **D3** | **搜索词统计代码已就位但从未上报** | `search.js:212` 判断 `window.goatcounter`，但 5 个页面**无一引入**该脚本；`scripts/add_analytics.py` 的 `--code` 也未配置 | 不是死代码，是**开关没打开**。决定要么配码（`python scripts/add_analytics.py --code ...`），要么删掉这段 |
| **D4** | **搜索页空查询一次渲染全站 108 条** | 空查询 → `rows = 108`，页面高度 **11051px** | 无分页/分批。建议默认只渲染 20–30 条 +「加载更多」，或先不渲染、提示输入关键词 |
| **D5** | **专题展开后 33 条条目没有任何摘要** | `.topic-item` 内 `<p>` 数量 = **0**，只有「年份 / 标题 / 作者·期刊」 | 用户无法判断哪篇值得点。建议加一行截断摘要（数据里已有 `note` / `summary`） |

---

## 三、功能一致性缺口（同一功能只在部分页面存在）

| 功能 | 首页 | 经典论文 | 研究专题 | 往期精选 | 搜索 |
|---|---|---|---|---|---|
| 阅读清单入口（`⌑` 按钮） | ✅ | ❌ | ❌ | ❌ | ❌ |
| 收藏 / 稍后读 / 已读按钮 | ✅ 19 个 | ❌ 0 | ❌ 0 | ❌ 0 | ❌ 0 |
| 「快速查看」弹窗 | ✅ 5 个 | ❌ | ❌ | ❌ | ❌ |

**核心问题**：收藏功能恰恰在**文献最多、最需要收藏**的三个页面（经典库 83 篇 / 搜索结果 108 条 / 专题 33 条）**全部缺失**。用户浏览完想存下来，只能回首页重找。
**建议**：把阅读清单按钮加入全局顶栏（`header-actions`），并把 `actionButtons()` 提到共享模块供各页复用。

---

## 四、SEO / 分享 / 被找到的能力

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| **S1** | **英文版无法分享** | 切到 EN 后 URL 完全不变（`search: ""`、`hash: ""`），语言只写进 `localStorage` | 把英文链接发给别人 → 对方看到中文；搜索引擎只会收录中文版 |
| **S2** | **14 个专题无法单独分享 / 不被收录** | 点开专题后 URL 无任何变化；`topics.html?topic=xxx` 打开不展开；`.topic-card` 无 `id` | 专题页是整个站最独特的内容，却不可深链 |
| **S3** | **`og:image` / `favicon` / `theme-color` / `apple-touch-icon` 全缺** | `og:image: null`、`favicon: "data:,"`（空）、无 theme-color | 分享到微信/小红书**没有缩略图**；浏览器标签页是默认图标 |
| **S4** | **`robots.txt` / `sitemap.xml` / 自定义 404 页 全部 404** | 三项探测均返回 404；直接访问不存在路径显示服务器默认 `Error response / Error code: 404` | 用户走到死链看到裸报错页，**没有回首页入口**；也无搜索引擎站点地图 |
| **S5** | **canonical 硬编码在 5 个 HTML 里** | 5 页均为 `.../enzyme-atlas/...` | 虽然已有 `set_site_address.py` 统一改，但仍是 5 处耦合点 |
| **S6** | **无 RSS、无任何订阅入口** | `link[type="application/rss+xml"]` 为空；全站无「订阅 / RSS / 邮件」字样 | 站点定位是「每周一更新」，却**没有让用户订阅的方式**——只能靠用户自己想起来回访。这是产品级缺口 |

---

## 五、内部文件暴露（会被一起发布上网）

| # | 问题 | 证据 |
|---|---|---|
| **I1** | 部署范围是整个仓库 | `.github/workflows/pages.yml` → `path: .` |
| **I2** | **13 个开发脚本全部公网可达** | `scripts/` 下 `fetch_crossref.py`、`publish_weekly.py`、`validate_site.py`、`build_topics.py` 等会被发布，可直接访问 `.../scripts/publish_weekly.py` |
| **I3** | `.gitignore`、`pages.yml`、`README.md` 同样上线 | 同上 |

**已正确规避**：`scripts/disclosure.local.json` 已在 `.gitignore` 中，未进 git ✓，无密钥泄露。
**建议**：`pages.yml` 改为只上传站点所需文件（`*.html` / `*.css` / `*.js` / `data/` / `site.config.json` / `.nojekyll`），或把 `scripts/` 等移入子目录并用 `exclude` 排除。

---

## 六、小毛刺

| # | 问题 | 证据 |
|---|---|---|
| **M1** | **窄屏主导航溢出，且看不出能横滑** | 320px 宽：`.main-nav` `scrollWidth 353 > clientWidth 284`，「筛选标准」右边界 **371** 在屏幕外；CSS 主动 `scrollbar-width: none` 隐藏滚动条，也无渐隐提示 → 用户**无从得知**还能往右滑 |
| **M2** | **往期列表页量词错误** | 写的是「**3 篇**收录 · 3 篇精选」，实际是 **3 期**（复用了 `editions_card_counts` 的"篇"模板） |
| **M3** | **`?e=2.5` 被静默解析成第 02 期** | `parseInt("2.5") = 2`，URL 语义含糊（低危） |
| **M4** | **`search.html` 表单按钮缺 `type="submit"`** | 5 页中只有 `search.html` 页内表单按钮没写 `type`（首页有）。靠默认值侥幸工作，语义不明确 |

---

## 七、这次排查确认「没问题」的部分（避免重复劳动）

| 检查项 | 结果 |
|---|---|
| 死链 / 空锚点 | **0 个** |
| JS / 网络请求错误 | **0 个**，全站 console 干净 |
| 中英文切换残留 | **0 处**（精选 5/5、全部收录 7/7、经典库 83 张、5 页标题与导航全部切干净） |
| 数据计数自洽 | 首页 7 篇 / 5 精选、专题 14 个（合计 138，含多归属）、经典库 83 篇 5 组来源统计，**全部准确** |
| 14 个专题是否有空壳 | **无空壳**，含往期数据后计数全部对得上 |
| 语言偏好持久化 | ✅ 写入 `localStorage` 的 `enzyme-atlas-lang`，刷新与跨页均保持 |
| 移动端横向滚动 | **无**（5 页 `scrollWidth == viewport`） |
| 焦点可见性 | ✅ 按钮/链接均有 2px 实线 outline |
| 弹窗关闭方式 | Esc ✅、× 按钮 ✅（仅缺遮罩点击） |
| 「已隐藏」文献恢复 | ✅ 阅读清单内有「已隐藏」分区与恢复按钮 |
| 累积布局偏移（CLS） | 实测增长 **0px** |

---

## 八、修复优先级建议

### P0 — 真正影响用户，建议先修
1. **B1** 移动端锚点被顶栏遮挡（一行 CSS 解决，收益最大）
2. **C1/C2** 阅读清单与收藏按钮加入全局顶栏（这是最大的产品缺口）
3. **B2** `archive?e=` 无效期号死路回落

### P1 — 明确的体验与传播损失
4. **S3** `og:image` + `favicon`（分享卡片目前是空白，直接影响小红书/微信转发效果）
5. **S4** 自定义 404 页 + `robots.txt`
6. **S1 / S2** 语言与专题深链（决定了内容能否被单独分享和收录）
7. **B5 / D2** 往期与经典库的站内阅读体验

### P2 — 值得做，不紧急
8. **D1** 首页「推荐阅读路径」变成可点
9. **D3** 决定统计开关的取舍
10. **D4 / D5** 搜索结果与专题条目的信息量
11. **B3 / B4** 弹窗遮罩关闭、空清单导出

### P3 — 洁癖与小修补
12. **I1–I3** 收敛部署范围
13. **M1–M4** 导航溢出提示、量词、「e=2.5」、`type="submit"`

---

## 九、修复记录（2026-09-18 完成）

上面 P0–P2 与 P3 的可做项已全部落地，逐条留证如下。**CI 14 项全绿**（`validate_site.py` / `test_weekly_pipeline.py` / `check_public_disclosure.py` / `set_site_address.py --check` / `prune_public.py --check` / 7 个 `node --check` / 2 个 Node 契约测试），**浏览器实测 19/19 通过、console 错误 0**，另有一套**五项真 bug 加严复验 5/5 通过**（见第十节）。

| 编号 | 修复内容 | 落点 | 实测证据 |
|---|---|---|---|
| **B1** | 移动端锚点不再被顶栏遮挡 | `styles.css`：`html{scroll-padding-top:98px}`，`≤1240px` 断点提到 `158px` | 390px 宽逐个锚点复测：`latest`/`all-papers`/`past-editions`/`method` 标题均落在顶栏下（顶栏底 139px） |
| **B1b** | 深链直达也能落到锚点（B1 的姊妹问题，加严复测才暴露） | `reading-list.js`：新增 `reseatAnchor()`，在异步内容撑高文档后重新落位，并带 hash 变化 / 用户滚动让位守卫 | 修前 320px 打开 `index.html#method`：`scrollY=533` 而目标在 `7822px` 处（差 7184px）；修后同场景 `区块top=158` = `scroll-padding-top`，6 宽度 × 4 锚点全部落位 |
| **B2** | 无效期号回落到期号列表 | `archive.js`：抽出 `showList()`，`showEdition()` 找不到期号时调用它 | `?e=999` → 列表 3 张 + 切换器 3 项，页高 1121px（原来近乎空白） |
| **B3** | 弹窗点遮罩关闭 | `reading-list.js`：`wireBackdropClose()` 按坐标判断点击落在框外 | 快速查看弹窗点遮罩后 `dialog[open]` 消失 |
| **B4** | 空清单时导出按钮禁用 | `reading-list.js`：`renderSaved()` 输出 `disabled` | 清空 localStorage 后按钮 `disabled=true` |
| **C1/C2** | 阅读清单与收藏铺到全站 | 新文件 `reading-list.js`（状态 + 弹窗 + 按钮 + 导出），5 个页面在 `i18n.js` 之后引入；`classics.js`/`topics.js`/`search.js`/`archive.js` 改用 `EA.reading` | 首页 14 / 经典库 166 / 专题展开 66 / 搜索 60 / 往期详情 18 个收藏按钮；从经典库收藏后切到首页，徽标仍为 1 且清单里能找到该条 |
| **S1** | 语言写入 URL，可深链 | `i18n.js`：`setLang()` 同步 `?lang=` | 切 EN 后 URL 带 `lang=en`；直接打开 `?lang=en` 即为英文 |
| **S2** | 专题可深链 | `topics.js`：`?topic=` 自动展开 + 点击同步 URL | `?topic=定向进化与理性设计` 自动展开 33 条；点卡片后 URL 同步 |
| **S3** | favicon / og:image / theme-color | 新增 `favicon.png`（64×64）与 `og-cover.png`（1200×630）；`scripts/set_site_address.py` 统一注入 | 首页 favicon 737B、og-cover 63104B 均为真实 PNG（原先 favicon 是空 `data:,`、`og:image` 为 null） |
| **S4** | robots / sitemap / 自定义 404 | 新增 `404.html`（6 个入口 + 中英切换 + 回首页）；`robots.txt`、`sitemap.xml` 由地址脚本生成 | 三者均 HTTP 200；404 页不再是服务器裸报错页 |
| **D1** | 首页推荐阅读路径可点 | `index.html`：4 条 `<li>` 内嵌 `<a href="topics.html?topic=…">`；`styles.css` 补 hover 箭头 | 4 条均可点，首条落到「多酶级联反应」 |
| **D4** | 搜索空查询收敛 | `search.js`：`PREVIEW_LIMIT=30` + 新提示 `search_preview_note` | 1000 页高从 11051px 降到 4613px；提示「当前显示前 30 条（检索池共 108 篇）」 |
| **D5** | 专题条目补摘要 | `topics.js`：`entryNote()` 取 `summary`/`note` 截 96 字 | 展开的 33 条全部带摘要 |
| **I1** | 收敛部署范围 | 新增 `scripts/prune_public.py`（允许清单 + `--check`），`pages.yml` 部署前先剪枝 | 8 个非公开路径（`scripts/`、`AGENTS.md`、审计报告等）不再上线 |
| **M1** | 窄屏导航溢出提示 | `reading-list.js`：`syncNavOverflow()` 动态加 `.nav-scrollable`，`styles.css` 用遮罩渐隐 | 330px 宽实测溢出 353>294px，渐隐启用 |
| **M2** | 往期列表量词 | `i18n.js`：新增 `archive_summary`（「共 N 期」） | 显示「共 3 期 · 最新第 03 期」 |
| **M4** | 搜索表单按钮 | `search.html`：补 `type="submit"` | `<button type="submit">` |

### 修复时新发现并一并处理的问题

- **深链直达时锚点根本落不到位**（加严复测才暴露，原 13 轮审计没抓到，因为当时只测了「点击导航」路径）：页面内容由 JSON 异步渲染，浏览器在目标区块还很短时就执行了 hash 滚动，随后每插入一条记录都把区块往下推。实测 320px 打开 `index.html#method`：滚动停在 533px，而区块在 7822px 处 —— **用户看到的是完全无关的内容**。`scroll-padding-top` 只管「滚到之后不被顶栏遮」，管不了「滚不滚得到」。已在 `reading-list.js` 加 `reseatAnchor()`：在页面沉降过程中多次重新落位，带三重让位守卫（用户滚动、点非锚点元素、hash 变成别的）。
- **`.topics-browser a` 作用域过宽**：这条规则本意是让「每个专题 = 一格卡片链接」，改成可展开列表后卡片头变成了 `<button>`，它就只命中条目内的论文链接，把每个链接撑成 **166px 高**（条目总高 277px，版面像被拉散）。已收窄为 `.topics-browser:not(.topic-list) a`，条目高度回到 131px。
- **专题里经典论文标题渲染成 `undefined`**：classics 记录只有 `title` 没有 `cn`，而 `EA.paperTitle` 在中文下返回 `item.cn`。`topics.js` 新增 `itemTitle()` 分流。
- **`test_classics_ui.js` / `test_search_pool.js` 因共享组件而失败**：两个 Node 契约测试都在裸 DOM 桩里跑页面脚本，需要补 `EA.reading` 桩（前者还新增了「每张卡都要注册一条清单记录」的断言）。
- **`reading-list.js` 已纳入 CI**：`pages.yml` 增加 `node --check reading-list.js` 与 `node --check topics.js`（后者原先漏检）。
- **语言切换时清单面板不刷新**：`reading-list.js` 在 `mount()` 里订阅 `EA.onChange`，切换语言时同步面板与按钮文案。

### 未做 / 需决策

- **D3 统计开关**：`search.js` 的 `window.goatcounter` 分支仍是「预留未启用」——它是开关问题不是死代码，要启用需配 `scripts/add_analytics.py --code` 并引入脚本。**这属于产品决策，未擅自开启。**
- **邮件订阅**：站点仍无 RSS 或订阅入口（原结论不变），需要接外部服务才能做。

---

*本报告所有结论均可复现：本地起 `python -m http.server 4321` 后，用 `playwright-core` + 系统 Edge 驱动即可重跑。修复后的验证脚本见第十节。*

---

## 十、可复跑的验证脚本

修复后的浏览器验证已归档进项目：

| 脚本 | 用途 |
|---|---|
| `scripts/audit/verify_fixes.js` | 19 项交互验证（覆盖全部 15 项修复），每项输出实测数值，失败即非零退出 |
| `scripts/audit/recheck_bugs_1_5.js` | **第一节五个真 bug 的加严复验**：6 种视口宽度 × 4 个锚点 × 深链/点击两种进入方式、`?e=` 参数矩阵 10 种取值（含 `0` / `-1` / `abc` / 空 / 小数 / 前导零）、两个弹窗的遮罩关闭、往期收藏跨页可见且能开详情、空清单导出禁用与连点不堆积 |
| `scripts/audit/capture_pages.js` | 桌面 + 移动共 8 个页面的截图与横向溢出检测 |

```bash
# 1. 起站点（仓库根目录）
python -m http.server 4321 --bind 127.0.0.1

# 2. 跑验证（playwright-core 不是项目依赖，用 PLAYWRIGHT_CORE 指向已装的实例）
node scripts/audit/verify_fixes.js
node scripts/audit/recheck_bugs_1_5.js
PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/audit/verify_fixes.js
```

覆盖：移动端锚点遮挡矩阵、深链落位、archive 参数回落、弹窗遮罩、5 页收藏入口与跨页清单保留、往期收藏跨页、空清单导出、语言/专题深链、首页路径可点、搜索收敛、往期量词、favicon/og/robots/sitemap/404 可访问性、搜索表单 submit、窄屏导航渐隐、404 入口。

> 这些脚本位于 `scripts/` 下，`scripts/prune_public.py` 会在部署前把整个目录剪掉，所以它们只存在于仓库、不会上线。

