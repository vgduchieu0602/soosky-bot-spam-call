# FTC DNC API Contract

Base URL: `http://<host>:<port>`  
Response envelope: success `{ "ok": true, "data": ... }`; error `{ "ok": false, "code": "...", "reason": "..." }`.

## Rate limit

Giới hạn theo IP, fixed window, cố định **60 request / 60 giây**. `GET /health` được miễn.

| Header | Ý nghĩa |
|---|---|
| `RateLimit-Limit` | Số request tối đa trong window |
| `RateLimit-Remaining` | Số request còn lại của window hiện tại |
| `RateLimit-Reset` | Số giây tới khi window reset |
| `Retry-After` | Chỉ có ở response `429`, số giây nên chờ |

**Output 429**

```json
{ "ok": false, "code": "RATE_LIMITED", "reason": "Too many requests. Retry in 42s." }
```

Bộ đếm in-memory theo từng process, nên khi scale nhiều instance thì ngưỡng thực tế nhân theo số instance.

## Data refresh

- Source: FTC DNC Reported Calls API (`GET /v0/dnc-complaints`), authenticated by `FTC_API_KEY` header. Không crawl HTML/web page.
- Schedule: mỗi ngày lúc `13:00` theo `America/New_York` (cấu hình được); chạy ngay khi service khởi động nếu `SYNC_RUN_ON_BOOT=true`.
- Mỗi lần lấy lại cố định 3 ngày gần nhất để không thiếu dữ liệu weekend/holiday.
- Mongo collection: `ftc_dnc_complaints`; `ftcComplaintId` unique nên chạy lại không sinh duplicate.
- Mongo collection: `ftc_sync_runs`; mỗi lần scheduler chạy ghi một document `running`, sau đó cập nhật `success` hoặc `failed` kèm `startedAt`, `completedAt`, `errorMessage`, `createdDateFrom`, `createdDateTo`, `fetched`, `accepted`, `inserted`, `updated`.

## GET `/health`

Dùng cho uptime monitor / load balancer probe. Healthy yêu cầu **cả hai**: Mongoose đang `connected`, và lần sync thành công cuối cùng còn mới hơn `HEALTH_MAX_SYNC_AGE_HOURS` (mặc định `48`).

**Output 200**

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

`syncAgeSeconds` là số giây từ `lastSuccessfulSyncAt` (thời điểm `completedAt` của lần sync thành công gần nhất) đến lúc gọi.

**Output 503**

```json
{ "ok": false, "code": "STALE_DATA", "reason": "The last successful FTC sync is 180000s old and the allowed age is 48h." }
```

| `code` | Nguyên nhân |
|---|---|
| `MONGO_DISCONNECTED` | Mongoose `readyState` = 0 |
| `MONGO_CONNECTING` | Mongoose `readyState` = 2 |
| `MONGO_DISCONNECTING` | Mongoose `readyState` = 3 |
| `NEVER_SYNCED` | Chưa có lần sync FTC nào thành công |
| `STALE_DATA` | Lần sync thành công cuối cùng cũ hơn `HEALTH_MAX_SYNC_AGE_HOURS` |

## GET `/api/v1/complaints`

Trả lịch sử khiếu nại của một số điện thoại, mới nhất trước. `total` là tổng số complaint thỏa bộ lọc, không chỉ số item của trang hiện tại.

### Input query

| Field | Required | Format / default |
|---|---:|---|
| `phone` | Yes | US number: `2025550111`, `1 (202) 555-0111`, hoặc `%2B12025550111` |
| `from` | No | `YYYY-MM-DD`, đầu ngày UTC |
| `to` | No | `YYYY-MM-DD`, cuối ngày UTC |
| `limit` | No | Integer `1..100`; default `50` |
| `offset` | No | Integer `>=0`; default `0` |

> Với dấu `+` trong URL, FE phải URL-encode thành `%2B` hoặc dùng `URLSearchParams`.

**Example**

```text
GET /api/v1/complaints?phone=%2B12025550111&from=2026-08-01&to=2026-08-31&limit=50&offset=0
```

