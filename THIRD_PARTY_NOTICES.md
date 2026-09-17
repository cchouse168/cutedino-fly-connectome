# 第三方出處

本專案包含以下第三方素材，各自保留其原始授權。

---

## 1. flyjump / fly-connectome-template（程式架構與方法）

**來源**：<https://github.com/cobanov/flyjump>（模板：<https://github.com/cobanov/fly-connectome-template>）
**作者**：Mert Cobanov（<https://github.com/cobanov>）
**授權**：Cobanov Template Attribution License 1.0
（SPDX: `LicenseRef-Cobanov-Template-Attribution-1.0`，全文見 `LICENSE-flyjump.txt`）

> Built with [fly-connectome-template](https://github.com/cobanov/fly-connectome-template)
> by [Mert Cobanov](https://github.com/cobanov).

此為**自訂的、要求標註的 source-available 授權**，不是 OSI 認可的授權，也不是
MIT / Apache-2.0 / GPL / AGPL。§3 與 §4 為強制條款：

- §3：任何部署或散布的網頁介面，都必須在主介面、頁尾，或一鍵可達的 About 頁，
  以正常縮放下可讀的對比度顯示上述標註與可用連結。隱藏文字、HTML 註解、原始碼註解、
  畫面外內容、僅 hover 顯示的文字，或只放一個 repo 連結，**都不符合要求**。
  本專案實作於 `index.html` 的 `<footer>`。
- §4：任何含有本軟體實質部分的原始碼庫，其根目錄 README 必須包含相同標註與授權引用，
  且修改版必須載明做了哪些修改。本專案實作於 `README.md` 開頭。

**衍生自本專案的程式碼，這兩項義務同樣成立。**

### 改編範圍

下列檔案的演算法與結構改編自 flyjump：

| 本專案 | 對應原始檔 |
|---|---|
| `src/lib/connectome.js` | `src/lib/connectome.ts` |
| `src/lib/policy.js` | `src/lib/policy.ts` |
| `src/lib/training.js` | `src/lib/training.ts` |
| `src/lib/benchmark.js` | `src/lib/benchmark.ts` |
| `scripts/train.mjs`、`scripts/benchmark.mjs` | `scripts/train.mjs`、`scripts/benchmark.mjs` |

`src/engine/game.js` 取代了原作的 `src/lib/runner.ts`（Chromium 引擎包裝層），
改為 cute-dino 的確定性模擬器，屬本專案原創。

---

## 2. MaleCNS v1.0 連接體資料與胞體圖譜

**檔案**：
- `data/connectome.json`（80 節點、1,296 條邊）
- `data/brain-atlas/`（positions.bin / ids.bin / groups.bin，140,024 個實測胞體座標）
**資料建立者**：FlyEM / HHMI Janelia、University of Cambridge、
MRC Laboratory of Molecular Biology、Google Research
**資料集**：<https://male-cns.janelia.org/download/>
**授權**：Creative Commons Attribution 4.0 International
（<https://creativecommons.org/licenses/by/4.0/>）

完整聲明與變更說明見 `data/NOTICE.md` 與 `data/brain-atlas/NOTICE.md`（皆原樣保留）。

胞體圖譜用於「04 / 大腦活性」面板的灰色背景點雲，顯示 optic / central / descending
三群共 124,289 顆已分類胞體；VNC 相關與未分類者不顯示。渲染只做置中、剛性旋轉與
等比縮放，來源座標與 body ID 未更動。**點的顯示大小不代表真實胞體大小。**

本專案對此資料的額外處理：`data/channels.json` 重新指派了輸入通道的廣播表。
節點、邊、突觸接觸數、神經傳導物質標註、輸出細胞集合**皆未更動**。
輸入編碼本來就是人工指定的工程選擇，不是生物量測。

**資料提供方不對本實驗背書。**

---

## 3. Flybody 果蠅身體模型

**檔案**：`data/flybody/`（model.bin / model.json，93,879 個三角形）
**來源**：<https://github.com/TuragaLab/flybody>
**授權**：Apache License 2.0（全文見 `data/flybody/LICENSE`）
**作者**：Roman Vaxenburg、Igor Siwanowicz、Josh Merel、Alice A. Robie、Carmen Morrow、
Guido Novati、Zinovia Stefanidi、Gert-Jan Both、Gwyneth M. Card、Michael B. Reiser、
Matthew M. Botvinick、Kristin M. Branson、Yuval Tassa、Srinivas C. Turaga
**合作單位**：Google DeepMind 與 HHMI Janelia Research Campus
**論文**：Whole-body physics simulation of fruit fly locomotion,
Nature 643, 1312-1320 (2025), <https://doi.org/10.1038/s41586-025-09029-4>

用於「03 / 鍵盤輸出」面板。二進位轉檔與前腳分組由 flyjump 完成，本專案沿用。
**鍵盤幾何、鍵位配置與按鍵動畫是本專案所加，不是研究模擬的輸出**；
解剖表面幾何才是 Flybody 的成果。完整聲明見 `data/flybody/NOTICE.md`。

---

## 4. cute-dino（遊戲邏輯與美術）

**來源**：<https://github.com/cchouse168/cute-dino>
**作者**：cchouse168

`src/engine/game.js` 的遊戲規則（物理、生成、碰撞、道具、計分）
與 `src/engine/render.js` 的障礙物、道具、地面、子彈畫法，
皆自該專案的 `index.html` 抽出並改寫為確定性、可 headless 執行的形式。
恐龍本體的繪製改為簡化版（原作有 10 階皮膚、翅膀、尖刺、跟班等系統）。

---

## 5. 本專案原創部分

其餘檔案（確定性模擬器改造、13 通道量測與指派、視覺化介面與其中的
點雲／WebGL 渲染器、驗收測試、文件）
採 MIT 授權，見 `LICENSE`。

MIT 授權僅適用於本專案的原創新增部分，**不能**用來規避上述第 1 項的標註義務
（該授權 §5 明文禁止以其他授權取代或抵觸其條件）。
