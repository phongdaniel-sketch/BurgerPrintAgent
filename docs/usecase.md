User Flow & Use Cases — BurgerPrintsAgent (BP1)

Personas

Alex — Newbie Seller: Mới bắt đầu POD, chưa hiểu về xưởng và SKU
Mai — Experienced Seller: Đã bán Etsy 2 năm, muốn mở rộng sang EU
Tom — Data-driven Seller: Tư duy số liệu, luôn tính margin trước khi chọn sản phẩm

User Flow Tổng quan




Use Cases

3.1. UC-01: Tìm sản phẩm theo thị trường và giá

**Actor:** Alex (Newbie Seller)
**Trigger:** Muốn bán T-shirt cho thị trường Mỹ với giá vốn thấp
**Precondition:** Chưa biết xưởng nào phù hợp

**Main Flow:**
1. Seller nhập: "Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8, thời gian ship dưới 5 ngày"
2. Agent gọi `search_products(category="T-Shirt", market="US", max_base_cost=8, shipping time=US)`
3. Agent nhận danh sách sản phẩm từ API
4. Agent trả về bảng so sánh: tên sản phẩm, SKU, base cost, thời gian ship
5. Agent gợi ý bước tiếp: *"Bạn muốn xem chi tiết SKU của sản phẩm nào không?"*
6. Agent phản hồi chi tiết SKU:  xưởng, số màu, số size
**Alternative Flow:**
- Nếu không có sản phẩm nào khớp → Agent nới lỏng filter và thông báo kết quả không tìm thấy và gợi ý sản phẩm gần nhất
- Nếu seller hỏi thêm về ship time → Agent gọi thêm `Shipping Policy`
- Nếu seller hỏi về Cost → Agent gọi thêm Product detail

**Expected Output:**
```
Tôi tìm thấy X sản phẩm T-Shirt cho thị trường US với giá dưới $8:

| # | Sản phẩm | Base Cost | Xưởng | Ship US | Màu |
|---|---------|-----------|-------|---------|-----|
| 1 | Gildan 64000 | $6.50 | Factory A | 2-3 ngày | 64 |
| 2 | ... | ... | ... | ... | ... |

👉 Bạn muốn xem chi tiết SKU hoặc so sánh giá bán các xưởng không?

3.2. UC-02: So sánh xưởng theo thị trường

**Actor:** Mai (Experienced Seller)
**Trigger:** Muốn mở rộng bán Hoodie sang EU, cần biết xưởng nào rẻ nhất
**Precondition:** Đã quen với BurgerPrints

**Main Flow:**
1. Seller nhập: *"So sánh giá Hoodie giữa các xưởng, xưởng nào ship EU rẻ nhất?"*
2. Agent gọi `compare_factories(product_type="Hoodie", market="EU")`
3. Agent trả về bảng so sánh: xưởng, vị trí, base cost, ship cost EU, ship time EU
4. Agent highlight xưởng tốt nhất theo từng tiêu chí
5. Agent hỏi thêm: *"Bạn muốn xem margin nếu bán với giá bao nhiêu?"*

**Expected Output:**
```
So sánh các xưởng fulfillment Hoodie cho thị trường EU:

| Xưởng | Vị trí | Base Cost | Ship EU | Thời gian | Rating |
|-------|--------|-----------|---------|-----------|--------|
| Factory C | Netherlands | $14.80 | $5.50 | 3-5 ngày | ⭐ 4.7 |
| Factory A | US | $14.80 | $8.99 | 7-9 ngày | ⭐ 4.8 |
| Factory B | Vietnam | $13.50 | $7.50 | 12-15 ngày | ⭐ 4.5 |

