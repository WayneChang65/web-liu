# web-liu 專案分析與改進報告

> 分析日期：2026-01-14 ｜ 分析範圍：`web-liu`（線上嘸蝦米編輯器，小青網蝦）

## 1. 專案概覽

| 項目 | 內容 |
| --- | --- |
| 功能 | 純前端的線上嘸蝦米輸入法編輯器：嘸蝦米碼 → 候選字、3 個編輯分頁、暫存/讀回（localStorage）、Markdown 匯出（turndown）、深色模式、沉浸模式、字級縮放 |
| 技術棧 | Vite 7 + vanilla JS（無 framework）、contenteditable 編輯器 |
| 核心資料 | `src/boshiamy-data.js`：22,778 筆「嘸蝦米碼 → 候選字串」字典（448KB、22,780 行） |
| 原始碼規模 | `main.js` 1,018 行（全部邏輯）、`description.js` 8 行、`style.css` 559 行、兩支 HTML |
| 建置/部署 | Docker 多階段（node:22-alpine 建置 → httpd:2.4-alpine 提供靜態站）+ Traefik + Authelia，域名 `liu.wayne65.cc` |

## 2. 現狀優點

- `vite build` 通過、LSP 無型別/語法錯誤。
- 資料/邏輯/UI 分離清楚；貼上（paste）已做 plain-text 消毒。
- 字典查詢 O(1)（物件直查），IME 每按鍵成本極低。
- 部署鏈完整（Docker + Traefik + Let's Encrypt + Authelia 驗證）。

---

## 3. 問題與改進

### 🔴 高優先

**H1. 輸入嘸蝦米碼 `constructor` 會直接 crash（已重現）**
`src/main.js:469`：

```js
const results = boshiamyData[inputBuffer];      // "constructor" 不在字典裡
candidates = results ? results.split("") : [];  // TypeError: results.split is not a function
```

`constructor` 全小寫、且每個字元都在嘸蝦米字元集內，是合法碼形。未命中字典時 JS 回傳 `Object.prototype.constructor`（function，truthy），`.split` 直接炸掉。已用 node 重現確認。
**修法**：查表前 `Object.hasOwn(boshiamyData, inputBuffer)`，或將字典以 `Object.create(null)` 建立（`valueOf` 等其他 prototype 鍵因含大寫鍵入不到，但 `hasOwnProperty` 等防御一併處理最穩）。

**H2. `node_modules` 被 commit 進 git**
240 個 tracked 檔案中 220 個（91.7%）是 `node_modules`，pack 歷史約 9.7MB（`.git` 共 9.9MB），且跨平台 binary 進了 repo。
**修法**：

```bash
git rm -r --cached node_modules
git commit -m "chore: stop tracking node_modules"
# 若要徹底清歷史（建議）：
git filter-repo --invert-paths --path node_modules   # 之後 force push
```

**H3. localStorage 內容經 `innerHTML` 還原 → 儲存的 XSS 路徑**
「讀回暫存」、分頁切換、`?action=restore` 自動還原都直接 `mainEditor.innerHTML = 已存內容`（main.js:769/780/979）。localStorage 被同機其他 origin 不可寫，但被惡意腳本/共享裝置污染後，`<img onerror=...>` 可在還原時執行。
**修法**：存檔與還原時做 allow-list 消毒（只留 `strong/em/u/div/br/span[data-font-sized]` 及其 style），或引入 DOMPurify；再加 CSP meta（`script-src 'self'`）作第二層防線。

**H4. localStorage 配額無保護**
6+ 處裸呼叫 `localStorage.setItem`（主題、字級、IME 模式、分頁、內容存檔）。文件 >5MB 時 `QuotaExceededError` 未處理 → 存檔靜默失敗、無任何提示。
**修法**：包 try/catch，失敗時給使用者可見的提示（toast 或 alert）。

**H5. `favicon.png` 1.1MB**
對 favicon 來說过大。重新壓縮到 ~50KB 以內（並考慮產出 `.ico` 與 180px `apple-touch-icon`）。README 用圖 main_*.png 共 ~1MB 也建議壓縮。

### 🟡 中優先

**M1. `charset=utf-t` typo**（main.js:918）
Markdown 匯出 Blob 的 type 寫成 `text/markdown;charset=utf-t`，應為 `utf-8`。

**M2. 數字選字行為**
候選顯示是 **0-based**（第一個候選顯示「0.」），按 `0` 選第一個候選——自洽，但與經典嘸蝦米 1–9（0=第 10 個）的習慣不同，建議確認是否為預期設計；另外當候選數 < 10 時按「超過候選數」的數字，`preventDefault` 後靜默吞掉、無任何回饋。

**M3. 貼上不清 IME buffer**
貼上處理（main.js:851-893）插入純文字後沒呼叫 `clearImeState()`：貼上前若 buffer 有殘留（例如正在打 `abc`），貼上後 buffer 仍是 `abc`，下一筆嘸蝦米鍵會接在舊 buffer 後面。

**M4. 無測試、無 lint、無 CI；monolithic main.js**

