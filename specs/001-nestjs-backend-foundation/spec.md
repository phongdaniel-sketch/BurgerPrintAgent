# Feature Specification: NestJS Backend Foundation cho BurgerPrints Chatbot Agent

**Feature Branch**: `001-nestjs-backend-foundation`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Thiết lập nền tảng backend cho AI chatbot agent của BurgerPrints (BP1 - POD Catalog Assistant). Backend cung cấp API hội thoại nhiều lượt giúp sellers POD tìm/so sánh/chọn sản phẩm fulfillment qua ngôn ngữ tự nhiên (VN/EN), dùng dữ liệu từ BurgerPrints API v2.0. Yêu cầu kỹ thuật: NestJS, streaming qua SSE, runtime là pi-agent-core, Redis cho session/conversation state và caching, quản lý credentials an toàn, cài đặt ≤ 10 phút."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hội thoại streaming nhiều lượt với agent (Priority: P1)

Một seller POD gửi câu hỏi bằng ngôn ngữ tự nhiên (VN hoặc EN) tới backend và nhận lại câu trả lời của agent được hiển thị dần (token-by-token / từng phần) ngay khi agent sinh ra, thay vì phải chờ toàn bộ câu trả lời hoàn tất. Seller có thể tiếp tục đặt câu hỏi nối tiếp trong cùng một phiên hội thoại, và agent nhớ ngữ cảnh các lượt trước.

**Why this priority**: Đây là trải nghiệm cốt lõi của sản phẩm — một AI agent hội thoại (không phải form filter tĩnh). Nếu chỉ có duy nhất story này, hệ thống đã là một MVP có giá trị: seller hỏi và nhận tư vấn fulfillment theo thời gian thực. Streaming là yếu tố quyết định cảm nhận "trò chuyện như người thật" mà giám khảo đánh giá.

**Independent Test**: Mở một phiên hội thoại mới, gửi câu hỏi "Tôi muốn bán T-shirt cho thị trường Mỹ, giá vốn dưới $8", quan sát câu trả lời xuất hiện dần qua kết nối streaming, rồi gửi câu hỏi nối tiếp "còn ship dưới 5 ngày thì sao?" và xác nhận agent giữ được ngữ cảnh sản phẩm/thị trường đã nói ở lượt trước.

**Acceptance Scenarios**:

1. **Given** một phiên hội thoại mới được khởi tạo, **When** seller gửi một câu hỏi tự nhiên, **Then** backend mở một luồng phản hồi streaming và phát các phần câu trả lời của agent theo thời gian thực cho tới khi hoàn tất.
2. **Given** một phiên đã có ít nhất một lượt hỏi-đáp, **When** seller gửi câu hỏi nối tiếp tham chiếu ngữ cảnh trước đó, **Then** agent trả lời có tính đến lịch sử hội thoại của phiên đó.
3. **Given** seller gửi câu hỏi bằng tiếng Việt, **When** agent trả lời, **Then** câu trả lời ở cùng ngôn ngữ với câu hỏi (VN), và tương tự với EN.
4. **Given** luồng streaming đang chạy, **When** agent hoàn tất câu trả lời, **Then** client nhận được tín hiệu kết thúc rõ ràng để biết lượt trả lời đã xong.

---

### User Story 2 - Lưu và khôi phục trạng thái phiên hội thoại (Priority: P2)

Trạng thái của một phiên hội thoại (lịch sử các lượt, ngữ cảnh agent) được lưu giữ độc lập với tiến trình phục vụ một request, để seller có thể quay lại phiên cũ hoặc để hệ thống phục vụ nhiều phiên đồng thời mà không trộn lẫn ngữ cảnh.

**Why this priority**: Hội thoại nhiều lượt chỉ có ý nghĩa khi trạng thái được lưu bền vững giữa các request. Đây là điều kiện để Story 1 hoạt động ổn định ở quy mô nhiều người dùng, nhưng bản thân nó có thể kiểm thử riêng.

**Independent Test**: Tạo phiên A và phiên B, gửi câu hỏi khác nhau vào mỗi phiên, sau đó truy vấn lại lịch sử từng phiên và xác nhận không bị trộn lẫn; khởi động lại tiến trình backend và xác nhận lịch sử phiên vẫn còn (trong thời hạn lưu giữ).

**Acceptance Scenarios**:

1. **Given** hai phiên hội thoại khác nhau đang hoạt động, **When** mỗi phiên gửi câu hỏi riêng, **Then** ngữ cảnh và lịch sử của hai phiên hoàn toàn tách biệt.
2. **Given** một phiên đã có lịch sử, **When** tiến trình phục vụ request được khởi động lại, **Then** lịch sử phiên đó vẫn truy xuất được trong thời hạn lưu giữ đã định.
3. **Given** một phiên không hoạt động vượt quá thời hạn lưu giữ, **When** thời hạn trôi qua, **Then** trạng thái phiên được dọn dẹp tự động.

---

### User Story 3 - Cài đặt nhanh và cấu hình an toàn (Priority: P2)

