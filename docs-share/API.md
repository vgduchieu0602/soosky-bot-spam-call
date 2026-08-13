# Spam Call Data API

Tài liệu này là API contract cho FE, QA và backend tích hợp. Service công bố dữ liệu khiếu nại cuộc gọi từ FTC đã được chuẩn hóa; service gọi API tự quyết định quy tắc chặn hoặc gắn nhãn spam.

## 1. Thông tin chung

| Item | Giá trị |
|---|---|
| Base URL local | `http://127.0.0.1:3000` |
| Base URL production | `https://project5.vuonghieu.site` |
| Phiên bản API | `v1` |
| Content type | `application/json` |
| Authentication | Chưa có API key/JWT. Chỉ mở service cho các hệ thống được phép truy cập. |
| Timezone dữ liệu | Mọi datetime trả về là ISO-8601 UTC, ví dụ `2026-08-12T15:00:00.000Z`. |
| Ngày lọc | `YYYY-MM-DD`, tính theo UTC. `from` bắt đầu `00:00:00.000Z`; `to` kết thúc `23:59:59.999Z`. |

### Response envelope

Mọi response thành công:

```json
{ "ok": true, "data": {} }
```

Mọi response lỗi:

```json
{ "ok": false, "code": "ERROR_CODE", "reason": "Human-readable message." }
```

### Chuẩn hóa số điện thoại

Các endpoint nhận `phone` chỉ hỗ trợ số US/NANP. Các format hợp lệ gồm:

```text
2025550111
1 (202) 555-0111
+1 202 555 0111
```

Kết quả luôn dùng E.164: `+12025550111`.

```ts
const query = new URLSearchParams({ phone: "+12025550111" });
fetch(`/api/v1/complaints?${query}`);
```

## 2. Phân trang

Chỉ `/api/v1/spam-numbers` có phân trang. `/api/v1/complaints` và `/api/v1/search` do backend xử lý toàn bộ kết quả, client không truyền `limit`, `page` hoặc `offset`.

| Query | Bắt buộc | Giá trị | Mặc định |
|---|---:|---|---:|
| `page` | Không | Integer từ `1` trở lên | `1` |
| `limit` | Không | Integer từ `1` đến `100` | `50` |
| `offset` | Không | Integer từ `0` trở lên | — (chỉ tương thích client cũ) |

- `total` là tổng số bản ghi hoặc số điện thoại thỏa điều kiện lọc, không phải độ dài của `items`.
- `items` chỉ chứa trang hiện tại, có tối đa `limit` item.
- `totalPages = ceil(total / limit)`.
- FE gửi `page` bắt đầu từ `1`; backend tự tính `offset = (page - 1) × limit`.
- Không gửi đồng thời `page` và `offset`. `offset` được giữ tạm thời cho client cũ.

Ví dụ với `total = 8697`, `limit = 100`:

```text
GET /api/v1/spam-numbers?page=1&limit=100
GET /api/v1/spam-numbers?page=2&limit=100
GET /api/v1/spam-numbers?page=3&limit=100
```

## 3. Endpoints

`GET /api/v1/reputation` đã bị xóa. Dùng `GET /api/v1/complaints` để lấy cả thông tin reputation và lịch sử chi tiết trong một request.

### 3.1 `GET /health`

Điều kiện trả `200`: Mongo đang kết nối và lần FTC sync thành công gần nhất chưa quá `HEALTH_MAX_SYNC_AGE_HOURS`.

**Response `200`**

```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "mongo": "connected",
    "lastSuccessfulSyncAt": "2026-08-12T15:00:00.000Z",
    "syncAgeSeconds": 3600
  }
}
```

**Response `503` ví dụ**

```json
{
  "ok": false,
  "code": "STALE_DATA",
  "reason": "The last successful FTC sync is 180000s old and the allowed age is 48h."
}
```

| Code `503` | Ý nghĩa |
|---|---|
| `MONGO_DISCONNECTED` | Mongo chưa kết nối. |
| `MONGO_CONNECTING` | Mongo đang kết nối. |
| `MONGO_DISCONNECTING` | Mongo đang ngắt kết nối. |
| `NEVER_SYNCED` | Chưa có lần sync FTC thành công. |
| `STALE_DATA` | Dữ liệu quá cũ theo ngưỡng cấu hình. |

