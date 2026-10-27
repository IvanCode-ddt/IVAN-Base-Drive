# Báo cáo sửa tải file, dashboard và Thùng rác

## A. Truy vết và nguyên nhân

Tại thời điểm bắt đầu sửa, SQLite thật có hai bài Published (`123123`, `vencord 2`) nhưng bảng `post_drive_files` không có dòng liên kết cho cả hai. Vì vậy API không có File ID để trả; sửa nút HTML riêng không thể khôi phục dữ liệu này. Không có lịch sử request trước đó để kết luận chính xác thao tác cũ nào đã xóa/bỏ sót các dòng, và bản sửa không tự đoán File ID để gắn lại.

Một nguyên nhân khác được xác định trực tiếp trong code: API công khai/export chỉ giữ `sharing_confirmed=1`, trong khi chọn file trong modal chỉ tạo quan hệ chưa xác nhận. Form trước đây không có bước xác nhận chia sẻ tại chỗ, và renderer hiển thị chung “Chưa có file tải”. File được lưu đúng vẫn có thể không xuất hiện công khai vì chính sách này.

Luồng mới:

1. Modal chỉ cập nhật Map tạm; không ghi SQLite.
2. Form gửi `drive_file_ids` và `drive_public_file_ids` riêng, kèm hợp đồng CMS phiên bản 2.
3. Server xác minh file trong cây gốc, quyền truy cập và metadata hiện tại. Chỉ cho xác nhận công khai khi metadata có quyền Anyone; Restricted không được công khai.
4. Transaction ghi bài, quan hệ nhiều file và xác nhận chia sẻ. Lỗi rollback toàn bộ.
5. Response quản trị có đầy đủ `drive_files`; frontend đối chiếu tập ID đã yêu cầu với tập ID đã lưu, không âm thầm reset form khi không khớp.
6. Form chỉ mở tương tác sau khi nạp session/bài xong; từ chối backend phiên bản cũ để tránh lưu bằng hợp đồng không khớp. Xem trước Admin phân biệt file riêng tư/chưa xác nhận; API khách không lộ các file đó.
7. Public API và export dùng chung bộ lọc. Mỗi file công khai có nút tải từ webContentLink hoặc xem Drive dự phòng, độc lập với URL tải nhập thủ công.

Kiểm thử tạo qua API → đóng database/khởi tạo lại ứng dụng → đọc public API → export đã giữ nguyên File ID, URL tải và resource key. OAuth/Drive trong kiểm thử được giả lập; không tự thay quyền Drive hoặc scope.

## B. Dashboard

- `/admin/`: danh sách bài, tìm kiếm, lọc danh mục/trạng thái, Sửa/Xem trước/Xóa.
- `/admin/editor.html`: form tạo bài riêng.
- `/admin/editor.html?edit=ID`: sửa bài và danh sách file đã gắn.
- `/admin/drive-library.html`: quản lý kho độc lập.
- `/admin/#settings`: thông tin local và lệnh export, không có secret/token.
- `/admin/#trash`: Thùng rác.

## C. Backup và xóa mềm

Migration v4 thêm `posts.deleted_at`. Trước migration trên database có sẵn, ứng dụng tạo bản sao bằng SQLite VACUUM INTO, kiểm tra integrity_check và fingerprint dữ liệu bài/liên kết. Nếu backup không hợp lệ, từ chối migration. Backup và manifest `.verified.json` nằm trong `data/backups/`, được Git bỏ qua.

Backup thật đầu tiên đã xác minh: `pre-v4-2026-10-27T13-00-34-498Z-eb62832a.sqlite`, integrity `ok`, 2 bài. Sau migration, toàn bộ trường cũ và số liên kết khớp bản v3; các bài không bị xóa hoặc tạo lại.

Xóa yêu cầu session Admin, CSRF và xác nhận đúng tên. Xóa mềm ẩn bài khỏi API khách, export và route ảnh công khai nếu ảnh không còn bài Published nào khác dùng. Khôi phục giữ bài/liên kết, đưa về trạng thái Draft/Published trước đó. Xóa vĩnh viễn chỉ áp dụng trong Thùng rác, cần nhập lại tên trong hộp thoại riêng. Chỉ xóa dữ liệu SQLite của bài và quan hệ của nó; không gọi API xóa Drive, không xóa ảnh gốc trên ổ đĩa.

GitHub Pages chỉ thay đổi sau khi chạy lại export và cập nhật bản tĩnh. Nội dung đã public trước đây có thể vẫn còn trong cache/Git history.

## Kiểm tra

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run export
```

Bao gồm API, CSRF, quyền hạn, Restricted, nhiều file, restart, rollback, backup/migration, xóa/khôi phục/purge, ảnh dùng chung, export, và Edge desktop/mobile. Không sửa `.env`, không commit/push/deploy.
