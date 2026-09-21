#!/usr/bin/env python3
"""生成 data/topics.json —— 研究专题清单，含中英文名、描述与归属文献数。

专题集合 = 12 个现有大专题 + 2 个新增专题。每个专题的英文名与 i18n.js 的
VOCAB.topics 一致；新增专题的英文名在此定义并需同步进 i18n.js。
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

# 专题英文名（与 i18n.js VOCAB.topics 对齐；新增 2 个）
TOPIC_EN: dict[str, str] = {
    "AI 与机器学习辅助酶研究": "AI & machine learning for enzymology",
    "定向进化与理性设计": "Directed evolution & rational design",
    "酶催化方法与分析技术": "Biocatalysis methods & analytics",
    "酶固定化与酶—材料体系": "Enzyme immobilization & enzyme–material systems",
    "酶的发现与挖掘": "Enzyme discovery & mining",
    "酶的级联组装": "Enzyme cascade assembly",
    "酶的结构与催化机制": "Enzyme structure & catalytic mechanism",
    "酶的稳定性工程": "Enzyme stability engineering",
    "酶动力学、选择性与底物特异性": "Enzyme kinetics, selectivity & substrate specificity",
    "多酶级联反应": "Multi-enzyme cascades",
    "融合酶与多功能酶": "Fusion enzymes & multifunctional enzymes",
    "计算酶学与分子模拟": "Computational enzymology & molecular simulation",
    "辅因子、辅酶与再生": "Cofactors, coenzymes & regeneration",
    "酶的应用与环境生物催化": "Enzyme applications & environmental biocatalysis",
}

# 专题描述（中英文）
TOPIC_DESC: dict[str, dict[str, str]] = {
    "AI 与机器学习辅助酶研究": {"zh": "用机器学习与人工智能方法辅助酶的功能预测、设计、筛选与工程化。", "en": "Machine learning and AI methods for enzyme function prediction, design, screening and engineering."},
    "定向进化与理性设计": {"zh": "通过定向进化或理性设计改造酶的活性、选择性与新功能。", "en": "Engineering enzyme activity, selectivity and new functions by directed evolution or rational design."},
    "酶催化方法与分析技术": {"zh": "酶催化的合成方法、分析表征技术与非天然催化反应。", "en": "Synthetic methods, analytical techniques and non-natural reactions in enzyme catalysis."},
    "酶固定化与酶—材料体系": {"zh": "酶的固定化策略及其与多孔材料、纳米材料、框架材料结合的体系。", "en": "Enzyme immobilization and systems combining enzymes with porous, nano and framework materials."},
    "酶的发现与挖掘": {"zh": "从自然序列与宏基因组中发现、挖掘与表征新酶。", "en": "Discovery, mining and characterization of new enzymes from natural sequences and metagenomes."},
    "酶的级联组装": {"zh": "通过支架、限域环境或蛋白互作对多酶进行空间组织与通道化。", "en": "Spatial organization and channeling of multiple enzymes via scaffolds, confinement or protein interactions."},
    "酶的结构与催化机制": {"zh": "酶的三维结构、催化机理、变构调控与底物识别机制。", "en": "Three-dimensional structure, catalytic mechanism, allosteric regulation and substrate recognition."},
    "酶的稳定性工程": {"zh": "提升酶的热稳定性、溶剂耐受性与长期储存稳定性的工程策略。", "en": "Engineering strategies to improve enzyme thermostability, solvent tolerance and storage stability."},
    "酶动力学、选择性与底物特异性": {"zh": "酶动力学参数、化学/对映选择性、底物特异性与催化多功能性。", "en": "Enzyme kinetics, chemo/enantioselectivity, substrate specificity and catalytic promiscuity."},
    "多酶级联反应": {"zh": "多酶级联反应的设计、动力学协调与辅因子循环。", "en": "Design, kinetic orchestration and cofactor recycling of multi-enzyme cascades."},
    "融合酶与多功能酶": {"zh": "融合酶与多功能酶的设计、连接策略与级联应用。", "en": "Design, linking strategies and cascade applications of fusion and multifunctional enzymes."},
    "计算酶学与分子模拟": {"zh": "计算酶设计、结构预测、分子动力学与 QM/MM 模拟。", "en": "Computational enzyme design, structure prediction, molecular dynamics and QM/MM simulation."},
    "辅因子、辅酶与再生": {"zh": "辅因子与辅酶的循环再生、替代物与酶促再生策略。", "en": "Recycling, regeneration, surrogates and enzymatic regeneration of cofactors and coenzymes."},
    "酶的应用与环境生物催化": {"zh": "面向塑料降解、污染物治理等应用与环境场景的酶催化。", "en": "Enzyme catalysis for applications such as plastic degradation and pollutant remediation."},
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    classics = load_json(DATA / "classics.json")
    papers_paths = [DATA / "papers.json"] + sorted((DATA / "history").glob("papers-*.json"))

    classic_count: dict[str, int] = {}
    paper_count: dict[str, int] = {}
    for item in classics["items"]:
        for t in item.get("topics", []):
            classic_count[t] = classic_count.get(t, 0) + 1
    for pp in papers_paths:
        data = load_json(pp)
        for item in data["items"]:
            for t in item.get("topics", []):
                paper_count[t] = paper_count.get(t, 0) + 1

    topics: list[dict] = []
    for key in TOPIC_EN:
        cc = classic_count.get(key, 0)
        pc = paper_count.get(key, 0)
        topics.append({
            "key": key,
            "en": TOPIC_EN[key],
            "description": TOPIC_DESC[key]["zh"],
            "en_description": TOPIC_DESC[key]["en"],
            "classicCount": cc,
            "paperCount": pc,
            "total": cc + pc,
        })

    # 按总篇数降序，但保证零篇的专题也在（展示完整性）
    topics.sort(key=lambda t: (-t["total"], t["key"]))

    out = {"updatedAt": dt.date.today().isoformat(), "topics": topics}
    (DATA / "topics.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("已生成 data/topics.json")
    print(f"  专题总数: {len(topics)}")
    for t in topics:
        print(f"  {t['total']:2d} 篇 ({t['classicCount']:2d}经典 + {t['paperCount']:2d}新)  {t['key']}")


if __name__ == "__main__":
    main()