### Output 200

```json
{
  "ok": true,
  "data": {
    "phoneNumber": "+12025550111",
    "total": 2,
    "items": [
      {
        "ftcComplaintId": "2dae54c3d3c06d1960689139d39c3138",
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

### Errors for FE / Tester

| HTTP | `code` | When |
|---:|---|---|
| 400 | `MISSING_QUERY_PARAM` | Thiếu `phone` |
| 400 | `INVALID_PHONE_NUMBER` | Phone không phải US NANP hợp lệ |
| 400 | `INVALID_DATE` | `from` / `to` không phải ngày hợp lệ `YYYY-MM-DD` |
| 400 | `INVALID_DATE_RANGE` | `from` sau `to` |
| 400 | `INVALID_PAGINATION` | `limit` / `offset` không hợp lệ |
| 404 | `NOT_FOUND` | Sai route |
| 500 | `INTERNAL_ERROR` | Lỗi server |

## GET `/api/v1/reputation`

Endpoint nội bộ để kiểm tra nhanh một số trước khi đưa vào pool. Nó không tự phân loại hoặc chặn số; service gọi tự áp ngưỡng phù hợp.

Input: `phone` bắt buộc, `from` và `to` tùy chọn với định dạng giống `/api/v1/complaints`. Không có phân trang.

```text
GET /api/v1/reputation?phone=%2B12025550111&from=2026-05-01
```

```json
{
  "ok": true,
  "data": {
    "phoneNumber": "+12025550111",
    "complaintCount": 2,
    "lastComplaintAt": "2026-08-10T16:23:11.000Z"
  }
}
```

`lastComplaintAt` là `null` nếu không có complaint trong khoảng lọc.

## GET `/api/v1/spam-numbers`

Trả danh sách số khác nhau đã có complaint trong một khoảng thời gian. Đây là endpoint để service tiêu thụ đồng bộ hoặc kiểm tra batch; bot chỉ công bố dữ liệu, không tự áp chính sách chặn số.

| Query | Required | Default | Description |
|---|---:|---:|---|
| `from` | Yes | | `YYYY-MM-DD`, đầu ngày UTC |
| `to` | No | | `YYYY-MM-DD`, cuối ngày UTC |
| `minComplaints` | No | `1` | Số complaint tối thiểu, `1..1000000` |
| `limit` | No | `50` | `1..100` |
| `offset` | No | `0` | `>=0` |

```text
GET /api/v1/spam-numbers?from=2026-08-01&minComplaints=1&limit=50&offset=0
```

```json
{
  "ok": true,
  "data": {
    "total": 2,
    "items": [
      {
        "phoneNumber": "+12025550111",
        "complaintCount": 4,
        "lastComplaintAt": "2026-08-11T15:00:00.000Z"
      }
    ]
  }
}
```

## Data quality rules

- `company-phone-number`: bắt buộc; chỉ nhận 10 chữ số NANP hoặc 11 chữ số bắt đầu `1`; lưu chuẩn E.164 `+1xxxxxxxxxx`.
- `created-date`: bắt buộc và phải parse được; lưu Mongo `Date` / API ISO-8601 UTC.
- `consumer-city`, `consumer-state`: trim + gộp khoảng trắng; FTC cho phép để trống nên lưu `null` thay vì bịa dữ liệu.
- Complaint ID trùng được upsert; các complaint ID khác nhau cùng một số vẫn được giữ để tổng hợp lịch sử chính xác.

## Test checklist

- Số 10 digit, `1` + 10 digit, và E.164 đều trả cùng `phoneNumber` chuẩn.
- Phone rỗng, có chữ, quốc tế/non-NANP trả `400 INVALID_PHONE_NUMBER`.
- Kiểm tra phân trang: `limit=1&offset=0`, sau đó `offset=1`; `total` không đổi.
- Kiểm tra lọc ngày và `from > to`.
- Sau hai lần sync cùng dữ liệu, Mongo không tăng số document cho cùng `ftcComplaintId`.