### 3.2 `GET /api/v1/complaints`

Mục đích: lấy lịch sử complaint chi tiết của một số. Kết quả sắp xếp mới nhất trước.

| Query | Bắt buộc | Format / giới hạn | Mặc định |
|---|---:|---|---:|
| `phone` | Có | US/NANP phone | — |
| `from` | Không | `YYYY-MM-DD` | — |
| `to` | Không | `YYYY-MM-DD` | — |

```text
GET /api/v1/complaints?phone=2025550111
```

**Response `200`**

```json
{
  "ok": true,
  "data": {
    "phoneNumber": "+12025550111",
    "complaintCount": 2,
    "lastComplaintAt": "2026-08-10T16:23:11.000Z",
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

`complaintCount` và `lastComplaintAt` là thông tin reputation của số trong toàn bộ kết quả lọc. `items` là lịch sử chi tiết, sắp xếp mới nhất trước. Nếu số chưa có complaint trong khoảng lọc, API trả `complaintCount: 0`, `lastComplaintAt: null` và `items: []`. `consumerCity` và `consumerState` có thể là `null` khi FTC không cung cấp thông tin đó.

### 3.3 `GET /api/v1/spam-numbers`

Mục đích: lấy danh sách số điện thoại có complaint trong database. 

Mặc định không truyền ngày sẽ trả tất cả số có ít nhất một complaint. Các số được gộp theo số điện thoại E.164:

- `total`: số điện thoại duy nhất thỏa điều kiện.
- `complaintCount`: tổng complaint của từng số trong điều kiện lọc.
- Không phải tổng số document complaint trong Mongo.

| Query | Bắt buộc | Format / giới hạn | Mặc định |
|---|---:|---|---:|
| `from` | Không | `YYYY-MM-DD` | — |
| `to` | Không | `YYYY-MM-DD` | — |
| `minComplaints` | Không | Integer `1..1000000` | `1` |
| `page` | Không | Integer `>=1` | `1` |
| `limit` | Không | `1..100` | `50` |
| `offset` | Không | `>=0`, chỉ cho client cũ; không dùng cùng `page` | — |

**Lấy trang đầu của toàn bộ danh sách**

```text
GET /api/v1/spam-numbers?page=1&limit=100
```

**Chỉ lấy số có ít nhất 3 complaint kể từ đầu năm 2026**

```text
GET /api/v1/spam-numbers?from=2026-01-01&minComplaints=3&page=1&limit=100
```

**Response `200`**

```json
{
  "ok": true,
  "data": {
    "page": 1,
    "limit": 50,
    "total": 8697,
    "totalPages": 174,
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

Kết quả sắp xếp theo `complaintCount` giảm dần, tiếp theo `lastComplaintAt` giảm dần, rồi `phoneNumber` tăng dần để pagination ổn định.

### 3.4 `GET /api/v1/search`

Mục đích: tìm một phần số điện thoại trong kho số spam. Endpoint phù hợp cho ô tìm kiếm FE hoặc backend cần tìm các số chứa một chuỗi chữ số. Không phân trang: backend trả toàn bộ số khớp.

| Query | Bắt buộc | Format | Ý nghĩa |
|---|---:|---|---|
| `phone` | Có | Chuỗi chứa `3..15` chữ số | Phần số cần tìm; dấu cách, `+`, `-`, `(`, `)` được bỏ qua. |

Ví dụ, tìm các số chứa `01234`:

```text
GET /api/v1/search?phone=01234
```

**Response `200`**

```json
{
  "ok": true,
  "data": {
    "total": 1,
    "items": [
      {
        "phoneNumber": "+12025501234",
        "complaintCount": 2,
        "lastComplaintAt": "2026-08-12T00:00:00.000Z"
      }
    ]
  }
}
```

`items` có cùng cấu trúc và thứ tự sắp xếp như `/api/v1/spam-numbers`: nhiều complaint của cùng một số được gộp thành một item.

## 4. Error contract

| HTTP | Code | Khi nào xảy ra |
|---:|---|---|
| `400` | `MISSING_QUERY_PARAM` | Thiếu query bắt buộc, ví dụ `phone`. |
| `400` | `INVALID_PHONE_NUMBER` | `phone` không phải số US/NANP hợp lệ. |
| `400` | `INVALID_DATE` | Ngày sai định dạng hoặc ngày không tồn tại. |
| `400` | `INVALID_DATE_RANGE` | `from` sau `to`. |
| `400` | `INVALID_PAGINATION` | `page`, `limit` hoặc `offset` không đúng giới hạn; hoặc gửi cả `page` và `offset`. |
| `400` | `INVALID_MIN_COMPLAINTS` | `minComplaints` không thuộc `1..1000000`. |
| `400` | `INVALID_PHONE_SEARCH` | `phone` của `/api/v1/search` không có từ 3 đến 15 chữ số. |
| `404` | `NOT_FOUND` | Sai method hoặc route. |
| `429` | `RATE_LIMITED` | Vượt rate limit. |
| `500` | `INTERNAL_ERROR` | Lỗi không mong đợi của server. |
| `503` | Các code health | Chỉ áp dụng cho `/health`. |

Ví dụ lỗi input:

```text
GET /api/v1/complaints?phone=abc
```

```json
{
  "ok": false,
  "code": "INVALID_PHONE_NUMBER",
  "reason": "Phone number must be a valid US NANP number."
}
```

## 5. Rate limit và retry

- Tất cả endpoint `/api/v1/*`: tối đa 60 request mỗi phút theo IP, theo từng process.
- `GET /health` được miễn rate limit.
- Các response API có header:
  - `RateLimit-Limit`: quota tối đa trong cửa sổ hiện tại.
  - `RateLimit-Remaining`: quota còn lại.
  - `RateLimit-Reset`: số giây đến lúc quota reset.
  - `Retry-After`: chỉ có khi response `429`.
- Khi nhận `429`, client phải chờ số giây trong `Retry-After` trước khi retry.

## 6. Kịch bản tích hợp đề xuất

### FE: tra cứu một số

1. Gọi `/api/v1/complaints?phone=<input>` khi người dùng bấm kiểm tra.
2. Hiển thị `complaintCount`, `lastComplaintAt` và `items` từ cùng một response.
3. Với `400`, hiển thị lỗi input; với `429`, yêu cầu người dùng thử lại; với `500`, hiển thị lỗi hệ thống.

### FE: tìm theo một phần số

1. Chỉ gọi `/api/v1/search?phone=<fragment>` sau khi người dùng nhập ít nhất 3 chữ số.
2. Hiển thị `items`; nếu `total` là `0`, hiển thị không tìm thấy số phù hợp.

### Backend: đồng bộ danh sách số

1. Gọi `/api/v1/spam-numbers?page=1&limit=100`.
2. Lưu hoặc cập nhật từng `phoneNumber` theo khóa E.164.
3. Tăng `page` thêm 1 và lặp cho đến khi `page > totalPages`.
4. Dùng `minComplaints` hoặc `from` nếu hệ thống đích cần ngưỡng/range riêng.

### QA: kiểm thử nhanh

```powershell
$BASE = "http://127.0.0.1:3000"
curl.exe "$BASE/api/v1/complaints?phone=2025550111"
curl.exe "$BASE/api/v1/search?phone=01234"
curl.exe "$BASE/api/v1/spam-numbers?page=1&limit=10"
curl.exe "$BASE/api/v1/search?phone=12"
```

## 7. Chất lượng và nguồn dữ liệu

- Dữ liệu từ FTC Do Not Call / robocall complaints, do người dùng báo cáo và không phải từng report đều được FTC xác minh.
- Complaint có cùng `ftcComplaintId` được upsert, không tạo duplicate khi source sync lại.
- Số điện thoại không hợp lệ hoặc complaint không có ngày hợp lệ sẽ không được lưu.
- Xem [BACKFILL.md](BACKFILL.md) để nạp dữ liệu FTC lịch sử trước khi vận hành scheduler hằng ngày.

## 8. Postman

Import [Collection](../postman/soosky-bot-spam-call.postman_collection.json) và [Local environment](../postman/soosky-bot-spam-call.local.postman_environment.json) vào Postman. Để test production, duplicate environment và đổi `baseUrl` thành `https://project5.vuonghieu.site`.
