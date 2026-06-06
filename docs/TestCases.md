# Test Cases — BurgerPrintsAgent (BP1)

> Bộ test cases được thiết kế để Agent tự động test và giám khảo dùng test trực tiếp.
> Mỗi test case có: Input → Expected Tool Call → Expected Response Format → Pass Criteria.

---

## Cách chạy test (Agent-automated)

Agent đọc file này và lần lượt gửi từng `input` vào chat, sau đó kiểm tra response theo `pass_criteria`.

```bash
# Chạy tự động (khi có test runner)
python test_runner.py --file Docs/TestCases.md --mode auto

# Chạy thủ công: copy từng INPUT vào chat và đánh giá output
```

---

## Nhóm A — Tìm kiếm sản phẩm (Search)

### TC-A01: Tìm T-shirt cho thị trường Mỹ, giá vốn < $8

```yaml
id: TC-A01
priority: P0 (CRITICAL)
language: Vietnamese
input: "Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8, ship dưới 5 ngày, chọn xưởng nào, SKU nào?"
expected_tools:
  - search_products(category="T-Shirt", market="US", max_base_cost=8, max_shipping_days=5)
expected_response:
  - Có bảng so sánh dạng markdown (| cột | cột |)
  - Hiển thị: tên sản phẩm, base cost, xưởng, thời gian ship US
  - Recommend ít nhất 1 sản phẩm cụ thể
  - Có gợi ý bước tiếp theo
pass_criteria:
  - ✅ Có bảng kết quả
  - ✅ Base cost của tất cả kết quả ≤ $8
  - ✅ Ship time ≤ 5 ngày hoặc note rõ nếu không có
  - ✅ Response bằng tiếng Việt
  - ✅ Không hallucinate sản phẩm không có trong API
fail_if:
  - ❌ Trả về kết quả hardcode không gọi API
  - ❌ Base cost > $8 trong kết quả
  - ❌ Response bằng tiếng Anh khi input tiếng Việt
```

---

### TC-A02: Tìm Hoodie cho EU

```yaml
id: TC-A02
priority: P0 (CRITICAL)
language: Vietnamese
input: "Tôi muốn mở rộng sang thị trường EU, cần tìm Hoodie, ngân sách giá vốn khoảng $15-20"
expected_tools:
  - search_products(category="Hoodie", market="EU", max_base_cost=20)
  - compare_factories(product_type="Hoodie", market="EU")
expected_response:
  - Danh sách Hoodie phù hợp với EU
  - Có thông tin ship EU
  - Có thông tin xưởng châu Âu nếu có
pass_criteria:
  - ✅ Lọc đúng category Hoodie
  - ✅ Chỉ show sản phẩm có ship EU
  - ✅ Base cost trong khoảng $15-20
```

---

### TC-A03: Tìm sản phẩm bằng tiếng Anh

```yaml
id: TC-A03
priority: P1 (HIGH)
language: English
input: "Find me a good mug for the US market, I want low base cost"
expected_tools:
  - search_products(category="Mug", market="US")
expected_response:
  - Response IN ENGLISH (matching input language)
  - Mug products listed with prices
pass_criteria:
  - ✅ Response bằng tiếng Anh
  - ✅ Chỉ hiện Mug category
  - ✅ Có base cost rõ ràng
```

---

### TC-A04: Tìm kiếm mơ hồ — Agent phải hỏi thêm

```yaml
id: TC-A04
priority: P1 (HIGH)
language: Vietnamese
input: "Tôi muốn bán áo"
expected_tools: []  # Không nên gọi tool ngay, phải hỏi thêm
expected_response:
  - Agent hỏi thêm thông tin: thị trường? loại áo? giá bán mục tiêu?
pass_criteria:
  - ✅ Agent hỏi ít nhất 2 câu làm rõ
  - ✅ Không trả về kết quả search khi chưa đủ thông tin
  - ✅ Câu hỏi thông minh, không generic
fail_if:
  - ❌ Agent search luôn mà không hỏi thêm
```

---

### TC-A05: Không tìm thấy kết quả — Graceful fallback

