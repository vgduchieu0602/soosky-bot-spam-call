# Deploy lên VPS — Docker + nginx

App chạy trong Docker, nginx reverse-proxy ra ngoài. Không dùng pm2 — `restart: unless-stopped` đã lo 24/7. MongoDB dùng Atlas nên không cần container Mongo.

- Cổng trong container: **3000** · Cổng publish ra VPS: **3003**
- Cổng đã bị chiếm trên VPS: `3000` soosky-plant-care-api, `3001` soosky-storm-api, `3002` soosky-weather-marine-api
- API docs: [docs-share/API.md](docs-share/API.md)

---

## 0. Trước tiên: commit và push

VPS lấy code bằng `git clone`, nên file deploy phải có trên GitHub trước:

```bash
# Chạy ở MÁY LOCAL
git add Dockerfile docker-compose.yml .dockerignore .env.example DEPLOY.md deploy/ .github/
git commit -m "chore: docker deploy setup"
git push origin master
```

Kiểm tra không có secret nào bị commit:

```bash
git ls-files | grep -E "^\.env$"     # phải không ra gì
```

---

## 1. Chuẩn bị VPS

```bash
# Docker (bỏ qua nếu VPS đã có)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Xem RAM. Nếu Mem < 1GB và Swap = 0B thì tạo swap, không thì bỏ qua.
free -h
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Cổng 3003 phải rảnh (không ra gì là rảnh)
sudo ss -ltnp | grep :3003
```

Swap chỉ để `tsc` không hết RAM lúc build. App chạy không dùng swap.

Vào MongoDB Atlas → Network Access → thêm IP của VPS. Bỏ bước này thì container exit ngay lúc start vì `connectMongo()` fail.

---

## 2. Clone và cấu hình

```bash
cd ~
git clone https://github.com/<user>/<repo>.git soosky-bot-spam-call
cd soosky-bot-spam-call

cp .env.example .env
nano .env
chmod 600 .env
```

Hai giá trị bắt buộc:

```bash
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/soosky_spam_call?retryWrites=true&w=majority
FTC_API_KEY=<key api.data.gov>
```

Ba chỗ dễ sai:

| | |
| --- | --- |
| `MONGO_URI` | Phải có **tên database** trước dấu `?`. Thiếu là dữ liệu vào database tên `test` |
| `HOST_PORT` | Chỉ sửa nếu 3003 đã bị chiếm. Sửa thì phải đổi `proxy_pass` trong nginx cho khớp |
| `HTTP_TRUST_PROXY` | Giữ `1` khi có nginx phía trước. Đặt `0` nếu expose thẳng ra Internet |

Giá trị còn lại để nguyên — xem [.env.example](.env.example).

`.env` không được commit ([.gitignore](.gitignore)) và không vào image ([.dockerignore](.dockerignore)); compose nạp nó lúc runtime qua `env_file`.

---

## 3. Build và chạy

```bash
docker compose up -d --build
docker compose logs -f api
```

Chờ các dòng:

```
MongoDB connected.
[app] listening on http://0.0.0.0:3000.
[scheduler] next FTC sync at ....
[sync] 2026-08-11..2026-08-13 in ...ms; {"fetched":...,"inserted":...}
```

```bash
curl -s http://127.0.0.1:3003/health
docker compose ps        # STATUS healthy sau khi sync đầu tiên xong
```

`SYNC_RUN_ON_BOOT=true` nên sync chạy ngay lúc start. Trước khi sync đầu xong, `/health` trả `503 NEVER_SYNCED` và container ở trạng thái `starting` (healthcheck có `start_period: 180s`). Nếu FTC chậm hơn thế, container bị đánh `unhealthy` nhưng **không** bị restart — `restart: unless-stopped` chỉ phản ứng khi process exit, không phản ứng healthcheck.

---

## 4. nginx + HTTPS

Domain mẫu trong file config: **project4.vuonghieu.site** — đổi nếu dùng domain khác.

Trỏ DNS trước: record **A** cho domain → IP của VPS. Kiểm tra:

```bash
dig +short project4.vuonghieu.site      # phải ra IP VPS
```

Copy config:

```bash
cd ~/soosky-bot-spam-call
sudo cp deploy/nginx/spam-call-api.conf /etc/nginx/sites-available/spam-call-api
sudo ln -s /etc/nginx/sites-available/spam-call-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Test HTTP trước khi lấy chứng chỉ:

```bash
curl -I http://project4.vuonghieu.site/health      # 200 hoặc 503, miễn không phải 502
```

Lấy HTTPS:

```bash
sudo certbot --nginx -d project4.vuonghieu.site
curl -s https://project4.vuonghieu.site/health
```

certbot tự thêm block `listen 443` + chứng chỉ vào file, và tự gia hạn qua systemd timer. Kiểm tra: `systemctl list-timers | grep certbot`. Giữ block `listen 80` — ACME challenge cần nó để renew.

Domain khác nhau thì nginx tự route theo `server_name`, không đụng các project khác đang chạy trên cùng VPS.

Firewall: chỉ mở 80/443, **không** mở 3003.

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Docker ghi iptables trực tiếp và bỏ qua ufw — đó là lý do compose bind `127.0.0.1:${HOST_PORT}`. Đổi thành `0.0.0.0` là mở port ra Internet dù ufw deny.

---

## 5. Kiểm tra

```bash
BASE=https://project4.vuonghieu.site

