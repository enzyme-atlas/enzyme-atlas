/**
 * Enzyme Atlas bilingual runtime (zh / en).
 *
 * Loaded synchronously in <head> on every page, before any page script.
 * Responsibilities:
 *   - resolve and persist the active language (?lang= > localStorage > zh)
 *   - translate static markup through data-i18n* attributes
 *   - expose vocabulary lookups for controlled data values (topics, sources, kinds, labels)
 *   - expose per-record field pickers for the inline `en` translations in the data files
 *   - render the language switch into [data-lang-slot]
 *
 * Data convention: Chinese values stay canonical in the JSON files (they are used as
 * filter keys and validation vocabularies); English is resolved at render time — either
 * from the controlled vocabularies below or from each record's `en` object.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'enzyme-atlas-lang';
  const SUPPORTED = ['zh', 'en'];

  const UI = {
    zh: {
      /* ---------- shared chrome ---------- */
      brand_aria: 'Enzyme Atlas 首页',
      search_placeholder: '搜索酶、EC 号、反应、底物、DOI 或作者',
      search_aria: '全站文献搜索',
      search_button: '搜索',
      nav_aria: '主导航',
      nav_home: '本周精选',
      nav_all: '全部收录',
      nav_classics: '经典论文',
      nav_topics: '研究专题',
      nav_method: '筛选标准',
      nav_editions: '往期精选',
      reading_list: '打开阅读清单',
      nf_title: '这个地址没有对应内容。',
      nf_desc: '链接可能已经失效，或者地址输入有误。下面几个入口覆盖了本站的全部内容。',
      nf_c1: '编辑筛选的本期推荐',
      nf_c2: '奠基工作与阅读路径',
      nf_c3: '按研究问题浏览',
      nf_c4: '按期号回看每一期',
      nf_c5: '标题、作者、DOI 或方法',
      nf_c6: '平台如何挑选文献',
      lang_aria: '切换语言：中文 / English',
      lang_label_zh: '中文',
      lang_label_en: 'EN',

      /* ---------- homepage ---------- */
      hero_title: '让重要的酶学研究，不再被错过。',
      hero_desc: '每周一更新。编辑筛选新论文，也持续整理改变领域的经典工作。',
      hero_button: '浏览本周精选',
      intent1_strong: '不知道该看什么',
      intent1_small: '从编辑精选开始',
      intent2_strong: '想系统理解一个方向',
      intent2_small: '进入专题阅读路径',
      intent3_strong: '已有明确问题',
      intent3_small: '搜索酶、反应或 DOI',
      edition_kicker: 'CURRENT EDITION',
      edition_loading: '正在载入本期信息',
      edition_summary_loading: '正在核对收录与精选数量…',
      edition_link: '查看完整收录 →',
      edition_date: '第 {num} 期 · {date}',
      edition_summary_html: '<strong>{total}</strong> 篇完整收录 <i></i> <strong>{featured}</strong> 篇编辑精选 <i></i> 覆盖 {range}',
      featured_eyebrow: 'CURATED THIS WEEK',
      featured_title: '本周最值得读的 {n} 篇',
      featured_title_plain: '本周最值得读的论文',
      featured_desc: '不是关键词命中列表。每一篇都说明结论、推荐理由、证据与适合读者。',
      featured_link: '查看全部收录 →',
      intake_eyebrow: 'COMPLETE INTAKE',
      intake_title: '本期全部收录',
      intake_desc: '精选以外的文献不会消失；完整收录池公开展示，数量与首页统计始终一致。',
      intake_link: '进入精确搜索 →',
      obs_eyebrow: 'EDITORIAL NOTES',
      obs_title: '本周领域观察',
      obs_desc: '把本期论文放回研究脉络中，给出少量可核查的观察，而不是个人相关性排序。',
      obs_f1: '本期重点',
      obs_f1_body: '正在整理本期研究脉络。',
      obs_f2: '证据边界',
      obs_f2_body: '正在核验推荐论文的证据层级。',
      obs_f3: '栏目覆盖',
      obs_f3_body: '正在核对各研究专题的本期覆盖情况。',
      editions_eyebrow: 'PAST EDITIONS',
      editions_title: '往期精选',
      editions_desc: '按期号存档每一期内容。推出新一期时，此前的推荐与完整收录自动保留归档。',
      editions_link: '查看全部往期 →',
      editions_open: '查看本期内容',
      editions_empty: '往期归档正在整理中。',
      editions_none_yet: '当前仅有一期，后续每期发布后将自动出现在这里。',
      editions_card_meta: '{date} · 第 {num} 期',
      editions_card_counts: '{total} 篇收录 · {featured} 篇精选',
      classics_eyebrow: 'FOUNDATIONAL READING',
      classics_title: '经典论文，也是一条进入领域的路线。',
      classics_desc: '按研究问题与方法组织奠基工作，覆盖多酶级联、空间组装、融合酶、定向进化等方向。',
      classics_button: '进入经典论文库',
      reading_path_label: '推荐阅读路径',
      path1: '多酶级联催化',
      path1_small: '从反应耦合到体系设计',
      path2: '空间组装与底物通道化',
      path2_small: '从共定位到人工细胞器',
      path3: '融合酶设计',
      path3_small: '连接肽、结构域与协同机制',
      path4: '酶的定向进化',
      path4_small: '从突变库到数据驱动设计',
      path_link: '浏览全部研究专题 →',
      method_eyebrow: 'EDITORIAL PRINCIPLES',
      method_title: '推荐值得被解释。',
      method_desc: '平台面向所有酶研究者，不依据个人研究方向改变公共排序。',
      fact_freq_dt: '更新频率',
      fact_freq_dd: '每周一',
      fact_src_dt: '本期来源',
      fact_src_dd: '真实 DOI',
      fact_mode_dt: '推荐方式',
      fact_mode_dd: '编辑筛选',
      p1_title: '公共领域价值',
      p1_body: '不做个人相关性推荐，按研究价值与证据质量评估。',
      p2_title: '证据优先',
      p2_body: '区分原文结论、平台摘要与编辑评价，避免过度推断。',
      p3_title: '新旧并重',
      p3_body: '追踪新工作，也保存真正改变领域的经典研究。',
      p4_title: '可追溯',
      p4_body: '公开本期总数、更新日期、DOI 与推荐理由。',

      /* ---------- archive ---------- */
      archive_eyebrow: 'EDITION ARCHIVE',
      archive_title: '往期精选',
      archive_desc: '按期号存档每一期推荐与完整收录，可逐期回看。',
      archive_switch_label: '按期号浏览',
      archive_latest_tag: '最新一期',
      archive_open: '查看该期 →',
      archive_back: '← 返回期号列表',
      archive_featured_title: '该期最值得读的 {n} 篇',
      archive_intake_title: '该期全部收录',
      archive_obs_title: '该期领域观察',
      archive_loading: '正在载入期号数据…',
      archive_error: '期号数据未能载入，请稍后重试。',
      archive_notfound: '未找到该期号，请从列表中选择。',
      archive_summary: '共 {total} 期 · 最新第 {current} 期',
      archive_viewing: '正在查看第 {num} 期（{date}）',
      archive_readonly_note: '往期内容为存档视图，收藏与阅读清单请回到首页当期使用。',

      /* ---------- classics page ---------- */
      classics_hero_title: '经典论文库',
      classics_hero_desc: '经典不等于高被引。这里收录改变研究范式、建立常用方法、提出机制框架，或成为研究方向起点的工作。',
      rule_paradigm: '范式转折',
      rule_method: '方法学基石',
      rule_mechanism: '机制框架',
      rule_primer: '专题入门',
      rule_cascade: '级联组装与融合',
      classics_purpose: '经典库用于系统学习，不参与每周新论文的推荐排序。优先纳入 Nature、Science、Cell 正刊的重要酶研究，并系统补充 Nature 子刊与少量其他期刊；每篇均可通过 DOI 直达出版页面。',
      classics_toolbar: '按出版来源浏览',
      classics_loading: '正在载入经典论文…',
      classics_count_all: '共整理 <strong>{n}</strong> 篇 · 覆盖 {m} 条阅读路径 · 每篇均有 DOI / 出版社入口',
      classics_count_filter: '{source} <strong>{n}</strong> 篇 · 覆盖 {m} 条阅读路径',
      classics_filter_all: '全部',
      classics_doi_link: '打开 DOI / 出版社页面 ↗',
      classics_error: '经典论文暂时无法载入，请稍后刷新。',

      /* ---------- topics page ---------- */
      topics_eyebrow: 'EXPLORE BY QUESTION',
      topics_title: '研究专题',
      topics_desc: '专题用于系统理解一个方向和进入阅读路径，不作为首页的重复筛选器。平台仍按公共领域价值进行每周推荐。',
      topics_purpose: '如果你已有具体酶名、EC 号、反应或 DOI，请直接使用顶部搜索。若你想建立一个方向的整体认识，从下面的专题入口开始。',
      topics_coverage: '每个专题汇集经典论文与本周/往期新论文；一篇文献可归入多个专题，但不会勉强归类。',
      topics_classics: '经典论文',
      topics_weekly: '本周与往期新论文',
      topics_empty: '该专题暂无文献。',
      topics_error: '研究专题载入失败，请稍后重试。',

      /* ---------- search page ---------- */
      search_eyebrow: 'KNOWN-ITEM LOOKUP',
      search_title: '搜索文献',
      search_desc: '在本站全部收录（本周精选、往期精选与经典论文库）中查找。搜索负责“找得到”，首页推荐负责“不会错过”。',
      search_purpose: '覆盖本站全部收录记录，支持论文标题、作者、期刊、酶学主题、DOI 与方法关键词。搜索结果不会改变首页的公共推荐排序。',
      search_input_placeholder: '例如：cascade、10.1038/…、定向进化',
      search_input_aria: '输入文献搜索词',
      search_results_title: '“{q}”的搜索结果',
      search_note: '共找到 {n} 篇真实 DOI 文献。搜索不会改变首页的公共推荐排序。',
      search_idle_note: '检索池覆盖本站全部收录（本周精选、往期精选与经典论文库）。可搜索标题、作者、期刊、酶学主题、DOI 与方法关键词。',
      search_scope_current: '本周精选',
      search_scope_past: '往期 {num}',
      search_scope_classic: '经典论文库',
      search_pool_note: '检索池覆盖本站全部收录：本周 {weekly} 篇、往期 {past} 篇、经典库 {classic} 篇，共 {total} 篇。',
      search_empty: '未找到匹配文献。请尝试英文名称、DOI、同义词或更宽泛的反应关键词。',
      search_preview_note: '当前显示前 {shown} 条（检索池共 {total} 篇）。输入关键词可精确缩小范围，例如 cascade、定向进化或 10.1038/…。',
      search_error: '文献数据未能载入，请确认本地服务器正在运行。',

      /* ---------- records / dialogs / reading list ---------- */
      card_why: '推荐理由',
      card_audience_prefix: '适合：',
      minutes_short: '{n} 分钟',
      minutes_unit: '分钟',
      min_scan: '{n} 分钟扫读',
      act_quick: '快速扫读',
      act_doi: 'DOI / 原文 ↗',
      act_save: '收藏',
      act_saved: '已收藏',
      act_later: '稍后读',
      act_later_on: '已加入',
      act_read: '标为已读',
      act_read_on: '已读',
      act_hide: '隐藏',
      act_remove: '移除',
      intake_count_html: '<strong>{total}</strong> 篇真实 DOI 文献 · 当前显示 {shown} 篇 · 已隐藏 {hidden} 篇',
      empty_intake: '当前没有可显示的收录文献。可在阅读清单中恢复已隐藏条目。',
      data_error: '文献数据未能载入，请确认本地服务器正在运行。',
      dialog_close: '关闭',
      quick_meta: '{topic} · {type} · {minutes} 分钟扫读',
      q_summary: '一句话结论',
      q_why: '为什么进入精选',
      q_evidence: '关键证据',
      q_audience: '适合谁读',
      q_verification: '来源核验',
      q_doi: '打开 DOI / 原文 ↗',
      saved_eyebrow: 'YOUR READING LIST',
      saved_title: '我的阅读清单',
      export_bibtex: '导出收藏为 BibTeX',
      sec_saved: '收藏',
      sec_later: '稍后读',
      sec_read: '已读',
      sec_hidden: '已隐藏',
      list_empty: '暂无条目。',
      export_needs_saved: '请先收藏至少一篇文献。',

      /* ---------- footer ---------- */
      footer_desc: '面向所有酶研究者的每周文献推荐平台。',
      footer_discover: '发现',
      footer_reading: '阅读',
      footer_about: '关于',
      footer_search: '文献搜索',
      footer_cascade: '级联组装与融合',
      footer_weekly: '每周一更新',
      footer_beta: '内部试运行版',

      /* ---------- document titles ---------- */
      title_home: 'Enzyme Atlas | 酶学文献推荐',
      title_classics: '经典论文库 | Enzyme Atlas',
      title_topics: '研究专题 | Enzyme Atlas',
      title_search: '搜索文献 | Enzyme Atlas',
      title_archive: '往期精选 | Enzyme Atlas',
      title_notfound: '页面不存在 | Enzyme Atlas',
      meta_home: '面向所有酶研究者的每周文献推荐、完整收录与经典阅读路径。',
      meta_classics: '按研究问题和方法组织的酶学经典论文阅读库。',
      meta_topics: '按研究问题浏览 Enzyme Atlas 的酶学专题入口。',
      meta_search: '在 Enzyme Atlas 已收录的真实 DOI 文献中精确搜索。',
      meta_archive: '按期号回看 Enzyme Atlas 每一期的编辑精选与完整收录。',
      meta_notfound: '该页面不存在。返回 Enzyme Atlas 首页继续浏览每周酶学文献推荐。',
    },

    en: {
      brand_aria: 'Enzyme Atlas home',
      search_placeholder: 'Search enzymes, EC numbers, reactions, substrates, DOI or authors',
      search_aria: 'Site-wide literature search',
      search_button: 'Search',
      nav_aria: 'Main navigation',
      nav_home: 'This Week',
      nav_all: 'Full Intake',
      nav_classics: 'Classics',
      nav_topics: 'Topics',
      nav_method: 'Standards',
      nav_editions: 'Past Editions',
      reading_list: 'Open reading list',
      nf_title: 'Nothing lives at this address.',
      nf_desc: 'The link may have expired, or the address was mistyped. These six entries cover everything the site publishes.',
      nf_c1: 'The editors\u2019 picks this week',
      nf_c2: 'Foundational work and reading paths',
      nf_c3: 'Browse by research question',
      nf_c4: 'Revisit each edition by number',
      nf_c5: 'Title, author, DOI or method',
      nf_c6: 'How papers are selected',
      lang_aria: 'Switch language: Chinese / English',
      lang_label_zh: '中文',
      lang_label_en: 'EN',

      hero_title: 'So that important enzyme research never gets missed.',
      hero_desc: 'Updated every Monday. Editors select new papers and keep curating the classics that changed the field.',
      hero_button: 'Browse this week',
      intent1_strong: 'Not sure what to read',
      intent1_small: 'Start with the editor\u2019s picks',
      intent2_strong: 'Want a systematic view',
      intent2_small: 'Follow a topic reading path',
      intent3_strong: 'Already have a question',
      intent3_small: 'Search an enzyme, reaction or DOI',
      edition_kicker: 'CURRENT EDITION',
      edition_loading: 'Loading current edition',
      edition_summary_loading: 'Verifying intake and featured counts…',
      edition_link: 'View full intake →',
      edition_date: 'Edition {num} · {date}',
      edition_summary_html: '<strong>{total}</strong> papers in full intake <i></i> <strong>{featured}</strong> editor\'s picks <i></i> covering {range}',
      featured_eyebrow: 'CURATED THIS WEEK',
      featured_title: 'The {n} papers worth reading this week',
      featured_title_plain: 'The papers worth reading this week',
      featured_desc: 'Not a keyword hit list. Every entry states its conclusion, why it was picked, the supporting evidence and who should read it.',
      featured_link: 'View all intake →',
      intake_eyebrow: 'COMPLETE INTAKE',
      intake_title: 'Full intake for this edition',
      intake_desc: 'Papers outside the picks do not disappear. The full intake pool is public, and its count always matches the homepage statistics.',
      intake_link: 'Go to precise search →',
      obs_eyebrow: 'EDITORIAL NOTES',
      obs_title: 'This week\u2019s field notes',
      obs_desc: 'Places this edition back into its research context with a few checkable observations, instead of a personal relevance ranking.',
      obs_f1: 'This edition\u2019s focus',
      obs_f1_body: 'Compiling the research context for this edition.',
      obs_f2: 'Evidence boundary',
      obs_f2_body: 'Verifying the evidence level behind each recommended paper.',
      obs_f3: 'Section coverage',
      obs_f3_body: 'Checking this edition\u2019s coverage across research topics.',
      editions_eyebrow: 'PAST EDITIONS',
      editions_title: 'Past editions',
      editions_desc: 'Every edition is archived by number. When a new edition ships, previous picks and full intake are preserved automatically.',
      editions_link: 'View all past editions →',
      editions_open: 'Open this edition',
      editions_empty: 'The archive is being prepared.',
      editions_none_yet: 'Only one edition exists so far; later editions will appear here automatically.',
      editions_card_meta: '{date} · Edition {num}',
      editions_card_counts: '{total} papers · {featured} picks',
      classics_eyebrow: 'FOUNDATIONAL READING',
      classics_title: 'Classic papers are also a route into the field.',
      classics_desc: 'Foundational work organised by research question and method, spanning multi-enzyme cascades, spatial assembly, fusion enzymes and directed evolution.',
      classics_button: 'Enter the classics library',
      reading_path_label: 'Recommended reading paths',
      path1: 'Multi-enzyme cascade catalysis',
      path1_small: 'From reaction coupling to system design',
      path2: 'Spatial assembly & substrate channelling',
      path2_small: 'From co-localisation to artificial organelles',
      path3: 'Fusion enzyme design',
      path3_small: 'Linkers, domain order and synergy mechanisms',
      path4: 'Directed enzyme evolution',
      path4_small: 'From mutation libraries to data-driven design',
      path_link: 'Browse all research topics →',
      method_eyebrow: 'EDITORIAL PRINCIPLES',
      method_title: 'Recommendations deserve an explanation.',
      method_desc: 'Built for all enzyme researchers; the public ranking never shifts to fit one person\u2019s research direction.',
      fact_freq_dt: 'Frequency',
      fact_freq_dd: 'Every Monday',
      fact_src_dt: 'Sources',
      fact_src_dd: 'Real DOIs',
      fact_mode_dt: 'Selection',
      fact_mode_dd: 'Editorial',
      p1_title: 'Public value',
      p1_body: 'No personal relevance ranking; papers are assessed by research value and evidence quality.',
      p2_title: 'Evidence first',
      p2_body: 'Separates source conclusions, platform summaries and editorial judgement to avoid overreach.',
      p3_title: 'New and old',
      p3_body: 'Tracks new work while preserving the classics that genuinely changed the field.',
      p4_title: 'Traceable',
      p4_body: 'Publishes edition counts, update dates, DOIs and the reason each paper was picked.',

      archive_eyebrow: 'EDITION ARCHIVE',
      archive_title: 'Past editions',
      archive_desc: 'Every edition is archived by number, so each week\u2019s picks and full intake stay readable.',
      archive_switch_label: 'Browse by edition',
      archive_latest_tag: 'Latest',
      archive_open: 'Open edition →',
      archive_back: '← Back to edition list',
      archive_featured_title: 'The {n} papers worth reading in this edition',
      archive_intake_title: 'Full intake for this edition',
      archive_obs_title: 'Field notes for this edition',
      archive_loading: 'Loading edition data…',
      archive_error: 'Edition data could not be loaded. Please try again later.',
      archive_notfound: 'That edition number was not found. Pick one from the list.',
      archive_summary: '{total} editions archived · latest is Edition {current}',
      archive_viewing: 'Viewing Edition {num} ({date})',
      archive_readonly_note: 'Archived editions are read-only; use the current edition on the homepage for saving and reading lists.',

      classics_hero_title: 'Classics library',
      classics_hero_desc: 'Classic does not simply mean highly cited. This library collects work that changed a research paradigm, established a common method, proposed a mechanistic framework, or became the starting point of a research direction.',
      rule_paradigm: 'Paradigm shift',
      rule_method: 'Methodological cornerstone',
      rule_mechanism: 'Mechanistic framework',
      rule_primer: 'Topic primer',
      rule_cascade: 'Cascade assembly & fusion',
      classics_purpose: 'The classics library supports systematic study and does not compete with the weekly ranking. Priority goes to important enzyme research in Nature, Science and Cell, systematically complemented by Nature journals and a small number of other venues; every entry reaches the publisher page through its DOI.',
      classics_toolbar: 'Browse by publication source',
      classics_loading: 'Loading classic papers…',
      classics_count_all: '<strong>{n}</strong> papers curated · covering {m} reading paths · every entry has a DOI / publisher link',
      classics_count_filter: '{source}: <strong>{n}</strong> papers · covering {m} reading paths',
      classics_filter_all: 'All',
      classics_doi_link: 'Open DOI / publisher page ↗',
      classics_error: 'Classic papers are temporarily unavailable. Please refresh later.',

      topics_eyebrow: 'EXPLORE BY QUESTION',
      topics_title: 'Research topics',
      topics_desc: 'Topics help you understand a direction and start a reading path; they are not a duplicate filter of the homepage. Weekly recommendations still follow public value.',
      topics_purpose: 'If you already have a specific enzyme, EC number, reaction or DOI, use the search at the top. To build an overall picture of a direction, start from the topics below.',
      topics_coverage: 'Each topic gathers classics and current/past weekly papers; a paper can belong to several topics, but is never forced into one.',
      topics_classics: 'Classics',
      topics_weekly: 'Current & past weekly papers',
      topics_empty: 'No papers under this topic yet.',
      topics_error: 'Failed to load topics; please try again later.',

      search_eyebrow: 'KNOWN-ITEM LOOKUP',
      search_title: 'Search the literature',
      search_desc: 'Look anything up across every record on the site: this week, past editions and the classics library. Search helps you find it; the homepage helps you not miss it.',
      search_purpose: 'Covers every record on the site, supporting titles, authors, journals, enzymology topics, DOIs and method keywords. Search results never change the public ranking on the homepage.',
      search_input_placeholder: 'e.g. cascade, 10.1038/…, directed evolution',
      search_input_aria: 'Enter a literature search term',
      search_results_title: 'Results for “{q}”',
      search_note: '{n} real-DOI records found. Searching never changes the public ranking.',
      search_idle_note: 'The pool covers every record on the site (this week, past editions and the classics library). Search titles, authors, journals, enzymology topics, DOIs and method keywords.',
      search_scope_current: 'This week',
      search_scope_past: 'Past {num}',
      search_scope_classic: 'Classics',
      search_pool_note: 'The pool covers every record on the site: {weekly} this week, {past} past editions and {classic} classics — {total} in total.',
      search_empty: 'No matching records. Try the English name, a DOI, a synonym or a broader reaction keyword.',
      search_preview_note: 'Showing the first {shown} of {total} records. Enter a keyword to narrow the list — try cascade, directed evolution or 10.1038/…',
      search_error: 'Literature data could not be loaded; check that the server is running.',

      card_why: 'Why',
      card_audience_prefix: 'For: ',
      minutes_short: '{n} min',
      minutes_unit: 'min',
      min_scan: '{n} min scan',
      act_quick: 'Quick read',
      act_doi: 'DOI / full text ↗',
      act_save: 'Save',
      act_saved: 'Saved',
      act_later: 'Read later',
      act_later_on: 'Added',
      act_read: 'Mark as read',
      act_read_on: 'Read',
      act_hide: 'Hide',
      act_remove: 'Remove',
      intake_count_html: '<strong>{total}</strong> real-DOI records · showing {shown} · {hidden} hidden',
      empty_intake: 'No records to display. Restore hidden entries from the reading list.',
      data_error: 'Literature data could not be loaded; check that the server is running.',
      dialog_close: 'Close',
      quick_meta: '{topic} · {type} · {minutes} min scan',
      q_summary: 'In one sentence',
      q_why: 'Why it was picked',
      q_evidence: 'Key evidence',
      q_audience: 'Who should read it',
      q_verification: 'Source verification',
      q_doi: 'Open DOI / full text ↗',
      saved_eyebrow: 'YOUR READING LIST',
      saved_title: 'My reading list',
      export_bibtex: 'Export saved items as BibTeX',
      sec_saved: 'Saved',
      sec_later: 'Read later',
      sec_read: 'Read',
      sec_hidden: 'Hidden',
      list_empty: 'No entries yet.',
      export_needs_saved: 'Save at least one paper first.',

      footer_desc: 'A weekly literature recommendation platform for all enzyme researchers.',
      footer_discover: 'Discover',
      footer_reading: 'Reading',
      footer_about: 'About',
      footer_search: 'Literature search',
      footer_cascade: 'Cascade assembly & fusion',
      footer_weekly: 'Updated every Monday',
      footer_beta: 'Internal preview build',

      title_home: 'Enzyme Atlas | Weekly enzyme literature',
      title_classics: 'Classics | Enzyme Atlas',
      title_topics: 'Research topics | Enzyme Atlas',
      title_search: 'Search | Enzyme Atlas',
      title_archive: 'Past editions | Enzyme Atlas',
      meta_home: 'Weekly enzyme literature recommendations, full intake and classic reading paths for all enzyme researchers.',
      meta_classics: 'A classics reading library for enzymology, organised by research question and method.',
      meta_topics: 'Browse Enzyme Atlas research topic entry points by question.',
      meta_search: 'Precise search across the real-DOI records collected by Enzyme Atlas.',
      meta_archive: 'Revisit the editor\u2019s picks and full intake of every Enzyme Atlas edition by number.',
      title_notfound: 'Page not found | Enzyme Atlas',
      meta_notfound: 'That page does not exist. Head back to Enzyme Atlas to browse weekly enzyme literature.',
    },
  };

  /* Controlled vocabularies: Chinese value (canonical in data) → English display. */
  const VOCAB = {
    topics: {
      'AI 与机器学习辅助酶研究': 'AI & machine learning for enzymology',
      '定向进化与理性设计': 'Directed evolution & rational design',
      '酶催化方法与分析技术': 'Biocatalysis methods & analytics',
      '酶固定化与酶—材料体系': 'Enzyme immobilization & enzyme–material systems',
      '酶的发现与挖掘': 'Enzyme discovery & mining',
      '酶的级联组装': 'Enzyme cascade assembly',
      '酶的结构与催化机制': 'Enzyme structure & catalytic mechanism',
      '酶的稳定性工程': 'Enzyme stability engineering',
      '酶动力学、选择性与底物特异性': 'Enzyme kinetics, selectivity & substrate specificity',
      '多酶级联反应': 'Multi-enzyme cascades',
      '融合酶与多功能酶': 'Fusion enzymes & multifunctional enzymes',
      '计算酶学与分子模拟': 'Computational enzymology & molecular simulation',
      '辅因子、辅酶与再生': 'Cofactors, coenzymes & regeneration',
      '酶的应用与环境生物催化': 'Enzyme applications & environmental biocatalysis',
    },
    classicTopics: {
      'RNA 加工酶': 'RNA-processing enzymes',
      'RNA 酶': 'Ribozymes',
      '从头酶设计': 'De novo enzyme design',
      '信号酶': 'Signalling enzymes',
      '催化机制': 'Catalytic mechanism',
      '变构调控': 'Allosteric regulation',
      '塑料降解': 'Plastic degradation',
      '多酶级联': 'Multi-enzyme cascades',
      '定向进化': 'Directed evolution',
      '底物特异性': 'Substrate specificity',
      '新功能酶': 'Enzymes with new functions',
      '机器学习': 'Machine learning',
      '机器学习与酶工程': 'Machine learning & enzyme engineering',
      '核糖核蛋白酶': 'Ribonucleoprotein enzymes',
      '核酸酶': 'Nucleases',
      '溶剂耐受性': 'Solvent tolerance',
      '热稳定性工程': 'Thermostability engineering',
      '理性设计': 'Rational design',
      '生物催化': 'Biocatalysis',
      '稳定性工程': 'Stability engineering',
      '结构酶学': 'Structural enzymology',
      '结构预测': 'Structure prediction',
      '蛋白酶结构': 'Protease structure',
      '融合酶': 'Fusion enzymes',
      '计算酶设计': 'Computational enzyme design',
      '辅因子再生': 'Cofactor regeneration',
      '酶固定化': 'Enzyme immobilization',
      '酶的级联组装': 'Enzyme cascade assembly',
      '酶的进化': 'Enzyme evolution',
      '酶稳定性': 'Enzyme stability',
      '非天然催化': 'Non-natural catalysis',
    },
    sourceGroups: {
      'Nature 正刊': 'Nature (main journal)',
      'Science 正刊': 'Science (main journal)',
      'Cell 正刊': 'Cell (main journal)',
      'Nature 子刊': 'Nature journals',
      '其他精选': 'Other selected',
    },
    kinds: {
      '原创研究': 'Original research',
      '方法': 'Method',
      '综述': 'Review',
    },
    types: {
      original: 'Original research',
      perspective: 'Perspective',
      review: 'Review',
    },
    labels: {
      'Kcat 预测': 'Kcat prediction',
      'MSA 方法': 'MSA-based method',
      'SpyCatcher 组装': 'SpyCatcher assembly',
      '上位性建模': 'Epistasis modelling',
      '专题综述': 'Topic review',
      '仅计算验证': 'In-silico only',
      '体外概念验证': 'In vitro proof of concept',
      '供需匹配': 'Supply–demand matching',
      '修订版本': 'Revised version',
      '催化残基预测': 'Catalytic residue prediction',
      '克级放大': 'Gram-scale',
      '入门地图': 'Starter map',
      '可微优化': 'Differentiable optimization',
      '可检验假说': 'Testable hypothesis',
      '在线先行': 'Online first',
      '基准设计': 'Benchmark design',
      '多实验室验证': 'Multi-lab validation',
      '多层实验验证': 'Multi-layer validation',
      '实验研究': 'Experimental study',
      '实验验证': 'Experimental validation',
      '局部微环境': 'Local microenvironment',
      '工业菌株': 'Industrial strain',
      '开放获取': 'Open access',
      '新酶反应': 'Novel enzyme reaction',
      '方法综述': 'Methods review',
      '无辅因子': 'Cofactor-free',
      '有预印本': 'Preprint available',
      '机制研究': 'Mechanistic study',
      '机制综述': 'Mechanistic review',
      '概念演示': 'Concept demonstration',
      '气体驱动': 'Gas-powered',
      '漆酶固定化': 'Laccase immobilization',
      '环境酶学': 'Environmental enzymology',
      '界面酶学': 'Interfacial enzymology',
      '目标驱动设计': 'Goal-driven design',
      '真实原料验证': 'Real-feedstock validation',
      '硅橡胶载体': 'Silicone carriers',
      '系统综述': 'Systematic review',
      '纤维素酶分泌': 'Cellulase secretion',
      '纯序列方法': 'Sequence-only method',
      '组合突变': 'Combinatorial mutations',
      '细胞-酶杂化': 'Cell–enzyme hybrid',
      '自身免疫': 'Autoimmunity',
      '观点性文章': 'Perspective article',
      '观点论文': 'Perspective paper',
      '规模化边界': 'Scale-up limits',
      '计算筛选': 'Computational screening',
      '载体比较': 'Carrier comparison',
      '载体非惰性': 'Non-inert carriers',
      '过程强化': 'Process intensification',
      '酶发现': 'Enzyme discovery',
      '高对映选择性': 'High enantioselectivity',
    },
  };

  /* Paper `type` values are English tokens in the data, so they need a Chinese
     display table as well as the English one. */
  const TYPE_ZH = {
    original: '原创研究',
    perspective: '观点',
    review: '综述',
  };

  function readStoredLang() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function storeLang(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      /* storage unavailable: language simply does not persist */
    }
  }

  const params = new URLSearchParams(location.search);
  const requested = params.get('lang');
  let lang = SUPPORTED.includes(requested) ? requested : readStoredLang();
  if (!SUPPORTED.includes(lang)) lang = 'zh';

  const listeners = [];

  /** UI string lookup with {placeholder} interpolation. */
  function t(key, vars) {
    const table = UI[lang] || UI.zh;
    let value = table[key];
    if (value === undefined) value = UI.zh[key];
    if (value === undefined) return key;
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
    }
    return value;
  }

  /** Vocabulary lookup for controlled data values (falls back to the canonical value). */
  function v(mapName, value) {
    if (lang !== 'en') return value;
    const map = VOCAB[mapName] || {};
    return map[value] || value;
  }

  /** Per-record field picker: prefers the record's inline `en` value in English mode. */
  function pick(record, field) {
    if (lang === 'en' && record && record.en && record.en[field]) return record.en[field];
    return record ? record[field] : '';
  }

  /** Localized list field (e.g. labels), translated through the label vocabulary. */
  function pickList(record, field) {
    const raw = pick(record, field);
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => (typeof entry === 'string' ? v('labels', entry) : entry));
  }

  /** Paper display title: English title in English mode, Chinese title otherwise. */
  function paperTitle(item) {
    return lang === 'en' ? item.title : item.cn;
  }

  function classicTopic(item) {
    return v('classicTopics', pick(item, 'topic'));
  }

  function sourceGroup(item) {
    return v('sourceGroups', pick(item, 'sourceGroup'));
  }

  function kind(item) {
    return v('kinds', pick(item, 'kind'));
  }

  function typeLabel(type) {
    if (lang === 'en') return VOCAB.types[type] || type;
    return TYPE_ZH[type] || type;
  }

  const ATTRS = [
    ['data-i18n', (node, value) => { node.textContent = value; }],
    ['data-i18n-html', (node, value) => { node.innerHTML = value; }],
    ['data-i18n-placeholder', (node, value) => { node.setAttribute('placeholder', value); }],
    ['data-i18n-aria', (node, value) => { node.setAttribute('aria-label', value); }],
    ['data-i18n-title', (node, value) => { node.setAttribute('title', value); }],
    ['data-i18n-content', (node, value) => { node.setAttribute('content', value); }],
  ];

  /** Translates all marked-up nodes under `root`. */
  function applyStatic(root) {
    const scope = root || document;
    ATTRS.forEach(([attribute, apply]) => {
      scope.querySelectorAll('[' + attribute + ']').forEach((node) => {
        const key = node.getAttribute(attribute);
        const vars = node.getAttribute('data-i18n-vars');
        apply(node, t(key, vars ? JSON.parse(vars) : null));
      });
    });
    const page = document.body ? document.body.getAttribute('data-page') : null;
    if (page && UI[lang]['title_' + page]) document.title = t('title_' + page);
    const meta = document.querySelector('meta[name="description"]');
    if (page && meta && UI[lang]['meta_' + page]) meta.setAttribute('content', t('meta_' + page));
  }

  function mountSwitch() {
    document.querySelectorAll('[data-lang-slot]').forEach((slot) => {
      slot.innerHTML =
        '<div class="lang-switch" role="group" aria-label="' + t('lang_aria') + '">' +
        SUPPORTED.map((code) =>
          '<button type="button" class="lang-option' + (code === lang ? ' active' : '') +
          '" data-lang-option="' + code + '" aria-pressed="' + (code === lang) + '">' +
          t(code === 'zh' ? 'lang_label_zh' : 'lang_label_en') + '</button>'
        ).join('') +
        '</div>';
      slot.querySelectorAll('[data-lang-option]').forEach((button) => {
        button.addEventListener('click', () => setLang(button.getAttribute('data-lang-option')));
      });
    });
  }

  /**
   * Mirror the language into the address bar so an English view can be shared
   * and indexed. `history.replaceState` is used rather than a reload: switching
   * language already re-renders in place, and a push would fight the back button.
   */
  function syncUrlLang() {
    if (!window.history || !window.history.replaceState) return;
    let url;
    try {
      url = new URL(location.href);
    } catch (error) {
      return;
    }
    if (lang === 'en') {
      url.searchParams.set('lang', 'en');
    } else {
      url.searchParams.delete('lang');
    }
    const next = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams : '') + url.hash;
    if (next !== location.pathname + location.search + location.hash) {
      history.replaceState(null, '', next);
    }
  }

  function setLang(next) {
    if (!SUPPORTED.includes(next) || next === lang) return;
    lang = next;
    storeLang(lang);
    syncUrlLang();
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    applyStatic(document);
    mountSwitch();
    listeners.forEach((fn) => {
      try {
        fn(lang);
      } catch (error) {
        console.error('language listener failed', error);
      }
    });
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  window.EA = {
    SUPPORTED,
    t,
    v,
    pick,
    pickList,
    paperTitle,
    classicTopic,
    sourceGroup,
    kind,
    typeLabel,
    applyStatic,
    mountSwitch,
    setLang,
    syncUrlLang,
    onChange,
    getLang: () => lang,
  };

  function boot() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    applyStatic(document);
    mountSwitch();
    syncUrlLang();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
