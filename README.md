# 果蠅大腦玩 cute-dino

**[線上試玩 →](https://cchouse168.github.io/cutedino-fly-connectome/)**

MaleCNS v1.0 果蠅連接體中 **80 顆真實神經元、1,296 條實測突觸連接**，構成一段
完全固定、不可訓練的電路，去玩 [cute-dino](https://github.com/cchouse168/cute-dino)。
電路後面只接一個 **269 參數**的讀出網路 —— 那是全系統唯一被訓練的東西。

> Built with [fly-connectome-template](https://github.com/cobanov/fly-connectome-template) by [Mert Cobanov](https://github.com/cobanov).

方法與程式架構改編自 [cobanov/flyjump](https://github.com/cobanov/flyjump)（[Fly Dino](https://flydino.cobanov.dev/)），
依 **Cobanov Template Attribution License 1.0** 使用（[`LICENSE-flyjump.txt`](LICENSE-flyjump.txt)）。
**本專案的修改**（該授權 §4 要求載明）：換成 cute-dino 並改寫為確定性 headless 模擬器、
感官通道 8 → 13、動作空間 3 → 5（加入 LEFT/RIGHT）、CEM 的訓練賽道與驗證種子數調高。

---

## 結果

100 條從未見過的賽道，每條上限 180 秒：

| 對照組 | 跑完 | 平均存活 |
|---|---:|---:|
| **連接體 + 訓練讀出** | **82/100** | **161.1s** |
| 電路靜默（消融） | 0/100 | 3.5s |
| 未訓練讀出 | 0/100 | 3.5s |
| 手寫規則 | 25/100 | 82.4s |
| 完全不動 | 0/100 | 3.5s |

把電路歸零後，讀出網路收到的 16 個輸入全是 0，動作分數凍住，整場只重複同一個動作 ——
3.5 秒就撞上第一個障礙物，和完全不操作一模一樣。

兩個但書：**82/100 是這個部署模型的成績，不是方法的平均**（換訓練種子會得到 46–87）；
而且**這不足以證明果蠅的接線比隨機接線好** —— 那需要打亂連接體重訓的對照組，本專案沒做。
完整數據、檢定力分析與已知限制見 [`docs/report.md`](docs/report.md)。

## 執行

不需要 build step。

```bash
npx serve -l 4173 .      # 開 http://localhost:4173
npm test                 # 模擬器確定性 + 電路/讀出健全性
npm run train            # CEM 訓練（12 執行緒約 20 分鐘）
npm run benchmark        # 100 條 held-out + 消融對照
```

「鍵盤輸出」面板需要 WebGL2；不支援時該面板顯示提示，其餘功能不受影響。

## 文件

| | |
|---|---|
| [`docs/report.md`](docs/report.md) | 完整結果、三次失敗的改進嘗試、檢定力分析、誠實的限制 |
| [`docs/experiment.md`](docs/experiment.md) | 協定、方程式、13 通道對照表、基準方法 |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | 第三方出處與授權全貌 |

## 授權

- 本專案原創部分：MIT（[`LICENSE`](LICENSE)）
- 改編自 flyjump 的部分：Cobanov Template Attribution License 1.0 ——
  網頁介面與本 README 的標註是該授權的**強制條款，不得移除**
- `data/connectome.json`、`data/brain-atlas/`：MaleCNS v1.0 衍生資料，
  CC BY 4.0，由 FlyEM / HHMI Janelia、University of Cambridge、MRC LMB
  與 Google Research 建立（[`data/NOTICE.md`](data/NOTICE.md)）
- `data/flybody/`：[TuragaLab/flybody](https://github.com/TuragaLab/flybody)，Apache 2.0
- cute-dino 遊戲：[cchouse168](https://github.com/cchouse168)，MIT

## 免責

電路活性為模擬值、無量綱，不是膜電位也不是實測發放率。輸入編碼與動作讀出皆為人工指定，
非生物量測。這是一小段選定的電路，不是完整的腦。資料提供方不對本實驗背書。
