# Papers — Local PDF Library

Twelve papers referenced in [`../LITERATURE.md`](../LITERATURE.md). Each was
downloaded directly from arXiv or the publisher's institutional page on
2026-06-09 and verified as a real PDF (not a 404 HTML page).

Filenames are `YYYY-firstauthor-shortname.pdf` so they sort chronologically.

## Direct competitors — WCAG accessibility tooling

| File | Citation | Venue | Type |
|---|---|---|---|
| [2025-he-gena11y.pdf](2025-he-gena11y.pdf) | He, Huq, Malek. *Enhancing Web Accessibility: Automated Detection of Issues with Generative AI.* | FSE 2025 | Detection |
| [2025-fathallah-accessguru.pdf](2025-fathallah-accessguru.pdf) | Fathallah, Hernández, Staab. *AccessGuru: Leveraging LLMs to Detect and Correct Web Accessibility Violations in HTML Code.* | ASSETS 2025 | Repair |
| [2026-fernandez-chicano-llm-accessibility.pdf](2026-fernandez-chicano-llm-accessibility.pdf) | Fernández-Navarro, Chicano. *Automated LLM-Based Accessibility Remediation: From Conventional Websites to Angular Single-Page Applications.* | arXiv:2602.17887 | Repair |
| [2025-yuan-designrepair.pdf](2025-yuan-designrepair.pdf) | Yuan, Chen, Xing, Quigley, Luo, Luo, Mohammadi, Lu, Zhu. *DesignRepair: Dual-Stream Design Guideline-Aware Frontend Repair with Large Language Models.* | ICSE 2025 | Repair (design guidelines, not WCAG) |

## Graduated-evidence ablation methodology

| File | Citation | Venue |
|---|---|---|
| [2020-lewis-rag.pdf](2020-lewis-rag.pdf) | Lewis, Perez, Piktus, et al. *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.* | NeurIPS 2020 |
| [2024-asai-self-rag.pdf](2024-asai-self-rag.pdf) | Asai, Wu, Wang, Sil, Hajishirzi. *Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection.* | ICLR 2024 (Oral) |
| [2024-cuconasu-power-of-noise.pdf](2024-cuconasu-power-of-noise.pdf) | Cuconasu et al. *The Power of Noise: Redefining Retrieval for RAG Systems.* | SIGIR 2024 |

## Counter-evidence — "more context can hurt"

| File | Citation | Venue |
|---|---|---|
| [2024-liu-lost-in-the-middle.pdf](2024-liu-lost-in-the-middle.pdf) | Liu, Lin, Hewitt, Paranjape, Bevilacqua, Petroni, Liang. *Lost in the Middle: How Language Models Use Long Contexts.* | TACL 2024 |
| [2023-shi-distracted-by-irrelevant.pdf](2023-shi-distracted-by-irrelevant.pdf) | Shi, Chen, Misra, Scales, Dohan, Chi, Schärli, Zhou. *Large Language Models Can Be Easily Distracted by Irrelevant Context.* | ICML 2023 |
| [2024-levy-same-task-more-tokens.pdf](2024-levy-same-task-more-tokens.pdf) | Levy, Jacoby, Goldberg. *Same Task, More Tokens: the Impact of Input Length on the Reasoning Performance of Large Language Models.* | ACL 2024 |

## Static-analyzer-to-LLM-repair precedent

| File | Citation | Venue |
|---|---|---|
| [2023-jin-inferfix.pdf](2023-jin-inferfix.pdf) | Jin, Shahriar, Tufano, Shi, Lu, Sundaresan, Svyatkovskiy. *InferFix: End-to-End Program Repair with LLMs over Retrieval-Augmented Prompts.* | ESEC/FSE 2023 |
| [2022-xia-alpharepair.pdf](2022-xia-alpharepair.pdf) | Xia, Zhang. *Less Training, More Repairing Please: Revisiting Automated Program Repair via Zero-Shot Learning.* | ESEC/FSE 2022 |

## Verification

```bash
$ file *.pdf
# Every file reports: "PDF document, version 1.5" or "1.7"
```

If a PDF is ever missing or corrupted, the canonical source URLs are listed
in `../LITERATURE.md` for re-download.

## License note

These PDFs are author preprints from arXiv or freely-distributed
institutional copies. They are included here for thesis reference use only;
re-distribute under the terms each author specifies on their original
posting.
