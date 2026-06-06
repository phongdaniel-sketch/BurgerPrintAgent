# User Flow & Use Cases — BurgerPrintsAgent (BP1)

## Personas

| Persona | Mô tả | Mức độ kỹ thuật |
|---------|-------|-----------------|
| **Alex — Newbie Seller** | Mới bắt đầu POD, chưa hiểu về xưởng và SKU | Thấp |
| **Mai — Experienced Seller** | Đã bán Etsy 2 năm, muốn mở rộng sang EU | Trung bình-cao |
| **Tom — Data-driven Seller** | Tư duy số liệu, luôn tính margin trước khi chọn | Cao |

---

## User Flow Tổng quan

```
[Seller truy cập Chat UI]
          │
          ▼
[Nhập câu hỏi bằng VN hoặc EN]
          │
          ▼
[Agent phân tích intent → chọn Tool]
          │
     ┌────┴────────────────────────┐
     ▼                             ▼
[Tool: search_products]    [Tool: compare_factories]
[Tool: get_variants]       [Tool: calculate_margin]
[Tool: create_order]
     │                             │
     └────────────┬────────────────┘
                  ▼
     [Agent tổng hợp → Response có cấu trúc]
                  │
                  ▼
     [Seller đọc, hỏi tiếp → Multi-turn]
                  │
                  ▼
     [Seller xác nhận → Tạo đơn hàng (Bonus)]
```

---

## Use Cases

### UC-01: Tìm sản phẩm theo thị trường và giá

**Actor:** Alex (Newbie Seller)
**Trigger:** Muốn bán T-shirt cho thị trường Mỹ với giá vốn thấp
**Precondition:** Chưa biết xưởng nào phù hợp

**Main Flow:**
1. Seller nhập: *"Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8"*
2. Agent gọi `search_products(category="T-Shirt", market="US", max_base_cost=8)`
3. Agent nhận danh sách sản phẩm từ API
4. Agent trả về bảng so sánh: tên sản phẩm, base cost, xưởng, số màu, thời gian ship
5. Agent gợi ý bước tiếp: *"Bạn muốn xem chi tiết SKU của sản phẩm nào không?"*

**Alternative Flow:**
- Nếu không có sản phẩm nào khớp → Agent nới lỏng filter và thông báo
- Nếu seller hỏi thêm về ship time → Agent gọi thêm `compare_factories`

**Expected Output:**
```
Tôi tìm thấy X sản phẩm T-Shirt cho thị trường US với giá dưới $8:

| # | Sản phẩm | Base Cost | Xưởng | Ship US | Màu |
|---|---------|-----------|-------|---------|-----|
| 1 | Gildan 64000 | $6.50 | Factory A | 2-3 ngày | 64 |
| 2 | ... | ... | ... | ... | ... |

👉 Bạn muốn xem chi tiết SKU hoặc so sánh xưởng không?
```

---

### UC-02: So sánh xưởng theo thị trường

**Actor:** Mai (Experienced Seller)
**Trigger:** Muốn mở rộng bán Hoodie sang EU, cần biết xưởng nào rẻ nhất
**Precondition:** Đã quen với BurgerPrints

> ⚠️ **Design note:** BurgerPrints có nhiều loại Hoodie (Pullover, Zip-up, Crop, Kids, v.v.) với base cost và xưởng hỗ trợ khác nhau. Agent KHÔNG được assume "Hoodie" = 1 sản phẩm. Phải có bước **disambiguation** trước khi so sánh factory.

**Main Flow (2 bước):**

**Bước 1 — Disambiguation (Làm rõ loại Hoodie)**
1. Seller nhập: *"So sánh giá Hoodie giữa các xưởng, xưởng nào ship EU rẻ nhất?"*
2. Agent gọi `search_products(category="Hoodie", market="EU")` để lấy danh sách các loại
3. Agent nhận về N loại Hoodie khác nhau → **hiển thị tóm tắt các loại** và hỏi làm rõ
4. Seller chọn loại cụ thể (hoặc Agent tự chọn loại phổ biến nhất nếu seller nói "tất cả")