curl -s $BASE/health | jq
curl -s "$BASE/api/v1/spam-numbers?from=2026-08-01&limit=5" | jq
curl -s "$BASE/api/v1/reputation?phone=2025550111" | jq
curl -sI "$BASE/api/v1/spam-numbers?from=2026-08-01" | grep -i ratelimit
```

Đúng khi: `/health` trả `"status":"healthy"` kèm `lastSuccessfulSyncAt`, `/api/v1/spam-numbers` có `items`, response có header `RateLimit-*`.

Xác nhận rate limit đọc đúng IP client: gọi quá 60 lần trong một phút từ một máy phải ra `429`, máy khác vẫn `200`. Nếu mọi client dùng chung quota thì `X-Forwarded-For` chưa tới app — kiểm tra `proxy_set_header` trong nginx và `HTTP_TRUST_PROXY`.

---

## 6. Cập nhật code

```bash
cd ~/soosky-bot-spam-call
git pull
docker compose up -d --build
docker image prune -f
```

Rollback:

```bash
git log --oneline -5
git checkout <commit_cũ>
docker compose up -d --build
```

Shutdown là graceful: compose gửi `SIGTERM`, app đóng HTTP server (chờ request đang xử lý, tối đa 10 giây), chờ lần sync đang chạy xong, rồi `mongoose.disconnect()`. `stop_grace_period: 30s` trong [docker-compose.yml](docker-compose.yml) lớn hơn giới hạn cứng 15 giây của app.

---

## 7. Auto-deploy bằng GitHub Actions

Workflow đã có: [.github/workflows/deploy.yml](.github/workflows/deploy.yml) (SSH vào VPS, `git pull` + `docker compose up -d --build`) và [.github/workflows/ci.yml](.github/workflows/ci.yml) (test + build + docker build cho mỗi PR/push).

Vào GitHub repo → **Settings → Secrets and variables → Actions**:

| Secret | Giá trị |
|--------|---------|
| `VPS_HOST` | IP hoặc domain VPS |
| `VPS_USER` | user SSH (vd `ubuntu`, `root`) |
| `VPS_SSH_KEY` | **private key** SSH |
| `VPS_PORT` | cổng SSH (thường `22`) |
| `VPS_APP_PATH` | đường dẫn repo trên VPS (vd `/home/ubuntu/soosky-bot-spam-call`) |

Tạo key nếu chưa có: trên VPS `ssh-keygen -t ed25519`, thêm public key vào `~/.ssh/authorized_keys`, copy private key vào secret `VPS_SSH_KEY`.

---

## 8. Lệnh vận hành

```bash
docker compose ps
docker compose logs -f --tail=100 api
docker compose logs api | grep '\[sync\]'
docker compose restart api
docker compose down
docker stats soosky-bot-spam-call --no-stream
```

VPS reboot → container tự chạy lại.

Xem lịch sử sync trong Mongo (collection `ftc_sync_runs`): mỗi lần chạy là một document với `status`, `startedAt`, `completedAt`, `errorMessage`, `fetched`, `accepted`, `inserted`, `updated`.

---

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
| --- | --- |
| Build bị kill, `exit code 137` | Hết RAM lúc build → tạo swap ở mục 1 |
| `bind ... address already in use` | Cổng 3003 bị chiếm → đặt `HOST_PORT=3004` trong `.env`, đổi `proxy_pass` trong nginx cho khớp |
| Container exit ngay, log `startup failed` | `MONGO_URI` sai hoặc IP VPS chưa whitelist trong Atlas |
| `MissingEnvVarError` | Thiếu `MONGO_URI` hoặc `FTC_API_KEY` trong `.env` |
| `/health` trả `503 NEVER_SYNCED` mãi | Sync chưa bao giờ thành công → `docker compose logs api \| grep '\[sync\]'` và xem `ftc_sync_runs` (`status: "failed"`, `errorMessage`) |
| `/health` trả `503 STALE_DATA` | Sync thành công gần nhất cũ hơn `HEALTH_MAX_SYNC_AGE_HOURS` (48h) |
| `/health` trả `503 MONGO_DISCONNECTED` | Mất kết nối Atlas sau khi start; kiểm tra network/allowlist |
| `502` từ nginx | Container chưa chạy hoặc sai port → `curl http://127.0.0.1:3003/health` |
| Mọi client dùng chung quota rate limit | Thiếu `proxy_set_header X-Forwarded-For`, hoặc có Cloudflare/LB nên phải đặt `HTTP_TRUST_PROXY=2` |
| Sync chạy sai giờ | Image có assert ICU lúc build nên nghi `SYNC_TIME_ZONE`/`SYNC_HOUR` trước |
| Đầy đĩa | `docker image prune -f` |

---

## 10. Hai điều cần biết

**Chỉ chạy 1 container.** `DailyScheduler` chạy trong process Node, nên `docker compose up --scale api=2` sẽ gọi FTC API hai lần cùng lúc và ghi trùng vào `ftc_sync_runs`. Dữ liệu complaint vẫn idempotent nhờ unique `ftcComplaintId`, nhưng vô ích và tốn quota API.

**Rate limit là in-memory theo từng process.** Scale nhiều instance thì ngưỡng thực tế = `60 request/phút × số instance`. Cần ngưỡng dùng chung thì phải chuyển sang Redis, hoặc chặn sớm ở nginx:

```nginx
# trong http{} của /etc/nginx/nginx.conf
limit_req_zone $binary_remote_addr zone=spam_call_api:10m rate=10r/s;

# trong location / của server block
limit_req zone=spam_call_api burst=20 nodelay;
limit_req_status 429;
```

`limit_req_zone` **phải** ở context `http{}`; đặt trong `server{}` là lỗi `directive is not allowed here`.

Muốn chạy MongoDB cùng VPS thì thêm service `mongo` vào [docker-compose.yml](docker-compose.yml), đặt `MONGO_URI=mongodb://mongo:27017/<db>`, mount volume cho `/data/db`, và **không** publish port 27017.
