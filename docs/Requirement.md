BP1 - BurgerPrintsAgent (POD Catalog Assistant)
Tóm tắt dự án bằng 1 câu: Từ hàng trăm xưởng đến một SKU hoàn hảo, để AI agent của bạn làm phần nặng nhọc.
Vấn đề
BurgerPrints có hàng trăm sản phẩm × nhiều xưởng × hàng nghìn SKUs (size × màu × chất liệu × kỹ thuật in × giá base × phí ship × thuế). Sellers mới mất nhiều giờ để tìm tổ hợp fulfillment phù hợp.
Đối tượng người dùng
Sellers POD trên BurgerPrints (mới và có kinh nghiệm) đang bán cross-border trên Etsy / Amazon / TikTok Shop / Shopify, cần ra quyết định fulfillment nhanh.
Nhiệm vụ
Xây dựng AI chatbot hội thoại giúp sellers tìm kiếm, so sánh, và chọn sản phẩm fulfillment qua ngôn ngữ tự nhiên (VN/EN), sử dụng BurgerPrints API v2.0 làm nguồn dữ liệu.
Đầu vào
Câu hỏi ngôn ngữ tự nhiên của seller (VN/EN); BurgerPrints API v2.0 (BTC cung cấp credentials); (bonus) endpoint tạo đơn hàng.
Đầu ra mong đợi
Câu trả lời sẵn sàng để ra quyết định, kèm lý do + so sánh khi cần; hội thoại nhiều lượt; (bonus) tự động tạo đơn hàng qua API khi seller xác nhận.
Yêu cầu bắt buộc
- BẮT BUỘC dùng BurgerPrints API v2.0 (không nhúng cứng, không cào)
- BẮT BUỘC là AI agent hội thoại (không phải form filter tĩnh)
- Cài đặt ≤ 10 phút trên máy giám khảo
- Có giao diện cho seller (web/mobile/CLI/Telegram/Discord tùy chọn)
- Không upload API key lên public repo
Tech Stack gợi ý
LLM tự chọn (Claude / GPT / Gemini / Llama / Mistral / Qwen / DeepSeek) · Framework tự chọn (LangChain / LlamaIndex / CrewAI / AutoGen / tự build) · Pattern tự chọn (RAG / function-calling / multi-agent / hybrid)
Tình huống mẫu
- "Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8, ship dưới 5 ngày, chọn xưởng nào, SKU nào?"
- "So sánh giá Hoodie giữa các xưởng đang có, xưởng nào ship EU rẻ nhất?"
- "Tôi định bán giá $24.99, margin tối thiểu 40%, gợi ý sản phẩm phù hợp."
Tiêu chí chấm điểm
Chỉ chấm kết quả. Test trực tiếp 10-15 câu hỏi ở vòng sơ khảo, câu hỏi mở rộng ở chung kết. Giám khảo đánh giá UX như một seller thật. (Bonus tạo đơn hàng = điểm cộng.)
Sản phẩm cần nộp
GitHub · README 1-2 trang (kiến trúc + cài đặt ≤ 10 phút) · Demo video 3-5 phút · Bộ slide · (tùy chọn) URL live demo · (bonus) luồng tạo đơn hàng