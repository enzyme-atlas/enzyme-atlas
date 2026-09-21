#!/usr/bin/env python3
"""为所有页面注入 GoatCounter 分析脚本（站内搜索词也会被记录）。

用法：
  python scripts/add_analytics.py --code https://YOURCODE.goatcounter.com/count
  python scripts/add_analytics.py --remove          # 撤销注入

注入内容（放在 </head> 之前）：
  <script data-goatcounter="https://YOURCODE.goatcounter.com/count"
          async src="//gc.zgo.at/count.js"></script>

搜索词记录：搜索页(search.js)在用户提交搜索时调用
  window.goatcounter?.count({ path: 'search', event: true, title: query })
把搜索词作为自定义事件上报。无需后端。
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "classics.html", "search.html", "topics.html", "archive.html"]

SCRIPT_LINE = (
    '  <script data-goatcounter="{code}" async src="//gc.zgo.at/count.js"></script>'
)
MARKER = "data-goatcounter"


def inject(code: str) -> None:
    code = code.rstrip("/")
    tag = SCRIPT_LINE.format(code=code)
    changed = 0
    for name in PAGES:
        p = ROOT / name
        text = p.read_text(encoding="utf-8")
        if MARKER in text:
            print(f"  [skip] {name} 已含埋点")
            continue
        # 在 </head> 前插入
        if "</head>" not in text:
            print(f"  [warn] {name} 无 </head>，跳过")
            continue
        text = text.replace("</head>", tag + "\n</head>", 1)
        p.write_text(text, encoding="utf-8")
        changed += 1
        print(f"  [ok]   {name}")
    print(f"完成：注入 {changed} 个页面")


def remove() -> None:
    changed = 0
    for name in PAGES:
        p = ROOT / name
        text = p.read_text(encoding="utf-8")
        if MARKER not in text:
            continue
        # 移除含 data-goatcounter 的一整行（可能带前导空白）
        lines = text.split("\n")
        lines = [ln for ln in lines if MARKER not in ln]
        p.write_text("\n".join(lines), encoding="utf-8")
        changed += 1
        print(f"  [ok]   {name} 已移除")
    print(f"完成：移除 {changed} 个页面")


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--code", help="GoatCounter count 地址，如 https://xxx.goatcounter.com/count")
    g.add_argument("--remove", action="store_true", help="撤销注入")
    args = ap.parse_args()

    if args.remove:
        remove()
    else:
        inject(args.code)
    return 0


if __name__ == "__main__":
    sys.exit(main())
