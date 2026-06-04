# BurgerPrints API v2 — Spec

> Nguồn: https://api-docs.burgerprints.com/ (Postman Documenter).
> Tài liệu này phục vụ đề tài **BP1 — BurgerPrintsAgent** ([detai.md](detai.md)).
> Trích xuất ngày 2026-06-04. Các response dưới đây là **ví dụ** từ collection chính thức.

## 1. Thông tin chung

| Mục | Giá trị |
|-----|---------|
| **Base URL** | `https://api.burgerprints.com` |
| **Chuẩn** | RESTful, request `GET`/`POST`/`PUT`/`DELETE`, response luôn là JSON |
| **HTTPS** | Bắt buộc |
| **Số endpoint** | 14 |

### Authentication
- Cơ chế: **API Key truyền qua HTTP header `api-key`**.
  ```
  api-key: <your-private-api-key>
  ```
- Lấy key: đăng nhập → **Fulfillment store → Fulfillment store settings → API Keys**.
- Kiểm tra key hợp lệ bằng `GET /v2/authenticated`.
- ⚠️ Không commit API key lên repo (yêu cầu bắt buộc của đề tài).

### Quy ước response
- Đa số endpoint bọc trong `{ "code": 200, "message": "success", "data": {...} }`.
- Endpoint danh sách có phân trang: `data.total`, `data.page`, `data.pageSize`, `data.result[]`.

---

## 2. Danh sách endpoint

| # | Nhóm | Method | Path |
|---|------|--------|------|
| 1 | Auth | GET | `/v2/authenticated` |
| 2 | Product | GET | `/v2/product` |
| 3 | Product | GET | `/v2/product/{id}` |
| 4 | Product | GET | `/v2/product/outofstock` |
| 5 | Orders | GET | `/v2/order` |
| 6 | Orders | GET | `/v2/order/{id}` |
| 7 | Orders | POST | `/v2/order` |
| 8 | Orders | POST | `/v2/order/charge` |
| 9 | Orders | GET | `/v2/order/{id}/tracking` |
| 10 | Orders | PUT | `/v2/order/{id}/cancel` |
| 11 | Orders | DELETE | `/v2/order/{id}` |
| 12 | Balance | GET | `/v2/balance` |
| 13 | Webhook | POST | `/notification/api/v1/public/fulfillment/notify/webhook` |
| 14 | Webhook | POST | `https://dash.burgerprints.com/notification/api/v1/public/fulfillment/notify/webhook` |

---

## 3. Authentication

### `GET /v2/authenticated` — Kiểm tra API key
**Response 200**
```json
{
  "code": 200,
  "message": "success",
  "data": { "is_success": true, "message": "The API key is valid." }
}
```

---

## 4. Product (Catalog) — nguồn dữ liệu so sánh chính

### `GET /v2/product` — Danh sách base products
- Phân trang: `data.total = 297`, `page`, `pageSize` (mặc định 10).

