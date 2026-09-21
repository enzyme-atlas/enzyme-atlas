"""Prune development-only files from the GitHub Pages artifact.

The workflow publishes `path: .` — the repository root — so every committed file
becomes publicly downloadable. That shipped `scripts/*.py`, agent notes and audit
reports to the live site, where anyone could read the publishing pipeline by hand.

The published site needs exactly the pages, the runtimes, the stylesheet, the
data files and the share assets. Everything else is development material.

Usage
-----
    python scripts/prune_public.py            # list what would be removed
    python scripts/prune_public.py --apply    # remove it (used by the workflow)
    python scripts/prune_public.py --check    # fail if a public file would leak

`KEEP` is an allow-list: a file is published only when it is named here, matches
one of the published patterns, or sits in an allowed directory. A new top-level
file therefore defaults to *not* being published, which is the safe direction.
"""
from __future__ import annotations

import argparse
import fnmatch
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = "scripts/prune_public.py"

# Exact file names that are part of the public site.
KEEP_FILES = {
    ".nojekyll",              # required for GitHub Pages to skip Jekyll processing
    "index.html",
    "classics.html",
    "topics.html",
    "search.html",
    "archive.html",
    "404.html",
    "styles.css",
    "i18n.js",
    "reading-list.js",
    "app.js",
    "classics.js",
    "topics.js",
    "search.js",
    "archive.js",
    "favicon.png",
    "og-cover.png",
    "robots.txt",
    "sitemap.xml",
    "CNAME",                  # written by set_site_address.py only for a custom domain
    "README.md",
}

# Published files matched by pattern, for assets that are added over time.
KEEP_PATTERNS = (
    "data/*.json",
    "data/history/*.json",
)

# Directories published whole (only data lives here; no tooling).
KEEP_DIRS = (
    "data",
)

# Never published, even though they are committed.
REMOVE_PATHS = (
    "scripts",
    "AGENTS.md",
    "OPENAI_WEB_DESIGN_ANALYSIS.md",
    "classic-library-preview.png",
    "site.config.json",
    ".github",
    ".gitignore",
)
REMOVE_PATTERNS = (
    "AUDIT-*.md",
    "*.tmp",
)


def is_kept(relative: str) -> bool:
    """True when this repository-relative path ships to the public site."""
    if relative in KEEP_FILES:
        return True
    if any(fnmatch.fnmatch(relative, pattern) for pattern in KEEP_PATTERNS):
        return True
    first = relative.split("/", 1)[0]
    return first in KEEP_DIRS


def is_removed(relative: str) -> bool:
    if relative == SELF:
        return False
    parts = relative.split("/")
    if any(part in REMOVE_PATHS for part in parts[:-1]) or parts[0] in REMOVE_PATHS:
        return True
    return any(fnmatch.fnmatch(relative, pattern) for pattern in REMOVE_PATTERNS)


def iter_paths() -> list[Path]:
    """Every top-level entry plus their children, excluding .git and caches."""
    skip = {".git", "__pycache__", "node_modules"}
    found: list[Path] = []
    for path in sorted(ROOT.rglob("*")):
        relative = path.relative_to(ROOT)
        if any(part in skip for part in relative.parts):
            continue
        found.append(relative)
    return found


def plan() -> tuple[list[str], list[str]]:
    """Return (to_remove, unclassified).

    `to_remove` is pruned before deploy. `unclassified` holds committed top-level
    files that are neither published nor pruned: each one would ship by accident,
    so --check fails on them and asks for an explicit decision.
    """
    to_remove: list[str] = []
    unclassified: list[str] = []
    for relative in iter_paths():
        name = relative.as_posix()
        if is_removed(name):
            continue
        if is_kept(name):
            continue
        if len(relative.parts) == 1 and relative.is_file():
            unclassified.append(name)
    # Remove the whole directories, then any loose files.
    roots: list[str] = []
    for name in {p.as_posix() for p in iter_paths()}:
        if is_removed(name) and name != SELF:
            roots.append(name)
    return sorted(set(roots)), sorted(unclassified)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Delete the non-public paths")
    parser.add_argument("--check", action="store_true", help="Fail (exit 1) if a non-public file would leak")
    args = parser.parse_args()

    to_remove, unclassified = plan()
    top_level = sorted({name.split("/", 1)[0] for name in to_remove})

    if args.check:
        if unclassified:
            print("FAIL: these top-level files are neither published nor pruned:")
            for name in unclassified:
                print(f"  - {name}")
            print("Add each one to KEEP_FILES or REMOVE_PATHS in scripts/prune_public.py.")
            sys.exit(1)
        print(f"PASS: every top-level file is classified; {len(top_level)} non-public path(s) pruned before deploy")
        return

    if args.apply:
        for name in to_remove:
            target = ROOT / name
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
            elif target.exists():
                target.unlink()
        print(f"Pruned {len(top_level)} non-public path(s): {', '.join(top_level)}")
        if unclassified:
            print("WARNING: unclassified files remain and WILL be published: " + ", ".join(unclassified))
        return

    print("Would remove:")
    for name in top_level:
        print(f"  {name}/")
    if unclassified:
        print("\nNot classified (would be published as-is):")
        for name in unclassified:
            print(f"  {name}")


if __name__ == "__main__":
    main()
