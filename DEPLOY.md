# web-liu 部署手冊（o1 專用）

原則（D12）：小青只提交 git；o1 上所有指令由主人手動執行，跑完回報結果。
每條指令一行＋一句用途；出現異常就停下，把畫面回報給小青，不要硬接續。

---

## A. 取得程式碼（o1 上，第一次）

```bash
git clone https://github.com/WayneChang65/web-liu.git
# 第一次在 o1 clone 專案（之後都用 git pull 更新）
```

## B. 設定檔檢查（每次部署前確認一次）

```bash
cd web-liu
cat .env
# 確認存在 MY_DOMAIN=wayne65.cc 與 DEFAULT_NETWORK=<o1 的 traefik 共用網路名>
# （.env 不在 git 內，是 o1 本地檔案；缺了就問小青要範本，不要亂編網路名）
```

## C. 部署（每次代碼更新後）

```bash
git pull
# 拉小青剛 push 的 master 最新碼（Dockerfile 是 clone GitHub 來 build，pull 不到=build 舊碼）

sudo docker compose build --build-arg CACHEBUST=$(date +%s)
# 重建 liu-web 映像；CACHEBUST 防 build 快取拿到舊 clone

sudo docker compose up -d
# 起容器；本版起 liu-proxy 已不存在，compose 會自動移除舊容器（屬預期，不是誤刪）
```

## D. 驗證（部署後照順序，全部通過才算成功）

> **D0 已知陷阱（2026-09-22 實測觸發，已修）**：舊版 compose 的
> `traefik.http.routers.liu-hackmd.maxbodysize` label 在本 fork
> （felixbuenemann/traefik:v3.6.1）報 `field not found, node: maxbodysize`，
> 且會拖垮整個 liu-web 容器的 router 註冊。repo 已刪除此 label；
> 若 log 仍見此行 → `git pull` ＋ `sudo docker compose up -d`（不必重 build）。

```bash
sudo docker logs traefik 2>&1 | tail -30
# 看 traefik 有無 parse error / field not found（重點 grep：
# sudo docker logs traefik 2>&1 | grep -iE 'err|field not found' | tail）
# 若還有 liu-hackmd/liu-web 相關 label 錯誤→把那行 label 從 compose 拿掉再
# up -d，回報小青；寧可不限制 body 大小也不能讓 router 起不來

sudo docker logs liu-web 2>&1 | tail -5
# liu-web 正常聆聽，無重啟迴圈

curl -s -o /dev/null -w '%{http_code}\n' https://liu.$(grep MY_DOMAIN .env | cut -d= -f2)/
# 主站點：期望 302/401（Authelia 擋未登入）＝正常；502/404 異常

curl -s -o /dev/null -w '%{http_code}\n' https://liu.$(grep MY_DOMAIN .env | cut -d= -f2)/api/hackmd/notes
# 直轉 router：未帶 Authelia cookie 期望同為 302/401；若 404=router 沒生效（回報）
```

瀏覽器終驗（主人方便時）：
1. 經 Authelia 登入後開 liu 站 → 頁面正常、嘸蝦米打字正常（舊版功能回歸）
2. DevTools Network 打 `/api/hackmd/notes` 帶 token → 200 ＋ JSON 陣列

## E. 回滾（部署後發現不對）

```bash
sudo docker compose down
git log --oneline -5
git checkout <上一個好的 commit>
sudo docker compose up -d --build
# 回到舊 commit 重起；確認環境恢復後回報小青，再一起看 log 找原因
```

## F. 回報格式（試完跟小青說）

- 階段（C/D/E）＋每個指令的輸出最後 3～5 行
- D 段四個期望值各自實際值（例：302 / 302 / 401 / 200）
- 有截圖更好，沒截圖文字也夠