**Response 200 (rút gọn)**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 297,
    "page": 1,
    "pageSize": 10,
    "result": [
      {
        "short_code": "USG5000",
        "name": "Unisex T-Shirt | Gildan 5000",
        "html_desc": "<p>- Material: 100% cotton ... - Printing technique: DTG - Location: United States ... - Processing Time: 1-5 business days ...</p>",
        "desc": "Budget friendly",
        "url": "https://.../base-mockups/autods/USG5000.jpg",
        "design_type": "auto",
        "design_url": null
      }
    ]
  }
}
```
> `html_desc` chứa (dạng HTML, cần parse): **Material, Printing technique (DTG/DTF), Location, Processing Time**.

### `GET /v2/product/{id}` — Chi tiết 1 base + toàn bộ variants
`{id}` = `short_code` (vd `USG5000`).

**Cấu trúc `data`:**
| Field | Mô tả |
|-------|-------|
| `short_code`, `catalog_id`, `name`, `display_name` | Định danh base |
| `html_desc` | Mô tả chi tiết (HTML) |
| `available_sizes[]` | `{ id, name }` — vd `{"name":"5XL"}` |
| `available_colors[]` | `{ id, name, color_hex }` — vd `{"name":"White","color_hex":"#ffffff"}` |
| `variations[]` | **Mảng SKU** (xem dưới) — có thể rất lớn (vd Gildan 5000 ≈ 2.450 phần tử) |
| `design_type`, `design_url`, `resolution`, `resolution_default`, `url`, `print_area` | Thông số thiết kế/in |

**Một phần tử `variations[]` (CỐT LÕI để so sánh giá/xưởng):**
```json
{
  "sku": "USBG5000DTF-Black-S",
  "size_id": "2JmSZ4DS0C8DrrpV",
  "size": "S",
  "color_id": "n4G8MnSzfSmkMyxr",
  "color": "Black",
  "color_hex": "#25282A",
  "price": "5.39",          // base cost / sản phẩm đầu tiên
  "2nd_price": "3.5",       // giá từ sản phẩm thứ 2 trở đi (cùng đơn)
  "addition_price": null,   // phụ phí (vd in 2 mặt)
  "partner_id": "gVsuUHxzBtX1yI7Q",
  "partner_name": "Blanca"  // = XƯỞNG/fulfillment partner
}
```

### `GET /v2/product/outofstock` — SKU hết hàng
Phân trang (`total = 80`). Mỗi mục:
```json
{
  "shortCode": "EUBC3001",
  "shortCodeName": "Unisex T-Shirt | 3001 Bella + Canvas (EU)",
  "sku": ["EUXBC3001-Maroon-2XL"]
}
```

---

## 5. Orders

### `GET /v2/order` — Danh sách đơn
**Response 200 (rút gọn)** — lưu ý `shipping_fee`, `amount`, `sub_amount` xuất hiện ở cấp đơn:
```json
{
  "total": 334,
  "data": [
    {
      "id": "A30558-CT-3808777",
      "store_id": "KBswl2o1xJYh66UO",
      "store_name": "storff",
      "amount": "15.49",
      "sub_amount": "7.50",
      "shipping_fee": "7.99",
      "shipping_method": "standard",
      "reference_order": "check 2407-04",
      "created_date": "20240724T115004Z",
      "shipping": {
        "name": "David Thomas", "email": "...", "phone": "...",
        "address": { "line1": "...", "city": "...", "state": "AK", "postal_code": "...", "country": "US" }
      },
      "items": [
        { "catalog_sku": "", "size_name": "S", "quantity": "1",
          "amount": "15.49", "shipping_fee": "7.99",
          "tax_amount": "0.00", "tax_rate": "0.00" }
      ]
    }
  ]
}
```

### `GET /v2/order/{id}` — Chi tiết 1 đơn
Trả về `data` với: `state` (`queued`/...), `fulfillment` (`Unfulfilled`/...), `currency`, `shipping_method`, khối `seller` (`amount`, `shipping_fee`, `discount_amount`, `tax_amount`, `payment_processing_fee`), `shipping{address}`, và `items[]` (mỗi item có `name`, `product_id`, `confirmed`, ...).

### `POST /v2/order` — Tạo đơn ⭐ (bonus đề tài)
**Headers:** `api-key`, `Content-Type: application/json`
**Body:**
```json
{
  "shipping_name": "james bond",
  "shipping_address1": "1598 Junior Avenue",
  "shipping_address2": "Homer",
  "shipping_city": "Atlanta",
  "shipping_state": "AZ",
  "shipping_zip": "30318",
  "shipping_country": "US",
  "shipping_email": "abc@gmail.com",
  "shipping_phone": "34",
  "reference_order_id": "2343435456vege",
  "shipping_label": "https://.../label.pdf",
  "items": [
    {
      "catalog_sku": "USG5000-Red-S",
      "design_url_front": "https://.../design_front.jpg",
      "mockup_url_front": "https://.../mockup_front.jpg",
      "design_url_back": "https://.../design_back.jpg",
      "mockup_url_back": "https://.../mockup_back.jpg",
      "quantity": 3
    }
  ],
  "sandbox": false
}
```
> `sandbox: true` để test tạo đơn mà không phát sinh thật → rất hợp cho demo/giám khảo.

**Response 200**
```json
{ "is_success": true, "message": "Order was added successfully", "order_id": "A33378-CT-3781211", "errors": [] }
```

### `POST /v2/order/charge` — Thanh toán đơn (trừ balance)
**Body:** `{ "order_ids": ["A28756-CT-3161831"] }`
**Response 200**
```json
{ "state": "purchased", "reason": { "code": 200, "message": "Success", "method": "balance" }, "balance": null }
```

### `GET /v2/order/{id}/tracking` — Tracking đơn

### `PUT /v2/order/{id}/cancel` — Hủy đơn
```json
{ "code": 200, "message": "OK", "data": { "is_success": true, "message": "Order cancellation request was created successfully!" } }
```

### `DELETE /v2/order/{id}` — Xóa đơn
```json
{ "is_success": true, "message": "Order deleted successfully" }
```

---

## 6. Balance

### `GET /v2/balance` — Số dư ví fulfillment

---

## 7. Webhook (Fulfillment notify)

### `POST /v2/.../notify/webhook` (và biến thể `dash.burgerprints.com`)
**Headers:** `api-key`, `Content-Type: application/json`
**Body:**
```json
{ "end_point_url": "https://webhook.site/...", "is_active": false }
```
**Response:** `Create notify webhook success`

---

## 8. Mapping với yêu cầu đề tài & khoảng trống dữ liệu

| Yêu cầu trong [detai.md](detai.md) | API hỗ trợ | Nguồn |
|---|---|---|
| So sánh giá / xưởng / SKU / size / màu | ✅ | `variations[]` (`price`, `partner_name`) |
| Chất liệu, kỹ thuật in, location, thời gian xử lý | 🟡 (cần parse HTML) | `html_desc` |
| Tính margin (giá bán vs base cost) | ✅ | `variations[].price` + `2nd_price` |
| **Phí ship theo điểm đến / "ship EU rẻ nhất"** | ⚠️ Không có endpoint tra cước | `shipping_fee` chỉ có **sau khi** tạo đơn (`/v2/order`); workaround: tạo đơn `sandbox` để đọc |
| **Thuế** | 🟡 Chỉ thấy ở cấp đơn (`tax_amount`, `tax_rate`) | `/v2/order/{id}` |
| Tạo đơn tự động (bonus) | ✅ | `POST /v2/order` (+ `sandbox`) → `POST /v2/order/charge` |

### Ghi chú triển khai cho agent
- Catalog: 297 base × hàng nghìn `variations` → **phân trang** `GET /v2/product?page=&pageSize=` rồi `GET /v2/product/{id}` lấy variant; nên **cache in-memory lúc runtime** (vẫn gọi API live, không hard-code/cào).
- `html_desc` là HTML → strip tag để rút Material / Printing technique / Location / Processing Time.
- Câu hỏi về **phí ship/thời gian giao theo nước** là điểm yếu dữ liệu: dựa vào `Location` + `Processing Time` trong `html_desc`, hoặc tạo draft order `sandbox` để đọc `shipping_fee`.