**Bước 2 — So sánh Factory theo loại đã chọn**
5. Agent gọi `compare_factories(product_type="<loại đã chọn>", market="EU")`
6. Agent trả về bảng so sánh factory cho đúng loại hoodie đó
7. Agent highlight winner theo từng tiêu chí: rẻ nhất, nhanh nhất, chất lượng nhất
8. Agent hỏi thêm: *"Bạn muốn tính margin nếu bán giá bao nhiêu?"*

**Alternative Flow — Seller muốn so sánh tất cả loại Hoodie:**
- Agent group kết quả theo loại sản phẩm, mỗi loại 1 section
- Không gộp chung vào 1 bảng → tránh so sánh sai (Pullover vs Zip-up là 2 sản phẩm khác nhau)

**Expected Output — Bước 1 (Disambiguation):**
```
BurgerPrints có 4 loại Hoodie cho thị trường EU:

| # | Loại | Model phổ biến | Base Cost | Xưởng hỗ trợ EU |
|---|------|---------------|-----------|------------------|
| 1 | Pullover Hoodie | Gildan 18500 | $14.80 | Factory A, C |
| 2 | Zip-Up Hoodie | Gildan 18600 | $17.50 | Factory A |
| 3 | Crop Hoodie | Bella+Canvas 7502 | $19.90 | Factory C |
| 4 | Lightweight Hoodie | Next Level 9301 | $16.20 | Factory A, C |

👉 Bạn muốn so sánh xưởng cho loại nào? Hoặc tôi có thể so sánh tất cả nếu bạn muốn xem tổng quan.
```

**Expected Output — Bước 2 (Factory comparison cho Pullover Hoodie):**
```
So sánh xưởng fulfillment cho Pullover Hoodie (EU):

| Xưởng | Vị trí | Base Cost | Ship EU Cost | Ship EU Time | Rating | Tổng CP |
|-------|--------|-----------|-------------|--------------|--------|--------|
| Factory C | Netherlands | $14.80 | $5.50 | 3-5 ngày | ⭐ 4.7 | **$20.30** |
| Factory A | US | $14.80 | $8.99 | 7-9 ngày | ⭐ 4.8 | $23.79 |

✅ **Factory C** — Tốt nhất cho EU: ship rẻ nhất ($5.50) và nhanh nhất (3-5 ngày).
⭐ **Factory A** — Rating cao hơn, nhưng chi phí cao hơn $3.49/đơn và mất thêm 4-4 ngày.

💡 Với Factory C: nếu bán $39.99 → margin ≈ 49%. Bạn muốn tính chi tiết không?
```

---

### UC-03: Tính margin và gợi ý sản phẩm

**Actor:** Tom (Data-driven Seller)
**Trigger:** Có giá bán mục tiêu, muốn tìm sản phẩm đạt margin tối thiểu
**Precondition:** Biết giá bán và yêu cầu margin

**Main Flow:**
1. Seller nhập: *"Tôi định bán giá $24.99, margin tối thiểu 40%, gợi ý sản phẩm phù hợp"*
2. Agent tính: max_base_cost = $24.99 × (1 - 0.40) = $14.99 (chưa tính ship)
3. Agent gọi `search_products(max_base_cost=14.99)` + `compare_factories()`
4. Agent tính margin thực tế cho từng sản phẩm × xưởng
5. Agent trả về danh sách đạt điều kiện, sắp xếp theo margin cao nhất

**Margin Calculation Logic:**
```
Gross Margin = (Sell Price - Base Cost - Avg Shipping) / Sell Price × 100%
```

