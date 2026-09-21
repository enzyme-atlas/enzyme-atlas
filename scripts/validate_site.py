"""Static acceptance checks for the Enzyme Atlas prototype."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from weekly_contract import validate_edition
from check_public_disclosure import active_deny_tokens, scan as scan_disclosure

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--online", action="store_true", help="Verify every DOI against the Crossref API.")
args = parser.parse_args()
data = json.loads((ROOT / "data" / "papers.json").read_text(encoding="utf-8"))
items = data["items"]
validate_edition(data)
classics_data = json.loads((ROOT / "data" / "classics.json").read_text(encoding="utf-8"))
classics = classics_data["items"]
assert items, "no papers"
assert 3 <= sum(bool(p["featured"]) for p in items) <= 5, "featured count must be 3–5"
edition_date = dt.date.fromisoformat(data["updatedAt"])
period_start = dt.date.fromisoformat(data["periodStart"])
period_end = dt.date.fromisoformat(data["periodEnd"])
assert edition_date.weekday() == 0, "weekly edition must be dated Monday"
assert edition_date == period_end and period_start <= period_end, "invalid edition period"
assert data["source"] != "curated_seed", "weekly edition still uses seed data"
assert len(data.get("observations", [])) == 3, "weekly observations are missing"
for p in items:
    for key in ("title", "cn", "doi", "url", "why", "evidence", "audience", "minutes", "labels", "verification"):
        assert p.get(key), f"{p.get('id')} missing {key}"
    assert p["url"] == f"https://doi.org/{p['doi']}", f"{p['id']} has non-DOI URL"
    assert period_start <= dt.date.fromisoformat(p["date"]) <= period_end, f"{p['id']} is outside the weekly window"
    assert "等待编辑" not in json.dumps(p, ensure_ascii=False), f"{p['id']} still contains automatic placeholder copy"
source_minimums = {
    "Nature 正刊": 7,
    "Science 正刊": 5,
    "Cell 正刊": 5,
    "Nature 子刊": 12,
    "其他精选": 8,
}
assert len(classics) >= 50, "classic library must contain at least 50 records"
assert len({c["doi"].lower() for c in classics}) == len(classics), "duplicate DOI in classic library"
for source_group, minimum in source_minimums.items():
    count = sum(c["sourceGroup"] == source_group for c in classics)
    assert count >= minimum, f"{source_group} has only {count} records"
assert sum(c["sourceGroup"] == "其他精选" for c in classics) / len(classics) <= 0.35, "other journals are no longer a minority"
for c in classics:
    for key in ("topic", "year", "title", "authors", "journal", "sourceGroup", "kind", "note", "doi"):
        assert c.get(key), f"classic record missing {key}: {c.get('title')}"
    assert c.get("en", {}).get("note"), f"classic record missing English note: {c['title']}"
    if c["sourceGroup"] == "Nature 正刊":
        assert c["journal"] == "Nature", f"Nature main-journal mismatch: {c['title']}"
    if c["sourceGroup"] == "Science 正刊":
        assert c["journal"] == "Science", f"Science main-journal mismatch: {c['title']}"
    if c["sourceGroup"] == "Cell 正刊":
        assert c["journal"] == "Cell", f"Cell main-journal mismatch: {c['title']}"
if args.online:
    def verify_crossref(record):
        request = Request(f"https://api.crossref.org/works/{quote(record['doi'], safe='')}", headers={"User-Agent": "EnzymeAtlas/0.3 (mailto:maintainer@example.org)"})
        try:
            with urlopen(request, timeout=30) as response:
                message = json.load(response)["message"]
        except (HTTPError, URLError) as error:
            raise AssertionError(f"Crossref lookup failed for {record['doi']} ({record['title']}): {error}") from error
        assert message["DOI"].lower() == record["doi"].lower(), f"Crossref DOI mismatch: {record['doi']}"
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(verify_crossref, [*items, *classics]))

# ---- edition archive --------------------------------------------------------
manifest = json.loads((ROOT / "data" / "editions.json").read_text(encoding="utf-8"))
assert manifest["current"] == data["edition"], "manifest current edition does not match the published edition"
assert manifest["updatedAt"] == data["updatedAt"], "manifest updatedAt does not match the published edition"
entries = manifest["editions"]
assert [entry["edition"] for entry in entries] == sorted({entry["edition"] for entry in entries}, reverse=True), "edition numbers must be unique and descending"
assert entries[0]["edition"] == data["edition"] and entries[0]["path"] == "data/papers.json", "current edition must lead the manifest"
archived = sorted(path.name for path in (ROOT / "data" / "history").glob("papers-*.json"))
manifest_archives = sorted(Path(entry["path"]).name for entry in entries if entry["path"].startswith("data/history/"))
assert manifest_archives == archived, f"manifest archives {manifest_archives} do not match history directory {archived}"
assert len(entries) >= 2, "archive must keep at least the previous edition"
for entry in entries:
    checkout = json.loads((ROOT / entry["path"]).read_text(encoding="utf-8"))
    assert checkout["edition"] == entry["edition"], f"{entry['path']} edition number mismatch"
    assert checkout["updatedAt"] == entry["updatedAt"], f"{entry['path']} date mismatch"
    assert len(checkout["items"]) == entry["itemCount"], f"{entry['path']} item count mismatch"
    assert sum(1 for paper_item in checkout["items"] if paper_item.get("featured")) == entry["featuredCount"], f"{entry['path']} featured count mismatch"
    assert entry.get("headline"), f"{entry['path']} edition headline is missing"
    assert entry.get("en", {}).get("headline"), f"{entry['path']} English headline is missing"
    assert checkout.get("observationsEn") and len(checkout["observationsEn"]) == 3, f"{entry['path']} missing English observations"
    for paper_item in checkout["items"]:
        assert paper_item.get("en"), f"{entry['path']}: {paper_item.get('id')} missing English copy"

# ---- bilingual runtime ------------------------------------------------------
i18n_source = (ROOT / "i18n.js").read_text(encoding="utf-8")
assert "data-lang-slot" in i18n_source and "data-lang-option" in i18n_source, "language switch markup is missing from i18n.js"
vocab_blocks = dict(re.findall(r"\n    (\w+): \{(.*?)\n    \},", i18n_source, re.DOTALL))


def parse_pairs(body: str) -> dict:
    """Reads `'key': 'value'` and bare `key: 'value'` entries from a vocabulary block."""
    pairs = dict(re.findall(r"'([^']+)': '([^']*)'", body))
    for key, value in re.findall(r"(?:^|\n)\s+(\w+): '([^']*)'", body):
        pairs.setdefault(key, value)
    return pairs
assert set(vocab_blocks) >= {"topics", "classicTopics", "sourceGroups", "kinds", "types", "labels"}, f"i18n vocabularies incomplete: {sorted(vocab_blocks)}"
vocab = {name: parse_pairs(body) for name, body in vocab_blocks.items()}
assert len(vocab["labels"]) >= 40, "label vocabulary is suspiciously small"
for value in {paper_item["topic"] for paper_item in items} | {paper_item["topic"] for paper_item in json.loads((ROOT / "data" / "history" / "papers-2026-08-31.json").read_text(encoding="utf-8"))["items"]}:
    assert value.strip() in vocab["topics"], f"topic without English translation: {value.strip()}"
for classic in classics:
    assert classic["topic"] in vocab["classicTopics"], f"classic topic without English translation: {classic['topic']}"
    assert classic["sourceGroup"] in vocab["sourceGroups"], f"source group without English translation: {classic['sourceGroup']}"
    assert classic["kind"] in vocab["kinds"], f"kind without English translation: {classic['kind']}"
    assert classic.get("topics"), f"classic record missing unified topics: {classic['title']}"
    for unified in classic["topics"]:
        assert unified in vocab["topics"], f"classic unified topic without English translation: {unified}"

# ---- unified research topics -----------------------------------------------
topics_data = json.loads((ROOT / "data" / "topics.json").read_text(encoding="utf-8"))
assert topics_data.get("topics"), "data/topics.json is missing its topic list"
topic_keys = [t["key"] for t in topics_data["topics"]]
assert len(topic_keys) == len(set(topic_keys)), "duplicate topic keys in data/topics.json"
for t in topics_data["topics"]:
    assert t["key"] in vocab["topics"], f"topics.json key without English translation: {t['key']}"
    assert t.get("en"), f"topics.json topic missing English name: {t['key']}"
    assert t.get("description") and t.get("en_description"), f"topics.json topic missing description: {t['key']}"
    assert t.get("total") == t.get("classicCount", 0) + t.get("paperCount", 0), f"topics.json count mismatch: {t['key']}"
assert set(topic_keys) >= set(vocab["topics"].keys()), "topics.json is missing topics present in the i18n vocabulary"
# every record's unified topics must resolve into topics.json keys
for classic in classics:
    for unified in classic["topics"]:
        assert unified in topic_keys, f"classic topic not in topics.json: {unified}"
for paper_item in items:
    for unified in (paper_item.get("topics") or []):
        assert unified in topic_keys, f"paper topic not in topics.json: {unified}"
for paper_item in items:
    for label in paper_item["labels"]:
        assert label in vocab["labels"], f"label without English translation: {label}"
    assert paper_item["type"] in vocab["types"], f"type without English translation: {paper_item['type']}"

# ---- page contracts --------------------------------------------------------
index = (ROOT / "index.html").read_text(encoding="utf-8")
app = (ROOT / "app.js").read_text(encoding="utf-8")
search = (ROOT / "search.js").read_text(encoding="utf-8")
classics_js = (ROOT / "classics.js").read_text(encoding="utf-8")
archive_html = (ROOT / "archive.html").read_text(encoding="utf-8")
archive_js = (ROOT / "archive.js").read_text(encoding="utf-8")
for required in ("observationGrid", "每周一更新", "editionSummary", "intent-strip", "本期全部收录", "editionGrid", "archive.html", "data-lang-slot"):
    assert required in index, f"missing {required}"
for prohibited in ("每日更新", "每日推送", "每周文献雷达", "编辑筛选后发布", "了解筛选方法", "48篇", "第 01 期"):
    assert prohibited not in index, f"homepage contains prohibited copy: {prohibited}"
for prohibited in ("setFilter(", "classicBtn", "weeklyCount", "第 01 期"):
    assert prohibited not in app, f"stale runtime reference: {prohibited}"
for required in ("fetch('data/papers.json')", "renderEdition", "renderEditions", "fetch('data/editions.json')", "EA.pick(item, 'summary')", "T('act_hide')", "EA.reading"):
    assert required in app, f"missing interaction: {required}"
# The reading list, its save buttons and the record dialog moved out of app.js so
# every page shares one implementation; guard the new owner instead.
reading_js = (ROOT / "reading-list.js").read_text(encoding="utf-8")
for required in ("exportSaved", "quick-grid", "openSavedList", "actionButtons", "wireBackdropClose"):
    assert required in reading_js, f"reading list runtime missing {required}"
assert "fetch('data/papers.json')" in search and "record.url" in search, "search is not using the shared real-DOI data"
# Saving must be reachable everywhere: on the pages that hold most of the papers
# the list used to be missing entirely.
for page in ("index.html", "classics.html", "topics.html", "search.html", "archive.html"):
    html = (ROOT / page).read_text(encoding="utf-8")
    assert 'src="reading-list.js"' in html, f"{page} cannot save papers: shared reading list not loaded"
    assert 'rel="icon" href="favicon.png"' in html, f"{page} is missing the real favicon"
    assert "og:image" in html, f"{page} is missing its social preview image"
assert "EA.v('topics'" in search and "EA.paperTitle" in search, "search is not bilingual"
for required in ("fetch('data/classics.json')", "sourceOrder", "doiUrl", "EA.pick(item, 'note')", "EA.classicTopic(item)"):
    assert required in classics_js, f"classic library missing {required}"
assert "打开 DOI / 出版社页面" not in classics_js, "classic DOI copy must be translated through i18n"
for required in ("fetch('data/editions.json')", "archive.html?e=", "EA.paperTitle", "archiveFeatured"):
    assert required in archive_js, f"archive page missing {required}"
for required in ("editionSwitcher", "archiveDetail", "subpage-hero", "site-footer", "data-lang-slot"):
    assert required in archive_html, f"archive page missing {required}"
topics_html = (ROOT / "topics.html").read_text(encoding="utf-8")
topics_js = (ROOT / "topics.js").read_text(encoding="utf-8")
for required in ("topicsBrowser", "topics.js", "subpage-hero", "site-footer", "data-lang-slot"):
    assert required in topics_html, f"topics page missing {required}"
for required in ("fetch('data/topics.json')", "fetch('data/classics.json')", "fetch('data/editions.json')", "topic-card", "EA.paperTitle", "EA.v('topics'", "EA.onChange"):
    assert required in topics_js, f"topics runtime missing {required}"
styles = (ROOT / "styles.css").read_text(encoding="utf-8")
for required in ("--ink: #0d0d0d", "--paper: #f7f7f5", ".intent-strip", ".site-footer", "height: 153px", ".lang-switch", ".edition-card", ".edition-grid", ".topic-card", ".topic-card-body", ".topic-item"):
    assert required in styles, f"missing design contract: {required}"
for page in ("search.html", "classics.html", "topics.html", "archive.html"):
    html = (ROOT / page).read_text(encoding="utf-8")
    assert "subpage-hero" in html and "site-footer" in html, f"{page} is not using the shared design system"
    assert 'data-lang-slot' in html and 'src="i18n.js"' in html, f"{page} is missing the bilingual runtime"
assert 'data-lang-slot' in index and 'src="i18n.js"' in index, "homepage is missing the bilingual runtime"
fetcher = (ROOT / "scripts" / "fetch_crossref.py").read_text(encoding="utf-8")
assert "OUT =" not in fetcher and "OUT.write_text" not in fetcher, "candidate collector still writes directly to the published data file"
gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
assert "data/staging" in gitignore, "staging data is not excluded from release commits"
assert "data/history" not in gitignore, "archived editions must be committed, otherwise the public archive cannot load them"
assert (ROOT / ".github" / "workflows" / "pages.yml").exists(), "GitHub Pages workflow is missing"

# ---- public address + disclosure guards ------------------------------------
leaks = scan_disclosure(ROOT, active_deny_tokens())
assert not leaks, f"disclosure leak(s) in published files: {leaks}"
site_config = json.loads((ROOT / "site.config.json").read_text(encoding="utf-8"))
assert site_config.get("managedBy") == "scripts/set_site_address.py", "site.config.json must be managed by scripts/set_site_address.py"
assert "siteUrl" in site_config and "canonicalHost" in site_config, "site.config.json is missing address fields"
site_url = (site_config.get("siteUrl") or "").strip()
if site_url:
    assert site_url.startswith(("http://", "https://")) and site_url.endswith("/"), "site.config.json siteUrl must be an absolute address ending in /"
    assert site_url.count("/") >= 3, "siteUrl does not look like a full public address"
for page in ("index.html", "classics.html", "topics.html", "search.html", "archive.html"):
    html = (ROOT / page).read_text(encoding="utf-8")
    has_block = "<!-- ea-address:start -->" in html
    assert has_block == bool(site_url), f"{page} canonical block does not match site.config.json"
    if site_url:
        assert '<link rel="canonical" href="' in html, f"{page} is missing the canonical link"
        assert 'property="og:url"' in html, f"{page} is missing the Open Graph URL"
readme_html = (ROOT / "README.md").read_text(encoding="utf-8")
assert "<!-- ea-address:start -->" in readme_html and "<!-- ea-address:end -->" in readme_html, "README is missing the managed address block"
assert (ROOT / "CNAME").exists() == bool(site_url and not site_config["canonicalHost"].endswith(".github.io")), "CNAME does not match the configured address"

# ---- host portability ------------------------------------------------------
# Strip the managed block, then prove nothing else pins the site to a host or a
# root-absolute path: the same checkout must work on any domain or sub-path.
address_block = re.compile(r"<!-- ea-address:start -->.*?<!-- ea-address:end -->", re.DOTALL)
for page in ("index.html", "classics.html", "topics.html", "search.html", "archive.html"):
    bare = address_block.sub("", (ROOT / page).read_text(encoding="utf-8"))
    assert not re.search(r'(?:href|src)="/', bare), f"{page} uses a root-absolute path and would break under a sub-path"
    assert "http://" not in bare and "https://" not in bare, f"{page} pins an absolute URL outside the managed address block"
for script in ("i18n.js", "app.js", "classics.js", "archive.js", "search.js"):
    bare = address_block.sub("", (ROOT / script).read_text(encoding="utf-8"))
    assert not re.search(r'fetch\(\s*"/', bare), f"{script} fetches from a root-absolute path"
    assert not re.search(r"""(?:src|href)\s*=\s*["']/""", bare), f"{script} links to a root-absolute path"

online_note = "; Crossref DOI verification passed" if args.online else ""
print(
    f"PASS: edition {data['edition']:02d} with {len(items)} weekly real-DOI records; "
    f"{sum(bool(p['featured']) for p in items)} featured; {len(classics)} DOI-linked classics; "
    f"{len(entries)} archived editions; bilingual contracts valid; "
    f"address {'configured' if site_url else 'unset (relative paths only)'}{online_note}"
)
