# Kết quả kiểm tra tải Google Drive

Thời điểm: 27/10/2026, 18:44 (Asia/Saigon).

File thử nghiệm do người dùng cung cấp: `1_LqJcgMHihGgWLXBGc3jhHczSZEzBnVd`.

- File đã được liên kết, xác nhận chia sẻ trong bài Published; API công khai có download_url Google cung cấp.
- Metadata thực tế: `application/x-msdownload`, 11.566.080 byte; quyền chia sẻ `anyone`, `canDownload=true`. Liên kết tải được lưu riêng với liên kết xem.
- Trang xem Drive: HTTP 200, `text/html; charset=utf-8`, không có Content-Disposition attachment.
- GET ẩn danh tới đúng download_url từ API công khai: HTTP 200, `text/html; charset=utf-8`, 2.467 byte được đọc, không có Content-Disposition attachment.
- Kết quả: **Google yêu cầu xác nhận tải** (`google-confirmation-required`). Chưa nhận dữ liệu file đính kèm, không khẳng định đã tải thành công toàn bộ file.
- Không gửi OAuth token/cookie trong phép thử; không tạo URL tải khác, không gửi lại form xác nhận, không thay quyền chia sẻ hoặc vượt cảnh báo.
- Website dùng link tải riêng cho nút Tải xuống và giữ nút Xem trên Google Drive làm phương án dự phòng. Người dùng thực hiện bước Google yêu cầu trên trình duyệt.
- Người dùng đã kiểm tra trên trình duyệt, xác nhận Google hiển thị cảnh báo không thể quét vi-rút cho tệp thực thi và chấp nhận giữ bước xác nhận này.

Lệnh kiểm tra:

```powershell
node scripts/check-drive-download.mjs 1_LqJcgMHihGgWLXBGc3jhHczSZEzBnVd
```

Trước đó, OAuth từ server sandbox thất bại do kết nối Google bị EACCES. Chạy lại backend localhost ngoài sandbox đã cho phép tiếp tục phép thử. Log chẩn đoán mới chỉ ghi mã lỗi phân loại, không ghi credential.