**Expected Output:**
```
Với giá bán $24.99 và margin tối thiểu 40%:
→ Chi phí tối đa cho phép: ~$15.00 (base + ship)

Sản phẩm đạt điều kiện:

| Sản phẩm | Base | Ship US | Tổng CP | Margin | Xưởng |
|---------|------|---------|---------|--------|-------|
| Gildan 64000 T-Shirt | $6.50 | $3.99 | $10.49 | **58%** ✅ | Factory A |
| Bella+Canvas 3001 | $7.90 | $3.99 | $11.89 | **52%** ✅ | Factory A |
| Gildan Hoodie 18500 | $14.80 | $3.99 | $18.79 | ❌ -24% | - |

💡 T-Shirt là lựa chọn tốt nhất với margin ~52-58%.
```

---

### UC-04: Xem chi tiết SKU

**Actor:** Alex / Mai
**Trigger:** Muốn biết màu sắc, size có sẵn của một sản phẩm cụ thể

**Main Flow:**
1. Seller nhập: *"Cho tôi xem các màu và size có sẵn của sản phẩm Gildan 64000"*
2. Agent gọi `get_product_variants(product_id="prod_tshirt_001")`
3. Agent hiển thị danh sách SKU có sẵn
4. Agent gợi ý hành động tiếp theo

---

### UC-05: Hội thoại nhiều lượt (Multi-turn)

**Actor:** Bất kỳ
**Trigger:** Seller muốn thu hẹp dần kết quả qua nhiều câu hỏi liên tiếp

**Flow:**
```
Seller: "Tôi muốn bán áo cho Mỹ"
Agent:  → search_products(market="US") → [10 sản phẩm]

Seller: "Chỉ T-shirt thôi, giá vốn dưới $8"
Agent:  → search_products(category="T-Shirt", market="US", max_base_cost=8) → [3 sản phẩm]

Seller: "Cái nào ship nhanh nhất?"
Agent:  → Dùng kết quả trước + sort by shipping_days → [highlight 1 sản phẩm]

Seller: "OK cho tôi xem màu sắc của cái đó"
Agent:  → get_product_variants(product_id="...") → [danh sách SKU]

Seller: "Đặt 50 cái size M màu đen"  [BONUS]
Agent:  → Xác nhận thông tin → create_order(...)
```

---

### UC-06: [BONUS] Tạo đơn hàng

**Actor:** Seller đã chọn được sản phẩm
**Trigger:** Seller muốn tạo đơn fulfillment ngay trong chat

**Main Flow:**
1. Seller: *"OK tôi muốn đặt 100 cái SKU TSH-M-BLK, ship về địa chỉ này: ..."*
2. Agent hiển thị order summary để xác nhận
3. Seller: *"Xác nhận"*
4. Agent gọi `create_order({sku: ..., qty: ..., shipping_address: ...})`
5. Agent trả về order ID + estimated ship date

---

## Edge Cases cần xử lý

| Tình huống | Xử lý |
|-----------|-------|
| Câu hỏi mơ hồ ("tôi muốn bán áo") | Agent hỏi thêm: thị trường? loại áo? giá? |
| **Category có nhiều sub-type (nhiều loại Hoodie)** | **Bước 1: search + list sub-types → hỏi làm rõ. Bước 2: mới compare factory** |
| Seller nói "tất cả loại" | Agent group kết quả theo sub-type, mỗi loại 1 section riêng |
| Không tìm thấy kết quả | Agent nới filter, gợi ý thay thế |
| Seller hỏi bằng tiếng Anh | Agent tự phản hồi bằng tiếng Anh |
| Câu hỏi ngoài phạm vi | Agent lịch sự redirect về POD catalog |
| Giá bán quá thấp (margin âm) | Agent cảnh báo và gợi ý điều chỉnh |
| Factory không ship đến market | Agent loại bỏ và thông báo |
| Chỉ 1 factory hỗ trợ loại sản phẩm | Agent thông báo không có sự lựa chọn, giải thích lý do |