```yaml
id: TC-A05
priority: P1 (HIGH)
language: Vietnamese
input: "Tìm sản phẩm T-shirt cho thị trường Japan, giá vốn dưới $3"
expected_tools:
  - search_products(category="T-Shirt", market="Japan", max_base_cost=3)
expected_response:
  - Thông báo không tìm thấy kết quả phù hợp
  - Gợi ý nới lỏng điều kiện (tăng ngân sách hoặc thị trường khác)
  - Không crash hoặc trả về lỗi kỹ thuật
pass_criteria:
  - ✅ Xử lý gracefully khi không có kết quả
  - ✅ Có gợi ý thay thế hữu ích
  - ✅ Không hiện stack trace hay lỗi API
```

---

## Nhóm B — So sánh xưởng (Compare)

### TC-B01: So sánh xưởng Hoodie cho EU — Disambiguation (nhiều loại)

> **Lý do cập nhật:** BurgerPrints có nhiều loại Hoodie. Agent KHÔNG được gộp chung mà phải hỏi làm rõ trước.

```yaml
id: TC-B01
priority: P0 (CRITICAL)
language: Vietnamese
type: MULTI_TURN
turns:
  - turn: 1
    input: "So sánh giá Hoodie giữa các xưởng đang có, xưởng nào ship EU rẻ nhất?"
    expected_tools:
      - search_products(category="Hoodie", market="EU")
    expected_response:
      - Agent KHÔNG compare factory ngay
      - Agent liệt kê các loại Hoodie hiện có (Pullover, Zip-up, Crop, v.v.)
      - Bảng tóm tắt: Loại | Model phổ biến | Base Cost | Xưởng hỗ trợ EU
      - Agent hỏi: "Bạn muốn so sánh xưởng cho loại nào?"
    pass_criteria:
      - ✅ Có bước disambiguation (không skip thẳng vào factory compare)
      - ✅ Liệt kê đúng số loại Hoodie có sẵn từ API
      - ✅ Mỗi loại hiển thị base cost và factory hỗ trợ EU
      - ✅ Có câu hỏi follow-up rõ ràng
    fail_if:
      - ❌ Gộp tất cả Hoodie vào 1 bảng factory compare (sai vì khác sản phẩm)
      - ❌ Tự assume Pullover mà không hỏi

  - turn: 2
    input: "Pullover Hoodie thôi"
    expected_tools:
      - compare_factories(product_type="Pullover Hoodie", market="EU")
    expected_response:
      - Bảng so sánh factory CHỈ cho Pullover Hoodie
      - Columns: Xưởng | Vị trí | Base Cost | Ship EU Cost | Ship EU Time | Rating | Tổng CP
      - Highlight winner rẻ nhất, nhanh nhất
      - Gợi ý margin nếu bán ở giá nào đó
    pass_criteria:
      - ✅ Chỉ so sánh factory cho Pullover, không lẫn loại khác
      - ✅ Có cột "Tổng CP" = base + ship EU
      - ✅ Highlight ≥ 2 winner theo tiêu chí khác nhau (rẻ nhất vs nhanh nhất)
      - ✅ Có insight thực tế (không chỉ liệt kê số liệu)
```

---

### TC-B01b: Seller muốn so sánh TẤT CẢ loại Hoodie

```yaml
id: TC-B01b
priority: P1 (HIGH)
language: Vietnamese
input: "So sánh tất cả loại Hoodie cho EU, tôi muốn xem tổng quan"
expected_tools:
  - search_products(category="Hoodie", market="EU")
  - compare_factories() cho từng loại
expected_response:
  - Kết quả GROUPED theo từng loại (mỗi loại 1 section riêng)
  - Không gộp Pullover + Zip-up vào cùng 1 bảng
  - Cuối mỗi section: highlight xưởng tốt nhất
  - Summary cuối: overview recommendation
pass_criteria:
  - ✅ Tách biệt rõ từng loại Hoodie
  - ✅ Không so sánh chéo base cost giữa các loại khác nhau
  - ✅ Có summary tổng hợp ở cuối
  - ✅ Response không quá dài (biết cách tóm gọn khi có nhiều loại)

---

### TC-B02: So sánh xưởng theo nhiều tiêu chí

```yaml
id: TC-B02
priority: P1 (HIGH)
language: English
input: "Compare all factories for T-shirts shipping to US, I care about both speed and cost"
expected_tools:
  - compare_factories(product_type="T-Shirt", market="US")
