# CM5 重構分支试玩指南（cm5-refactor）

> 分支：`cm5-refactor`（已推 GitHub；**master 完全沒動**，合併時機由主人決定）
> 內容：編輯核心換 CodeMirror 5（Markdown 源碼模式）＋整頁預覽（Ctrl+Shift+M，
> 表格/KaTeX/mermaid 真渲染）＋嘸蝦米零字洩漏＋快捷鍵完整保留＋草稿 v2
> （舊 HTML 草稿開站自動遷移，只搬一次）。
> 2026-09-25 依主人第一輪试玩回報修 7 項：見下方「本輪變更」。

## 在 o1 上试玩（不覆蓋正式版）

```bash
cd ~/web-liu            # 或 repo 所在目錄
git fetch origin
# 用不同 tag 建分支版，正式版鏡像 0.4.0 完全不動：
sudo docker compose build --build-arg GIT_BRANCH=cm5-refactor \
  --build-arg CACHEBUST=$(date +%s) \
  liu-web
# 上面會把 wayne/liu-web:0.4.0 蓋掉！若想保留正式版鏡像，先備註解：
#   sudo docker tag wayne/liu-web:0.4.0 wayne/liu-web:0.4.0-master-backup
# 再 build，玩完：
#   sudo docker tag wayne/liu-web:0.4.0-master-backup wayne/liu-web:0.4.0
```

或者最直接：本地 gx10/main 開 port-forward 玩 Vite dev（不用上 o1）：

```bash
# 在任何能跑 node20+ 的機器（例如 gx10）：
git clone -b cm5-refactor https://github.com/WayneChang65/web-liu.git
cd web-liu && npm ci && npx vite --port 3000
```

## 试玩重點（回報清單）

1. **嘸蝦米打字**：編码→候選列→數字選字/空格選字；換行/移動游標候選列要跟著
2. **快捷鍵**：Ctrl-B 粗體、Ctrl-I 斜體、Ctrl-1/2/3 標題、Ctrl-K 連結、
   Ctrl-L 清單、Ctrl-Shift-K 程式碼塊、Ctrl-Shift-Q 引用、Ctrl-P 換模式、
   Ctrl-S 存 HackMD、**Ctrl-Shift+M** 進/出預覽、
   **Ctrl-Shift+< / >（或 − / +）** 調編輯器字級（預覽模式也生效）
3. **預覽**：表格、```js 高亮、$E=mc^2$ 與 $$…$$ 數學、```mermaid 圖
4. **HackMD**：開啟 HackMD→選檔（特殊語法會提示但內容原封不動）→編輯→存入
5. **分頁**：三個分頁各自獨立內容；重新整理後還在（自動暫存 v2）
6. **舊草稿**：主人 browser 裡舊版 contenteditable 的暫存，開站後會自動變成
   Markdown 源碼（搬一次、舊 key 刪除）——開站第一眼請確認舊內容還在！
7. 深色模式＋沉浸模式照舊

## 第二輪變更（2026-09-25 主人第二輪试玩 3 項回饋）
- 淺色模式配色統一：全站強調色轉青綠（呼應 logo），HackMD 鈕實面、次要鈕描邊；
  並修掉「存入HackMD」被深色青色樣式污染的 selector bug。
- 編輯器上方新增「編輯／預覽」狀態膠囊（可點擊，＝Ctrl+Shift+M）。
- 預覽支援安全 HTML 顏色標籤：<font color>、<span style=color>、<mark>、
  <kbd> 等照 HackMD 效果渲染（源碼存回不變）；含 img/iframe 的仍會開檔提示。

## 本輪變更（2026-09-25 主人第一輪试玩 7 項回饋）
- 「存入暫存／讀回暫存」按鈕已刪除；打字即自動存稿（放開鍵盤約 0.5 秒寫入
  localStorage），重新開站自動回填，切分頁時舊分頁內容也會留著。
- 預覽改純鍵盤 `Ctrl+Shift+M` 切換（右上角按鈕已移除；`Ctrl+Enter` 讓還原功能）。
- 放大／縮小在預覽模式也會生效；鍵位 `Ctrl+Shift+< / >`（或 `− / +`）。
- 版本文字 v1.1.0。
- 分頁鈕 HackMD 藍點加白色描邊（深色模式自動黑圈），藍底也看得見。
- 嘸蝦米候選框回歸舊版行為：游標在編輯區左半→框往右伸展；右半→貼游標往左。

## 已知取捨（主人拍板過的）

- 所見即所得→源碼＋預覽（D20）：編輯區看到的是 `# 標題` 這文本，不是渲染後標題
- 底線 Ctrl-U 與選取文字調字級移除（D23）；字級改為整個編輯器縮放（D24）
- HackMD 特殊語法（container 等）在預覽中顯示為原始文字（源碼模式不損毀它們）

## 合併

玩過沒問題說一聲，小青開 PR（或主人直接 `git merge cm5-refactor`）；
有任何問題回報小青在分支上修，master 永遠是安全正式版。
