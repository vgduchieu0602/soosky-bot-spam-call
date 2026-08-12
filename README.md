# FTC Do Not Call complaint warehouse

Service đồng bộ dữ liệu khiếu nại Do Not Call / robocall từ FTC vào MongoDB mỗi ngày và cung cấp API lịch sử theo số điện thoại. FTC công bố dữ liệu các ngày làm việc, thường khoảng trưa theo giờ Eastern; API FTC yêu cầu `api.data.gov` key.

## Luồng dữ liệu

```text
FTC DNC API -> FtcComplaintSource -> SyncDncComplaintsUseCase
                                      | normalize US phone -> E.164
                                      | drop invalid phone/date
                                      v
                              MongoDB: ftc_dnc_complaints
                                      |
                                      v
                             GET /api/v1/complaints
```

- `company-phone-number`: chỉ nhận số NANP Mỹ hợp lệ 10 chữ số hoặc 11 chữ số bắt đầu bằng `1`; lưu `phoneNumber` theo E.164, ví dụ `+12025550111`.
- `created-date`: bắt buộc hợp lệ; lưu `createdAt` kiểu Mongo `Date`.
- `consumer-city`, `consumer-state`: trim và gộp khoảng trắng; dữ liệu FTC bị bỏ trống được lưu `null` vì FTC xác định hai trường này là tùy chọn.
- `ftcComplaintId` là unique index. Chạy lại ngày đã đồng bộ hoặc bản ghi trùng từ nguồn chỉ upsert, không tạo bản ghi lịch sử trùng.

Mỗi complaint ID vẫn là một mục lịch sử riêng. Đây là điều cần thiết để tổng hợp đúng số lần khiếu nại theo số điện thoại, ngày, và địa điểm.

## Cài đặt

```bash
npm install
Copy-Item .env.example .env
# Điền MONGO_URI và FTC_API_KEY trong .env
npm run dev
```

Tạo key tại [api.data.gov signup](https://api.data.gov/signup/). Không commit `.env` hoặc API key.

Mặc định service đồng bộ lúc `13:00` theo `America/New_York`, có chạy ngay khi khởi động, và luôn lấy lại 3 ngày gần nhất. Khoảng overlap này bao gồm cuối tuần/holiday và khiến lần chạy idempotent nhờ unique `ftcComplaintId`.

## Rate limit và shutdown

- Mỗi IP được `HTTP_RATE_LIMIT_MAX` request trong mỗi `HTTP_RATE_LIMIT_WINDOW_MS` (mặc định 60 request / 60 giây). Vượt ngưỡng trả `429 RATE_LIMITED` kèm `Retry-After`. Mọi response đều có `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.
- `GET /health` được miễn rate limit để uptime probe không tự làm mình bị chặn.
- Bộ đếm nằm trong RAM của từng process. Chạy nhiều instance thì ngưỡng thực tế là `max × số instance`; cần ngưỡng dùng chung thì phải chuyển sang store ngoài (Redis).
- `SIGTERM`/`SIGINT`: dừng scheduler và chờ lần sync đang chạy xong, đóng HTTP server nhưng vẫn để request đang xử lý hoàn tất (tối đa `HTTP_SHUTDOWN_TIMEOUT_MS`), rồi mới `mongoose.disconnect()`. Quá `HTTP_SHUTDOWN_TIMEOUT_MS + 5000` thì process tự exit `1`.

## API cho FE

### `GET /health`

Healthy chỉ khi Mongoose đang `connected` **và** lần sync FTC thành công cuối cùng còn mới hơn `HEALTH_MAX_SYNC_AGE_HOURS` (mặc định 48).

```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "mongo": "connected",
    "lastSuccessfulSyncAt": "2026-08-12T06:00:00.000Z",
    "syncAgeSeconds": 3600
  }
}
```

Khi không healthy: HTTP `503` với envelope lỗi chuẩn, `code` là `MONGO_DISCONNECTED`, `MONGO_CONNECTING`, `MONGO_DISCONNECTING`, `NEVER_SYNCED`, hoặc `STALE_DATA`.

### `GET /api/v1/complaints`

Query bắt buộc: `phone`. Query tùy chọn: `from`, `to` (`YYYY-MM-DD`), `limit` (1–100, mặc định 50), `offset` (mặc định 0).

```text
GET /api/v1/complaints?phone=%2B12025550111&from=2026-08-01&to=2026-08-31&limit=50&offset=0
```

```json
{
  "ok": true,
  "data": {
    "phoneNumber": "+12025550111",
    "total": 2,
    "items": [
      {
        "ftcComplaintId": "...",
        "phoneNumber": "+12025550111",
        "rawPhoneNumber": "202-555-0111",
        "createdAt": "2026-08-10T16:23:11.000Z",
        "consumerCity": "Washington",
        "consumerState": "District of Columbia",
        "sourceFetchedAt": "2026-08-11T17:00:00.000Z"
      }
    ]
  }
}
```

API tự chuẩn hoá query số điện thoại giống pipeline ingest; FE có thể gửi `2025550111`, `1 (202) 555-0111`, hoặc `+12025550111`.

## Biến môi trường

Xem đầy đủ trong [.env.example](.env.example). Bắt buộc:

- `MONGO_URI`
- `FTC_API_KEY`

Các biến quan trọng: `SYNC_TIME_ZONE`, `SYNC_HOUR`, `SYNC_MINUTE`, `SYNC_LOOKBACK_DAYS`, `HEALTH_MAX_SYNC_AGE_HOURS`, `HTTP_PORT`, `HTTP_CORS_ORIGIN`, `HTTP_RATE_LIMIT_MAX`, `HTTP_RATE_LIMIT_WINDOW_MS`, `HTTP_SHUTDOWN_TIMEOUT_MS`.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run build
```

Nguồn và quy tắc API FTC: [FTC DNC data set](https://www.ftc.gov/policy-notices/open-government/data-sets/do-not-call-data) và [FTC DNC API documentation](https://www.ftc.gov/developer/api/v0/endpoints/do-not-call-dnc-reported-calls-data-api).