expected_response:
  - Comparison table with: Factory, Location, Base Cost, Ship Cost, Ship Days, Rating
  - Analysis: best for speed, best for cost, best overall
pass_criteria:
  - ✅ Multi-criteria analysis (not just one winner)
  - ✅ Response in English
  - ✅ Clear recommendation with reasoning
```

---

### TC-B03: Hỏi về xưởng Việt Nam cụ thể

```yaml
id: TC-B03
priority: P2 (MEDIUM)
language: Vietnamese
input: "BurgerPrints có xưởng ở Việt Nam không? Ship Mỹ mất bao lâu?"
expected_tools:
  - get_factories(market="US")
expected_response:
  - Thông tin về xưởng VN (nếu có)
  - Thời gian và chi phí ship từ VN sang US
  - So sánh với xưởng US nếu có
pass_criteria:
  - ✅ Thông tin chính xác từ API
  - ✅ Rõ ràng về trade-off giữa xưởng VN và US
```

---

## Nhóm C — Tính margin (Margin Calculation)

### TC-C01: Tính margin với giá bán cho trước

```yaml
id: TC-C01
priority: P0 (CRITICAL)
language: Vietnamese
input: "Tôi định bán giá $24.99, margin tối thiểu 40%, gợi ý sản phẩm phù hợp"
expected_tools:
  - search_products(max_base_cost=14.99)  # $24.99 * 0.6 = $14.99
  - compare_factories()  # để lấy ship cost
expected_response:
  - Giải thích cách tính: margin = (sell - base - ship) / sell × 100%
  - Bảng sản phẩm đạt điều kiện với margin thực tế từng cái
  - Highlight sản phẩm có margin cao nhất
pass_criteria:
  - ✅ Công thức tính margin đúng
  - ✅ Chỉ hiện sản phẩm đạt ≥ 40%
  - ✅ Có breakdown chi tiết: base cost + ship cost + margin
  - ✅ Số liệu nhất quán (không mâu thuẫn)
```

---

### TC-C02: Margin tính ngược — từ target profit

```yaml
id: TC-C02
priority: P1 (HIGH)
language: Vietnamese
input: "Tôi muốn lời ít nhất $8 mỗi đơn T-shirt bán cho Mỹ, cần bán giá bao nhiêu?"
expected_tools:
  - search_products(category="T-Shirt", market="US")
  - compare_factories(product_type="T-Shirt", market="US")
expected_response:
  - Tính: min_sell_price = base_cost + ship_cost + $8
  - Gợi ý giá bán cho từng option
  - Nhận xét về competitive pricing
pass_criteria:
  - ✅ Tính đúng: sell = base + ship + profit_target
  - ✅ Có gợi ý giá bán cụ thể
  - ✅ Có context về giá thị trường (nếu biết)
```

---

### TC-C03: Kiểm tra margin âm — cảnh báo seller

```yaml
id: TC-C03
priority: P1 (HIGH)
language: Vietnamese
input: "Tôi bán Hoodie giá $15, margin có được 30% không?"
expected_response:
  - Tính toán và phát hiện margin âm hoặc quá thấp
  - Cảnh báo rõ ràng: không đạt mục tiêu
  - Gợi ý: cần bán giá bao nhiêu để đạt 30%
pass_criteria:
  - ✅ Phát hiện đúng margin không đạt
  - ✅ Cảnh báo thân thiện, không phán xét
  - ✅ Có gợi ý actionable
```

---

## Nhóm D — Chi tiết SKU

### TC-D01: Xem variants của sản phẩm

```yaml
id: TC-D01
priority: P1 (HIGH)
language: Vietnamese
input: "Cho tôi xem các màu sắc và size của T-shirt Gildan 64000"
expected_tools:
  - get_product_variants(product_id="prod_tshirt_001")
expected_response:
  - Danh sách SKU: size × màu × SKU code
  - Thông tin stock (available/out of stock)
  - Base cost theo từng variant nếu khác nhau
