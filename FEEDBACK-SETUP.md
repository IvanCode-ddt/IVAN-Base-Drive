# Ghim bài viết và nhận góp ý

## Ghim bài viết

Trong Admin, chọn **Ghim/Bỏ ghim** ở danh sách hoặc ô **Ghim bài viết** trong trang soạn bài. Số thứ tự nhỏ đứng trước; số bằng nhau được sắp ổn định theo ID. Tối đa 5 bài chưa xóa được ghim, kể cả Draft. Chỉ Published xuất hiện trong **Nội dung nổi bật**. Bài nổi bật không lặp lại trong danh sách thường; tìm kiếm và lọc áp dụng cho cả hai khu vực.

Lưu bài chỉ cập nhật local. Chạy `npm.cmd run export`, dùng nút đăng website hoặc `Update-IVAN-Code.cmd` theo quy trình xác nhận hiện có để cập nhật GitHub Pages. Không có push tự động trong tính năng ghim/góp ý.

## Google Form công khai

Form đã gắn: [IVAN Base Drive – Gửi góp ý](https://docs.google.com/forms/d/e/1FAIpQLSchKxiDiEG3JKwMHp05ezqPbdbks6cssk-Lhp46ogd-9CuP-A/viewform).

Link đã kiểm tra trả HTTP 200, tiêu đề đúng IVAN Base Drive. Chưa gửi phản hồi thật và chưa xác nhận cấu trúc Sheet của bạn. Website mở Google Form chính thức bằng iframe, có liên kết mở riêng dự phòng. Không giả lập POST tới formResponse và không có custom endpoint nhận phản hồi.

Kiểm tra/chỉnh Form bằng tài khoản chủ sở hữu, giữ lại các phản hồi hiện có:

1. Tạo hoặc bổ sung năm câu hỏi có tên **đúng như bảng bên dưới**. Câu hỏi Loại dùng dropdown hoặc trắc nghiệm với ba lựa chọn: Góp ý / Yêu cầu thêm game, phần mềm, file / Báo lỗi.
2. Bật Required cho Loại, Tiêu đề và Nội dung chi tiết. Liên kết và email là tùy chọn. Tiêu đề tối đa 200 ký tự, nội dung tối đa 10.000 ký tự; có thể đặt Response validation trong Form.
3. Settings → Responses: tắt Limit to 1 response, không yêu cầu email đã xác minh; dùng câu hỏi Email liên hệ tùy chọn thay cho thu thập email tài khoản bắt buộc. Không dùng câu hỏi upload file nếu muốn nhận ẩn danh.
4. Cho phép người có link phản hồi, không giới hạn trong tổ chức. Publish/Share Form rồi bật nhận phản hồi. **Tắt View results summary** để người gửi không nhìn thấy nội dung/email của người khác.
5. Mở cửa sổ ẩn danh để kiểm tra gửi không cần đăng nhập. Website không thể tự vượt hạn chế do cấu hình Google Form/tổ chức đặt ra.

Google hướng dẫn việc chia sẻ và nhúng tại [Publish & share your form](https://support.google.com/docs/answer/2839588).

## Nối Form với Sheet riêng tư

1. Mở Form → Responses → biểu tượng Google Sheets → chọn Sheet nhận phản hồi của bạn. Không bật “Publish to web” cho Sheet và không chia sẻ “Anyone with the link”. Chỉ Form dành cho người gửi là công khai.
2. Ghi chính xác **tên tab** nhận phản hồi ở cạnh dưới Sheet. Tên file Sheet không phải tên tab. ID Sheet bạn đã gửi được lưu riêng trong `data/feedback-config.json`, không đưa vào docs hoặc Git.
3. Hàng đầu phải có các cột dưới đây. Thứ tự cột có thể khác nhau trong A:Z; backend tìm theo tên, chấp nhận khác hoa/thường và dấu tiếng Việt.

| Cột | Nội dung |
|---|---|
| Dấu thời gian hoặc Timestamp | Google Forms tạo tự động |
| Loại | Một trong ba loại phản hồi |
| Tiêu đề | Bắt buộc |
| Nội dung chi tiết | Bắt buộc |
| Liên kết tham khảo | Tùy chọn |
| Email liên hệ | Tùy chọn |

Không xóa phản hồi cũ để khớp schema. Nếu Form cũ dùng cấu trúc khác, giữ tab gốc và chuẩn bị tab chuẩn hóa riêng có các cột trên. Thiếu cột hoặc dữ liệu bắt buộc sẽ được báo rõ, không giả vờ đồng bộ thành công. Một lần đồng bộ tối đa 10.000 phản hồi; vượt giới hạn thì dừng, không bỏ qua âm thầm.

## Cho phép backend đọc Sheets – thiết lập tùy chọn, chưa bật

Đăng nhập Admin/Drive vẫn giữ nguyên scope hiện có. Nó không có quyền đọc cell Sheets. Backend có adapter **service account riêng**, mặc định tắt. Chỉ thực hiện các bước sau nếu bạn đồng ý cấp quyền đọc Sheet cho adapter này; không sửa OAuth Client ID, Client Secret hoặc thêm scope vào đăng nhập Admin.

1. Google Cloud Console → APIs & Services → Library → bật **Google Sheets API** trong project bạn chọn.
2. IAM & Admin → Service Accounts → tạo một service account chỉ dành cho hộp góp ý. Không cần cấp Owner/Editor project hoặc bật domain-wide delegation.
3. Mở service account → Keys → Add key → Create new key → JSON. Lưu key ngoài source, hoặc tại `data/credentials/feedback-service-account.json` đã được gitignore. Không gửi key vào chat, không đặt trong docs, không commit. Đây là key service account riêng, không phải OAuth Client Secret đang dùng.
4. Mở Sheet riêng tư → Share → thêm **client_email** của service account với quyền **Viewer**. Chỉ chia sẻ Sheet này cho tài khoản đó; không tự đổi quyền công khai.
5. Sửa file local `data/feedback-config.json`, điền tên tab và đường dẫn key. Chỉ đổi enabled thành true khi đã hoàn tất và đồng ý kích hoạt:

```json
{
  "enabled": true,
  "spreadsheetId": "GIU_ID_DA_LUU_TRONG_FILE_LOCAL",
  "sheetName": "TEN_TAB_CHINH_XAC",
  "serviceAccountFile": "data/credentials/feedback-service-account.json"
}
```

Giữ ID thực đã có trong file, không thay bằng chuỗi ví dụ. Bạn cũng có thể dùng các biến FEEDBACK_* trong `.env.example` thay cho file local, nhưng không cần sửa `.env`. Biến môi trường có giá trị sẽ ưu tiên hơn file local; ví dụ FEEDBACK_SHEETS_ENABLED=false sẽ tiếp tục chặn kết nối dù enabled trong JSON là true.

6. Tắt/mở lại Admin bằng Ctrl+C và `IVAN-Admin.cmd`, đăng nhập Google, vào **Hộp góp ý** → **Đồng bộ từ Sheets**. Adapter chỉ GET Sheets API với `spreadsheets.readonly`; không sửa/xóa Sheet, không dùng hoặc đưa token ra trình duyệt.

Thiết lập dựa trên tài liệu chính thức: [service account và chia sẻ tài liệu](https://developers.google.com/workspace/guides/create-credentials), [tạo/xóa key](https://docs.cloud.google.com/iam/docs/keys-create-delete), [scope Sheets](https://developers.google.com/workspace/sheets/api/scopes), [đọc cell](https://developers.google.com/workspace/sheets/api/guides/values).

## Xử lý phản hồi

Hộp góp ý có tìm kiếm, lọc loại/trạng thái, phân trang và bốn trạng thái Chưa đọc / Đã đọc / Đang xử lý / Hoàn thành. Trạng thái nằm trong SQLite; đồng bộ không ghi đè. Danh tính phản hồi dựa trên nguồn và nội dung, không dựa vào số hàng nên sắp lại hàng không làm mất trạng thái. Phản hồi sửa nội dung được xem là mục mới; mục cũ và trạng thái cũ vẫn giữ. Hàng bị xóa khỏi Sheet cũng không tự bị xóa khỏi hộp góp ý.

Lỗi API/quyền/mạng hoặc thiếu cấu hình không xóa phản hồi đã lưu. Trạng thái “Chưa kiểm tra kết nối” sau restart không có nghĩa đã xác thực thành công; nhấn đồng bộ để kiểm tra. Phản hồi, email, trạng thái xử lý, ID Sheet và credential không được xuất vào docs. Nội dung được hiển thị bằng textContent, không thực thi HTML.

Để thu hồi: đổi enabled=false, khởi động lại Admin, bỏ quyền Viewer của service account trên Sheet và xóa key đó trong Google Cloud nếu không còn dùng. Google Form vẫn nhận phản hồi khi PC tắt; đồng bộ vào SQLite chỉ diễn ra khi Admin local chạy và bạn bấm đồng bộ.