Người vận hành (giám khảo / developer mới) có thể clone source, cung cấp credentials qua cấu hình môi trường (không có khóa bí mật nào nằm trong mã nguồn), khởi chạy backend và các phụ thuộc của nó, và có một endpoint hội thoại hoạt động trong vòng ≤ 10 phút.

**Why this priority**: Tiêu chí bắt buộc của đề bài ("cài đặt ≤ 10 phút", "không upload API key lên public repo"). Là điều kiện để sản phẩm được chấm điểm, nhưng tách biệt được khỏi luồng hội thoại lõi.

**Independent Test**: Trên một máy sạch, làm theo README: cấu hình biến môi trường mẫu, chạy lệnh khởi động duy nhất, và gọi thử endpoint health + một câu hỏi mẫu — toàn bộ hoàn tất trong 10 phút mà không phải sửa mã nguồn.

**Acceptance Scenarios**:

1. **Given** một máy chưa cài đặt gì ngoài công cụ nền tảng tiêu chuẩn, **When** người vận hành làm theo hướng dẫn cài đặt, **Then** backend khởi chạy thành công trong ≤ 10 phút.
2. **Given** mã nguồn được công khai, **When** kiểm tra repository, **Then** không có API key / secret nào được nhúng cứng; tất cả đều nạp từ cấu hình môi trường.
3. **Given** thiếu một biến cấu hình bắt buộc, **When** backend khởi động, **Then** hệ thống báo lỗi rõ ràng chỉ ra biến nào thiếu thay vì lỗi mơ hồ khi chạy.

---

### Edge Cases

- Điều gì xảy ra khi agent runtime (pi-agent-core) lỗi hoặc timeout giữa chừng một luồng streaming? → Client phải nhận được thông báo lỗi có cấu trúc và luồng được đóng sạch sẽ, không treo vô hạn.
- Điều gì xảy ra khi nguồn dữ liệu BurgerPrints API v2.0 không phản hồi hoặc trả lỗi? → Agent thông báo cho seller rằng không lấy được dữ liệu thay vì bịa thông tin.
- Điều gì xảy ra khi client ngắt kết nối streaming giữa chừng? → Backend phát hiện và giải phóng tài nguyên của lượt đó.
- Điều gì xảy ra khi store trạng thái phiên (Redis) tạm thời không truy cập được? → Hệ thống báo lỗi rõ ràng và không làm hỏng dữ liệu phiên hiện có.
- Điều gì xảy ra khi `session_id` không tồn tại hoặc đã hết hạn? → Backend trả lỗi rõ ràng hoặc tạo phiên mới theo quy ước đã định.
- Điều gì xảy ra với câu hỏi rất dài hoặc vượt giới hạn ngữ cảnh của agent? → Hệ thống xử lý có kiểm soát (cắt/tóm tắt/từ chối) thay vì lỗi không kiểm soát.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống MUST cung cấp một endpoint hội thoại nhận câu hỏi ngôn ngữ tự nhiên của seller gắn với một định danh phiên (session) và trả về phản hồi của agent.
- **FR-002**: Hệ thống MUST phát phản hồi của agent dưới dạng streaming theo thời gian thực qua một kết nối phù hợp với trình duyệt/web client (Server-Sent Events), phát từng phần ngay khi agent sinh ra.
- **FR-003**: Hệ thống MUST hỗ trợ hội thoại nhiều lượt: lưu lịch sử các lượt của một phiên và cung cấp lịch sử đó làm ngữ cảnh cho agent ở các lượt tiếp theo.
- **FR-004**: Hệ thống MUST sử dụng pi-agent-core làm runtime agent thực thi vòng đời hội thoại (nhận đầu vào, gọi công cụ/dữ liệu, sinh phản hồi).
- **FR-005**: Hệ thống MUST lưu trạng thái/lịch sử phiên hội thoại ở một kho lưu trữ độc lập với tiến trình phục vụ request (Redis), tách biệt theo từng phiên.
- **FR-006**: Hệ thống MUST hỗ trợ truy vấn dữ liệu sản phẩm/xưởng/SKU từ BurgerPrints API v2.0 làm nguồn dữ liệu cho agent (không nhúng cứng dữ liệu, không cào web).
- **FR-007**: Hệ thống MUST trả lời cùng ngôn ngữ với câu hỏi của seller (VN hoặc EN).
- **FR-008**: Hệ thống MUST nạp toàn bộ credentials và cấu hình nhạy cảm (API key BurgerPrints, khóa LLM, kết nối Redis) từ cấu hình môi trường; KHÔNG được nhúng cứng secret trong mã nguồn.
- **FR-009**: Hệ thống MUST kiểm tra (validate) các biến cấu hình bắt buộc khi khởi động và báo lỗi rõ ràng chỉ rõ biến nào thiếu/không hợp lệ.
- **FR-010**: Hệ thống MUST cung cấp một endpoint kiểm tra tình trạng (health/readiness) cho biết backend và các phụ thuộc cốt lõi đã sẵn sàng.
- **FR-011**: Hệ thống MUST xử lý lỗi của agent runtime và của nguồn dữ liệu một cách có cấu trúc: phát thông báo lỗi tới client và đóng luồng streaming sạch sẽ thay vì treo.
- **FR-012**: Hệ thống MUST tổ chức mã nguồn theo cấu trúc module rõ ràng, tách biệt các mối quan tâm (lớp hội thoại/SSE, lớp tích hợp agent runtime, lớp lưu trạng thái, lớp tích hợp nguồn dữ liệu, lớp cấu hình) để sẵn sàng phát triển tiếp.
- **FR-013**: Hệ thống MUST giải phóng tài nguyên của một lượt streaming khi client ngắt kết nối hoặc khi lượt trả lời hoàn tất.
- **FR-014**: Hệ thống MUST áp dụng thời hạn lưu giữ (TTL) cho trạng thái phiên và dọn dẹp tự động các phiên hết hạn.
- **FR-015**: Hệ thống MUST đi kèm hướng dẫn cài đặt cho phép một người vận hành mới dựng và chạy backend trong ≤ 10 phút.