pass_criteria:
  - ✅ Có danh sách variant đầy đủ
  - ✅ Format rõ ràng, dễ đọc
  - ✅ Có SKU code để dùng khi đặt hàng
```

---

### TC-D02: Xem chi tiết sau khi tìm kiếm (Multi-turn)

```yaml
id: TC-D02
priority: P1 (HIGH)
language: Vietnamese
type: MULTI_TURN
turns:
  - turn: 1
    input: "Tìm T-shirt cho Mỹ giá vốn dưới $8"
    expected: Danh sách sản phẩm
  - turn: 2
    input: "Cái đầu tiên trong list đó, cho tôi xem detail hơn"
    expected:
      - Agent nhớ context từ turn 1
      - Gọi get_product_variants() cho sản phẩm đầu tiên
      - Không hỏi lại "bạn đang nói về sản phẩm nào?"
pass_criteria:
  - ✅ Agent có conversation memory
  - ✅ Resolve đúng "cái đầu tiên" = sản phẩm #1 từ turn trước
  - ✅ Không mất context giữa các lượt
```

---

## Nhóm E — Hội thoại phức tạp (Multi-turn & Edge Cases)

### TC-E01: Hội thoại 5 lượt liên tiếp

```yaml
id: TC-E01
priority: P0 (CRITICAL)
language: Mixed (VN → EN → VN)
type: MULTI_TURN
turns:
  - turn: 1
    input: "Tôi muốn bán gì đó cho thị trường Mỹ"
    expected: Agent hỏi thêm: loại sản phẩm? ngân sách?
  - turn: 2
    input: "T-shirt, budget khoảng $7 base cost"
    expected: Danh sách T-shirt US ≤ $7
  - turn: 3
    input: "What's the margin if I sell at $19.99?"
    expected: Agent switch sang English, tính margin cho từng option
  - turn: 4
    input: "Which factory is fastest for US delivery?"
    expected: Highlight factory nhanh nhất cho US
  - turn: 5
    input: "OK, show me color options for the best one"
    expected: get_product_variants() cho sản phẩm được chọn
pass_criteria:
  - ✅ Memory xuyên suốt 5 turns
  - ✅ Language switching tự nhiên (VN → EN)
  - ✅ Context "best one" được resolve đúng từ turn 4
  - ✅ Không lặp lại câu hỏi đã trả lời
```

---

### TC-E02: Câu hỏi ngoài phạm vi

```yaml
id: TC-E02
priority: P2 (MEDIUM)
language: Vietnamese
input: "Bạn có thể giúp tôi tạo design cho áo không?"
expected_response:
  - Agent lịch sự từ chối
  - Redirect về phạm vi: tìm sản phẩm, so sánh xưởng, tính margin
  - Offer help trong scope: "Tôi có thể giúp bạn tìm xưởng in phù hợp nhất!"
pass_criteria:
  - ✅ Không cố gắng trả lời ngoài scope
  - ✅ Tone thân thiện, không cứng nhắc
  - ✅ Có redirect về use case thật sự
```

---

### TC-E03: Câu hỏi về nhiều sản phẩm cùng lúc

```yaml
id: TC-E03
priority: P1 (HIGH)
language: Vietnamese
input: "So sánh T-shirt và Hoodie cho thị trường Mỹ, cái nào có margin tốt hơn nếu tôi bán giá $20?"
expected_tools:
  - search_products(category="T-Shirt", market="US")
  - search_products(category="Hoodie", market="US")
expected_response:
  - So sánh 2 category side by side
  - Tính margin cho cả 2 với giá $20
  - Recommendation có reasoning rõ ràng
pass_criteria:
  - ✅ Xử lý multi-intent trong 1 câu hỏi
  - ✅ Gọi đủ tools cần thiết
  - ✅ So sánh có cấu trúc, không lộn xộn