✅ Factory C tốt nhất cho EU: ship rẻ nhất ($5.50) và nhanh nhất (3-5 ngày).
⚡ Factory A có rating cao nhất nếu chất lượng là ưu tiên.
```

3.3. UC-03: Tính margin và gợi ý sản phẩm

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
Gross Margin = (Sell Price - Base Cost - Avg Shipping) / Sell Price × 100%

**Expected Output:**

Với giá bán $24.99 và margin tối thiểu 40%:
→ Chi phí tối đa cho phép: ~$15.00 (base + ship)

Sản phẩm đạt điều kiện:

| Sản phẩm | Base | Ship US | Tổng CP | Margin | Xưởng |
|---------|------|---------|---------|--------|-------|
| Gildan 64000 T-Shirt | $6.50 | $3.99 | $10.49 | **58%** ✅ | Factory A |
| Bella+Canvas 3001 | $7.90 | $3.99 | $11.89 | **52%** ✅ | Factory A |
| Gildan Hoodie 18500 | $14.80 | $3.99 | $18.79 | ❌ -24% | - |

💡 T-Shirt là lựa chọn tốt nhất với margin ~52-58%.

3.4. UC-04: Xem chi tiết SKU

**Actor:** Alex / Mai
**Trigger:** Muốn biết màu sắc, size có sẵn của một sản phẩm cụ thể

**Main Flow:**
1. Seller nhập: *"Cho tôi xem các màu và size có sẵn của sản phẩm Gildan 64000"*
2. Agent gọi `get_product_variants(product_id="prod_tshirt_001")`
3. Agent hiển thị danh sách SKU có sẵn
4. Agent gợi ý hành động tiếp theo xem seller có muốn đặt hàng không

---

3.5. UC-05: Hội thoại nhiều lượt (Multi-turn)

**Actor:** Bất kỳ
**Trigger:** Seller muốn thu hẹp dần kết quả qua nhiều câu hỏi liên tiếp

**Flow:**
Seller: "Tôi muốn bán áo ở Mỹ"
Agent:  → search_products(market="US") → [các loại sản phẩm]

Seller: "Chỉ T-shirt thôi, giá vốn dưới $8"
Agent:  → search_products(category="T-Shirt", market="US", max_base_cost=8) → [3 sản phẩm]

Seller: "Cái nào ship nhanh nhất?"
Agent:  → Dùng kết quả trước + sort by shipping_days → [highlight 1 sản phẩm]

Seller: "OK cho tôi xem màu sắc của cái đó"
Agent:  → get_product_variants(product_id="...") → [danh sách SKU]

Seller: "Đặt 50 cái size M màu đen"  [BONUS]
Agent:  → Xác nhận thông tin → create_order(...)


3.6. UC-06: [BONUS] Tạo đơn hàng (Optional)

**Actor:** Seller đã chọn được sản phẩm
**Trigger:** Seller muốn tạo đơn fulfillment ngay trong chat

**Main Flow:**
1. Seller: *"OK tôi muốn đặt 100 cái SKU TSH-M-BLK, ship về địa chỉ này: ..."*
2. Agent hiển thị order summary để xác nhận
3. Seller: *"Xác nhận"*
4. Agent gọi `create_order({sku: ..., qty: ..., shipping_address: ...})`
5. Agent trả về order ID + estimated ship date

---

## User Cases ngoài cần xử lý
Câu hỏi mơ hồ ("tôi muốn bán áo")
- Agent hỏi thêm: thị trường? loại áo? giá? 
Không tìm thấy kết quả:  
- Agent nới filter, gợi ý thay thế
Seller hỏi bằng tiếng Anh(hoặc ngôn ngữ khác): 
Agent tự phản hồi bằng ngôn ngữ đó
Câu hỏi ngoài phạm vi tìm kiếm hoặc hiểu biết về BurgerPrint
Agent lịch sự redirect về POD catalog
Giá bán quá thấp (margin âm)
Agent cảnh báo và gợi ý điều chỉnh
Factory không ship đến market nào đó ví dụ bán ở Ukraina
Agent thông báo nền tảng chưa hỗ trợ market đó
