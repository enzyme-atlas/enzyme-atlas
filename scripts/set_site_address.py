"""Configure the public address of the Enzyme Atlas site from a single switch.

The site never hard-codes an address: every page uses relative paths, so the
same checkout can be served from a custom domain, a project sub-path, or a
temporary tunnel. This script is the one place that turns a chosen address into
everything that has to mention it:

  * site.config.json   the recorded address (source of truth)
  * <page>.html        canonical / Open Graph tags inside a managed block
  * CNAME              only when the host is a real custom domain
  * README.md          the access-links block, between managed markers

Examples
--------
    python scripts/set_site_address.py --url https://enzyme-atlas.org/ \
        --contact-email hello@enzyme-atlas.org

    # remove every address-related tag again (default state of the repo)
    python scripts/set_site_address.py --clear

    # fail if the checked-in files drifted from site.config.json
    python scripts/set_site_address.py --check

The command refuses an address that still contains a forbidden token, so a
personal account name or a host brand marker cannot reach the published output
by accident. Forbidden tokens come from the git remote owner and from the
local, git-ignored policy file (see scripts/check_public_disclosure.py).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from check_public_disclosure import active_deny_tokens, mask_token  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "site.config.json"
README_PATH = ROOT / "README.md"
CNAME_PATH = ROOT / "CNAME"
SITEMAP_PATH = ROOT / "sitemap.xml"
HTML_START = "<!-- ea-address:start -->"
HTML_END = "<!-- ea-address:end -->"
MD_START = "<!-- ea-address:start -->"
MD_END = "<!-- ea-address:end -->"

# Social preview card shipped at the site root. It is a committed asset (not
# generated at build time) so the Pages workflow stays dependency-free.
OG_IMAGE = "og-cover.png"
OG_IMAGE_WIDTH = "1200"
OG_IMAGE_HEIGHT = "630"

# page file -> path appended to the canonical base ("" == site root).
# 404.html is included so its social-preview tags follow the configured address
# too; it stays noindex, so the canonical tag is informational only.
PAGES = {
    "index.html": "",
    "classics.html": "classics.html",
    "topics.html": "topics.html",
    "search.html": "search.html",
    "archive.html": "archive.html",
    "404.html": "404.html",
}


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def save_config(config: dict) -> None:
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_url(raw: str) -> str:
    """Return a validated base URL always ending in a single slash."""
    value = raw.strip()
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https"):
        raise SystemExit(f"address must start with http:// or https:// (got {raw!r})")
    if not parsed.hostname:
        raise SystemExit(f"address has no host: {raw!r}")
    if parsed.query or parsed.fragment:
        raise SystemExit(f"address must not contain a query or fragment: {raw!r}")
    path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}{path}/"


def page_canonical(base: str, suffix: str) -> str:
    return f"{base}{suffix}" if suffix else base


def read_meta(html: str) -> tuple[str, str]:
    title = re.search(r"<title>(.*?)</title>", html, re.DOTALL)
    description = re.search(r'<meta name="description" content="(.*?)"\s*/?>', html, re.DOTALL)
    return (
        title.group(1).strip() if title else "Enzyme Atlas",
        description.group(1).strip() if description else "",
    )


def build_html_block(base: str, site_name: str, canonical: str, title: str, description: str) -> str:
    lines = [
        HTML_START,
        f'  <link rel="canonical" href="{canonical}" />',
        '  <meta property="og:type" content="website" />',
        f'  <meta property="og:site_name" content="{site_name}" />',
        f'  <meta property="og:title" content="{title}" />',
    ]
    if description:
        lines.append(f'  <meta property="og:description" content="{description}" />')
    lines.append(f'  <meta property="og:url" content="{canonical}" />')
    if base:
        # Relative paths are not allowed for og:image, so the social card has to
        # be built from the configured address here rather than hard-coded.
        cover = f"{base}{OG_IMAGE}"
        lines += [
            f'  <meta property="og:image" content="{cover}" />',
            f'  <meta property="og:image:width" content="{OG_IMAGE_WIDTH}" />',
            f'  <meta property="og:image:height" content="{OG_IMAGE_HEIGHT}" />',
            f'  <meta property="og:image:alt" content="{site_name} — 酶学文献推荐" />',
        ]
    lines.append('  <meta name="twitter:card" content="' + ("summary_large_image" if base else "summary") + '" />')
    if base:
        lines.append(f'  <meta name="twitter:image" content="{base}{OG_IMAGE}" />')
    lines.append(HTML_END)
    return "\n".join(lines)


def strip_managed_block(text: str, start: str, end: str) -> str:
    """Remove the block and the separator newlines it introduced.

    The lookbehind keeps the newline that ends the preceding line, so a file that
    never had the block is byte-identical again after ``--clear``.
    """
    pattern = re.compile(r"(?<=\n)" + re.escape(start) + r".*?" + re.escape(end) + r"\n*", re.DOTALL)
    return pattern.sub("", text)


def upsert_managed_block(text: str, start: str, end: str, block: str, anchor: str, gap: str = "\n") -> str:
    """Idempotent: re-running with the same block must not change the file."""
    cleaned = strip_managed_block(text, start, end)
    if not block:
        return cleaned
    index = cleaned.find(anchor)
    if index == -1:
        raise SystemExit(f"could not find insertion anchor {anchor!r}")
    head = cleaned[:index]
    if not head.endswith("\n"):
        head += "\n"
    return f"{head}{block}{gap}{cleaned[index:]}"


def render_readme_block(base: str, site_name: str) -> str:
    if not base:
        body = (
            "> 公开地址尚未配置。站点不内置任何绝对地址，可部署到任意域名或子目录；"
            "运行 `python scripts/set_site_address.py --url https://<中性地址>/` 后，"
            "本行会自动替换为公开入口。"
        )
        return f"{MD_START}\n{body}\n{MD_END}"
    links = " · ".join(
        [
            f"[进入公开网站]({page_canonical(base, '')})",
            f"[浏览经典论文]({page_canonical(base, 'classics.html')})",
            f"[查看筛选标准]({page_canonical(base, '#method')})",
        ]
    )
    return f"{MD_START}\n{links}\n{MD_END}"


def render_sitemap(base: str) -> str:
    """Public pages only. The 404 page and scripts are deliberately excluded."""
    if not base:
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            "<!-- Generated by scripts/set_site_address.py; run it with --url to populate. -->\n"
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n'
        )
    entries = []
    for page, suffix in PAGES.items():
        if page == "404.html":
            continue  # noindex + robots-disallowed: listing it here would contradict that
        entries.append(
            "  <url>\n"
            f"    <loc>{page_canonical(base, suffix)}</loc>\n"
            "    <changefreq>weekly</changefreq>\n"
            "  </url>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!-- Generated by scripts/set_site_address.py; do not edit by hand. -->\n"
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n"
    )


def build_tree(base: str, site_name: str) -> dict[Path, str | None]:
    """Return every file the address touches, with its target content (None = delete)."""
    changes: dict[Path, str | None] = {}
    for page, suffix in PAGES.items():
        path = ROOT / page
        html = path.read_text(encoding="utf-8")
        title, description = read_meta(html)
        block = build_html_block(base, site_name, page_canonical(base, suffix), title, description) if base else ""
        updated = upsert_managed_block(html, HTML_START, HTML_END, block, "  <link rel=\"stylesheet\"")
        changes[path] = updated

    readme = README_PATH.read_text(encoding="utf-8")
    readme_block = render_readme_block(base, site_name)
    updated_readme = upsert_managed_block(readme, MD_START, MD_END, readme_block, "| 📖 读者 |", gap="\n\n")
    changes[README_PATH] = updated_readme

    # sitemap.xml always exists so the repository state is reproducible with or
    # without a configured address.
    changes[SITEMAP_PATH] = render_sitemap(base)

    robots = ROOT / "robots.txt"
    if robots.exists():
        robots_text = robots.read_text(encoding="utf-8")
        robots_text = re.sub(r"^Sitemap: .*\n?", "", robots_text, flags=re.MULTILINE)
        if base:
            robots_text = robots_text.rstrip("\n") + f"\nSitemap: {base}sitemap.xml\n"
        changes[robots] = robots_text

    host = urlparse(base).hostname or "" if base else ""
    if host and not host.endswith(".github.io"):
        changes[CNAME_PATH] = host + "\n"
    else:
        changes[CNAME_PATH] = None
    return changes


def apply(changes: dict[Path, str | None]) -> None:
    for path, content in changes.items():
        if content is None:
            if path.exists():
                path.unlink()
            continue
        path.write_text(content, encoding="utf-8")
        print(f"  updated {path.relative_to(ROOT).as_posix()}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", help="Public base address, e.g. https://enzyme-atlas.org/")
    parser.add_argument("--contact-email", help="Public contact address recorded in site.config.json")
    parser.add_argument("--publisher", help="Optional publisher name recorded in site.config.json")
    parser.add_argument("--clear", action="store_true", help="Remove every address tag and reset the config")
    parser.add_argument("--check", action="store_true", help="Fail if checked-in files drifted from site.config.json")
    parser.add_argument("--dry-run", action="store_true", help="Print the planned changes without writing")
    args = parser.parse_args()

    config = load_config()
    site_name = config.get("siteName") or "Enzyme Atlas"

    if args.check:
        target = config.get("siteUrl", "")
        expected = build_tree(target, site_name)
        drift = [p for p, c in expected.items() if (c or "") != (p.read_text(encoding="utf-8") if p.exists() else "")]
        if drift:
            names = ", ".join(p.relative_to(ROOT).as_posix() for p in drift)
            raise SystemExit(f"address metadata is out of sync with site.config.json: {names}")
        print("PASS: site address metadata matches site.config.json")
        return

    if args.clear:
        base = ""
    elif args.url:
        base = normalize_url(args.url)
    else:
        raise SystemExit("provide --url <address>, or --clear to remove the address, or --check")

    if base:
        tokens = active_deny_tokens(config)
        haystack = base.lower()
        hits = [t for t in tokens if t.lower() in haystack]
        if hits:
            masked = ", ".join(mask_token(t) for t in hits)
            raise SystemExit(f"refusing {base!r}: it still contains a forbidden token ({masked})")

    changes = build_tree(base, site_name)
    if args.dry_run:
        for path in changes:
            action = "delete" if changes[path] is None else "update"
            print(f"  would {action} {path.relative_to(ROOT).as_posix()}")
        return

    apply(changes)

    config["siteUrl"] = base
    config["canonicalHost"] = urlparse(base).hostname or "" if base else ""
    if args.publisher is not None:
        config["publisher"] = args.publisher
    if args.contact_email is not None:
        config["contactEmail"] = args.contact_email
    config["updatedAt"] = dt.date.today().isoformat() if base else ""
    save_config(config)
    print(f"  updated {CONFIG_PATH.relative_to(ROOT).as_posix()}")
    print("PASS: site address " + (f"set to {base}" if base else "cleared"))


if __name__ == "__main__":
    main()