```

---

## Nhóm F — [BONUS] Tạo đơn hàng

### TC-F01: Tạo đơn hàng sau khi chọn xong

```yaml
id: TC-F01
priority: P2 (BONUS)
language: Vietnamese
type: MULTI_TURN
turns:
  - turn: 1
    input: "Tôi muốn đặt 50 cái T-shirt size M màu đen, Gildan 64000, ship về Hà Nội"
    expected:
      - Agent hiển thị order summary để xác nhận
      - Không tạo đơn ngay mà chờ confirm
  - turn: 2
    input: "Xác nhận"
    expected:
      - Gọi create_order()
      - Trả về order ID và estimated ship date
pass_criteria:
  - ✅ Có bước confirm trước khi tạo đơn
  - ✅ Order summary đầy đủ thông tin
  - ✅ Trả về order ID sau khi tạo thành công
  - ✅ Xử lý lỗi nếu API tạo đơn thất bại
```

---

### TC-F02: Hủy tạo đơn ở bước confirm

```yaml
id: TC-F02
priority: P2 (BONUS)
language: Vietnamese
type: MULTI_TURN
turns:
  - turn: 1
    input: "Đặt 10 cái size L màu trắng"
    expected: Order summary + yêu cầu xác nhận
  - turn: 2
    input: "Thôi không đặt nữa"
    expected:
      - Không gọi create_order()
      - Agent xác nhận đã hủy
      - Offer help tiếp theo
pass_criteria:
  - ✅ Không tạo đơn khi user không xác nhận
  - ✅ Xử lý "cancel" intent đúng
```

---

## Nhóm G — Performance & UX

### TC-G01: Thời gian phản hồi

```yaml
id: TC-G01
priority: P1 (HIGH)
type: PERFORMANCE
input: "Tìm T-shirt cho Mỹ"
expected_response_time: "< 5 giây (production), < 10 giây (mock mode)"
pass_criteria:
  - ✅ Response trả về trong < 5s
  - ✅ Có typing indicator trong lúc chờ
```

---

### TC-G02: Response format nhất quán

```yaml
id: TC-G02
priority: P1 (HIGH)
type: FORMAT_CHECK
checks:
  - Bảng markdown render đúng trong chat UI
  - Emoji được dùng nhất quán (✅ ❌ ⚡ 💡)
  - Số tiền luôn có đơn vị ($)
  - Thời gian ship rõ ràng (X-Y ngày, không chỉ "nhanh")
  - Tên xưởng nhất quán giữa các câu trả lời
pass_criteria:
  - ✅ Không có markdown raw text hiện trong UI
  - ✅ Số liệu format nhất quán
```

---

### TC-G03: Bilingual consistency

```yaml
id: TC-G03
priority: P1 (HIGH)
type: LANGUAGE
test_cases:
  - input_lang: Vietnamese → response_lang: Vietnamese ✅
  - input_lang: English → response_lang: English ✅
  - input_lang: Mixed → response_lang: Match dominant language ✅
pass_criteria:
  - ✅ Không trả lời Anh khi user hỏi Việt
  - ✅ Không trả lời Việt khi user hỏi Anh
  - ✅ Technical terms (SKU, base cost, margin) giữ nguyên tiếng Anh
```

---

## Scoring Matrix (Giám khảo)

| Nhóm | Test | Trọng số | Điểm tối đa |
|------|------|----------|-------------|
| A — Search | TC-A01, A02, A03, A04, A05 | 25% | 25 |
| B — Compare | TC-B01, B02, B03 | 20% | 20 |
| C — Margin | TC-C01, C02, C03 | 20% | 20 |
| D — SKU | TC-D01, D02 | 10% | 10 |
| E — Multi-turn | TC-E01, E02, E03 | 15% | 15 |
| F — Bonus Order | TC-F01, F02 | 5% | 5 |
| G — UX/Perf | TC-G01, G02, G03 | 5% | 5 |
| **Total** | | **100%** | **100** |

---

## Checklist trước khi demo

- [ ] Chạy tất cả P0 test cases → Pass 100%
- [ ] Chạy tất cả P1 test cases → Pass ≥ 80%
- [ ] Multi-turn TC-E01 (5 lượt) chạy mượt không lỗi
- [ ] Thời gian phản hồi < 5 giây mỗi câu
- [ ] UI hiển thị bảng markdown đúng
- [ ] Không có API key nào hardcode trong code
- [ ] README setup guide test ≤ 10 phút