### Key Entities *(include if feature involves data)*

- **Phiên hội thoại (Conversation Session)**: Đại diện cho một chuỗi tương tác liên tục với một seller. Thuộc tính: định danh phiên, ngôn ngữ, thời điểm tạo/cập nhật, thời hạn lưu giữ. Một phiên chứa nhiều Lượt hội thoại.
- **Lượt hội thoại (Conversation Turn / Message)**: Một câu hỏi của seller hoặc một câu trả lời của agent trong phiên. Thuộc tính: vai trò (seller/agent), nội dung, thứ tự/thời điểm. Thuộc về một Phiên.
- **Ngữ cảnh agent (Agent Context/State)**: Trạng thái mà agent runtime cần để duy trì hội thoại mạch lạc qua nhiều lượt (lịch sử rút gọn, kết quả công cụ gần đây). Gắn với một Phiên.
- **Cấu hình credentials (Configuration/Secrets)**: Tập hợp giá trị nạp từ môi trường để kết nối tới nguồn dữ liệu BurgerPrints, mô hình LLM, và kho trạng thái. Không phải dữ liệu nghiệp vụ, nhưng là thực thể vận hành bắt buộc.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Một người vận hành mới dựng và chạy được backend tới trạng thái có endpoint hội thoại hoạt động trong ≤ 10 phút trên một máy sạch.
- **SC-002**: Phần đầu tiên của câu trả lời agent bắt đầu hiển thị cho seller trong vòng ≤ 3 giây kể từ khi gửi câu hỏi (cảm nhận "phản hồi tức thì"), với các phần tiếp theo xuất hiện liên tục cho tới khi hoàn tất.
- **SC-003**: Trong một phiên nhiều lượt, agent giữ đúng ngữ cảnh ở ≥ 95% các câu hỏi nối tiếp tham chiếu lượt trước (đánh giá trên bộ câu hỏi mẫu).
- **SC-004**: 100% credentials/secrets được nạp từ cấu hình môi trường — kiểm tra mã nguồn công khai không tìm thấy secret nhúng cứng nào.
- **SC-005**: Hệ thống phục vụ đồng thời nhiều phiên hội thoại độc lập mà không trộn lẫn ngữ cảnh (kiểm thử với tối thiểu 10 phiên song song).
- **SC-006**: Khi một biến cấu hình bắt buộc bị thiếu, 100% trường hợp backend báo lỗi nêu đích danh biến thiếu khi khởi động (không khởi động im lặng rồi lỗi mơ hồ lúc chạy).
- **SC-007**: Khi agent runtime hoặc nguồn dữ liệu lỗi giữa luồng streaming, client luôn nhận được tín hiệu lỗi/kết thúc rõ ràng và không có kết nối nào bị treo quá thời gian chờ đã định.

## Assumptions

- Phạm vi feature này là **dựng khung nền tảng backend** sẵn sàng phát triển tiếp; chất lượng nội dung tư vấn của agent (chiến lược prompt, logic so sánh sản phẩm chi tiết) sẽ được hoàn thiện ở các feature sau.
- Giao diện người dùng cho seller (web/mobile/CLI/Telegram) **nằm ngoài** phạm vi feature này; feature này chỉ cung cấp API hội thoại streaming để giao diện kết nối vào.
- Credentials của BurgerPrints API v2.0 do ban tổ chức cung cấp và sẽ được cấp cho môi trường chạy qua biến môi trường.
- Mô hình LLM cụ thể dùng bên trong agent runtime được chọn ở giai đoạn lập kế hoạch/triển khai; spec này không ràng buộc nhà cung cấp LLM.
- Redis (hoặc dịch vụ tương thích) là kho lưu trạng thái phiên và cache; được chạy như một phụ thuộc đi kèm khi cài đặt.
- Xác thực/định danh người dùng cuối (đăng nhập seller) không bắt buộc cho feature nền tảng này; phiên được định danh qua `session_id` do client cung cấp/nhận về.
- Endpoint tạo đơn hàng (bonus của đề bài) nằm ngoài phạm vi feature này.