- 核心 IME 邏輯（查表、分頁、v/r/s/f 選擇、空白確認、退格）全是純函數潛力，抽成 `src/ime/lookup.ts(js)` 後用 vitest 覆蓋（H1 這種 bug 一個單元測試就能擋住）。
- `main.js` 1,018 行混了 IME 引擎、選取/定位、主題、縮放、分頁、存檔、匯出，建議拆 `ime.js` / `editor.js` / `storage.js` / `export-md.js` / `positioning.js`。
- 加 ESLint（或 Biome）+ Prettier；GitHub Actions 跑 `npm ci && npm run build`。
- 注意：typos 掃描工具對 `boshiamy-data.js` 的 200+ 警報全是假陽性（嘸蝦米碼本就不是英文單字），應把該檔排除出 lint/typos 範圍。

**M5. package.json 雜項**

- `"main": "main.js"` 指向不存在的路徑（應刪或改為 `src/main.js` 語意）。
- `esbuild / rollup / fdir / picomatch / postcss / source-map-js / tinyglobby / nanoid / picomolors` 全是 vite 的傳過依賴，不應列為直接 `dependencies`。
- `overrides: rollup → @rollup/wasm-node` 與 `optionalDependencies: @rollup/rollup-linux-x64-musl` 互相矛盾，建議二擇一。

**M6. Docker / 部署**

- Dockerfile `rm package-lock.json` 再 `npm install` 是繞 platform 問題的 hack；改成可攜 lockfile + `npm ci`（npm 10+ lockfile 本就含各平台 optional deps）。
- httpd 以 root 執行（Dockerfile 註解自認）→ 改用 `httpd` 影像的 `daemon` 使用者並調整目錄權限。
- `docker-compose.yml` 掛載 `./data/db:/usr/local/apache2/htdocs/db:ro` 但全專案沒有任何後端用到 `db/`，是死掛載。
- 無安全 header（`X-Content-Type-Options: nosniff`、`Referrer-Policy`、CSP）→ 放一支 httpd conf 進容器。

**M7. `description.html` 殘留死 CSS**
`.stats-container` 樣式（line 54、83）對應的統計功能已刪（commit d78190f），CSS 沒清。

**M8. Google Fonts `@import` 為渲染阻斷外部依賴**
Noto Sans TC 從 Google 載入，對目標使用者（繁中圈）可能慢或不可達。建議自架字型或至少加 `font-display: swap` 的系統字體 fallback 優先序。

**M9. 448KB 字典內嵌 main chunk**
build 後 main chunk 292KB（gzip 132KB）幾乎全是字典。可接受，但若要優化：改成 runtime `fetch('boshiamy-data.json')`（可獨立 cache）＋載入中顯示，或 lazy import。

### 🟢 低優先 / 打磨

| # | 項目 | 說明 |
| --- | --- | --- |
| L1 | `toggleStyle` 的「取消樣式」會 unwrap 整個 styled 元素 | 選取只蓋住部分粗體時，整段粗體都被移除（程式註解已自認；要做完整需 split range） |
| L2 | 字級 span 用 px、編輯器 zoom 用 rem | 放大編輯器時已設 px 的字不會隨比例縮放 |
| L3 | 放大無上限 | `zoomIn` 只防下限 0.5，可無限放大 |
| L4 | 按 Enter 後 placeholder 消失 | 剩 `<br>` 使 `:empty` 失效 |
| L5 | temp-span 量 cursor 的邏輯重複 3 處 | `updateImeBarPosition` / `ensureCursorIsVisible` / paste handler 各寫一份，抽一個 `getSelectionRect(range)` |
| L6 | 版本號三處硬編碼 | package.json `0.2.0`、index.html `v0.2.0`、docker-compose image tag；建議 build 時注入 |
| L7 | 可及性 | `#mode-indicator` 是可點 div 但無 role/鍵盤焦點；contenteditable 缺 `role="textbox"` + `aria-label`；候選列無 `aria-live`；「...」切換鈕無 `aria-expanded` |
| L8 | 手機無候選鍵盤 | 候選只能用數字鍵選（需要實體鍵盤）；若要支援純觸控需加可點候選字 |
| L9 | `.gemini/tmp/COMMIT_MSG` 被 git 追蹤 | 雖在 .gitignore 但曾被 force-add，`git rm --cached` 掉 |
| L10 | `updateModeIndicator` 用 innerHTML | 內容是靜態的（安全），但改 `textContent`/`classList` 更乾淨 |

---

## 4. 建議執行順序

**這 30 分鐘（純 bug，小改動）**

1. H1 `Object.hasOwn` 查表修正（含 H1 的單元測試）
2. M1 `utf-t` → `utf-8`
3. M3 paste 後 `clearImeState()`
4. L9 移除 `.gemini` 追蹤

**這週**
5. H2 `git rm -r --cached node_modules`（+ 評估 filter-repo 清歷史）
6. H3 存檔/還原 allow-list 消毒 + CSP meta
7. H4 localStorage 存檔 try/catch + 使用者提示
8. H5 favicon 重新壓縮
9. M6 Docker 修正（lockfile+`npm ci`、去 root、刪死掛載、安全 header）

**下個迭代**
10. M4：抽出 IME 純函數 + vitest + lint + CI
11. M5 清理 package.json
12. M7/M8 清死 CSS、字型 fallback
13. L1–L8 視需求排入 backlog
