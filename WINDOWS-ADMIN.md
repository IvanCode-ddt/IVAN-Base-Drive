# Mở Admin bằng một cú nhấp trên Windows

## Chuẩn bị một lần

- Cài Node.js 24.15 trở lên (kèm npm), Git for Windows và Git Credential Manager.
- Trong thư mục dự án, chạy `npm.cmd ci` nếu chưa cài dependencies. Launcher kiểm tra và báo lỗi; không tự tải/cài phần mềm.
- Giữ cấu hình `.env` hiện có. Cổng vận hành là 3000; OAuth vẫn dùng origin/callback localhost đã cấu hình.

## Mở và tắt

Launcher tự bật `LOCAL_ADMIN_MODE=true` riêng cho tiến trình Node: vào Dashboard trực tiếp, không cần đăng nhập Google để quản lý bài viết. Không sửa `.env`. Tắt server cũ trước lần mở launcher sau khi nâng cấp; launcher không tái sử dụng server đang chạy chế độ Google Admin.

Quyền quản trị local và kết nối Drive độc lập. Trong Kho Google Drive, chọn kết nối Google khi cần đọc/đồng bộ file. Vẫn chỉ tài khoản ADMIN_EMAIL được kết nối; token chỉ tồn tại trong phiên phía server. Ngắt kết nối hoặc hết hạn token Drive không làm mất quyền quản trị local. Không cần kết nối Google chỉ để tạo bài không gắn file Drive.

Để dùng lại đăng nhập Google Admin, tắt launcher rồi chạy `npm.cmd start` với LOCAL_ADMIN_MODE tắt/không đặt. Biến được launcher đặt cho tiến trình con, không thay đổi môi trường Windows. Chế độ local bị từ chối nếu NODE_ENV=production hoặc BASE_URL ngoài HTTP localhost/127.0.0.1. Host/Origin sai, proxy và địa chỉ LAN đều bị chặn; API ghi vẫn cần CSRF.

Nhấp đúp **IVAN-Admin.cmd**. Launcher tự chuyển về thư mục dự án, kiểm tra Node/dependencies, chạy Node với `.env` giống `npm.cmd start` (không watch), chờ HTTP sẵn sàng rồi mở `http://127.0.0.1:3000/admin` bằng trình duyệt mặc định.

Địa chỉ 127.0.0.1 chuyển về localhost nếu đó là BASE_URL hiện tại. Điều này giữ cùng cookie đăng nhập, Origin/CSRF và callback Google; không cần sửa OAuth. Express chỉ lắng nghe IPv4 `127.0.0.1`, không mở trên LAN.

**Giữ cửa sổ launcher mở trong lúc quản trị. Nhấn Ctrl+C trong cửa sổ đó để tắt server** (nếu Windows hỏi kết thúc batch, chọn Y). Đóng tab trình duyệt không tắt server. Không có dịch vụ hoặc tiến trình nền tự khởi động. Khi mở launcher lần nữa, server đúng dự án đang chạy được tái sử dụng; hãy tắt tại cửa sổ đã mở đầu tiên.

Nếu cổng 3000 là ứng dụng khác, bản IVAN cũ chưa có kiểm tra readiness hoặc bản sao dự án khác, launcher dừng và báo lỗi. Tắt đúng cửa sổ/ứng dụng đang giữ cổng rồi thử lại; launcher không tự kill tiến trình lạ. Nếu lỗi khởi động, cửa sổ giữ lại thông báo để đọc. Không chia sẻ toàn bộ log/cấu hình có dữ liệu bí mật.

## Tạo shortcut Desktop

1. Trong File Explorer, tìm `IVAN-Admin.cmd` của dự án.
2. Nhấn chuột phải → **Show more options** → **Send to** → **Desktop (create shortcut)**.
3. Đổi tên shortcut thành **IVAN Base Drive Admin**. Chỉ tạo shortcut `.lnk`, không chép riêng launcher ra ngoài dự án.

Nếu menu Send to không có: Desktop → New → Shortcut → Browse → chọn `IVAN-Admin.cmd`. Launcher tự xác định thư mục, không phụ thuộc mục “Start in”. Khi chuyển thư mục dự án, tạo lại shortcut.

## Đăng cập nhật website

Đăng nhập Google trong Admin → **Xuất bản website** → **Đăng cập nhật lên website**. Kiểm tra bản xem trước và danh sách thay đổi; đánh dấu xác nhận rồi bấm nút đăng cuối cùng. Lưu nháp/xuất bản một bài chỉ cập nhật dữ liệu local, không tự push.

Hệ thống xuất snapshot công khai, kiểm tra dữ liệu, chỉ stage các đường dẫn docs được phép, commit riêng và push origin/main qua Git Credential Manager. Thành công hiển thị commit và liên kết Pages; Pages cần thêm thời gian xây dựng. Không có thay đổi sẽ báo website đã mới nhất. Khi lỗi đăng nhập Git/mạng/remote có commit mới, đọc hướng dẫn ngay trong Admin. Không force push, không tự merge/conflict. Thay đổi source chưa commit không được đưa vào commit xuất bản. Không lưu GitHub token trong ứng dụng.

Chức năng này chỉ hoạt động trên local, cần phiên admin, CSRF và đúng Origin. Không dùng tunnel/proxy đưa Admin ra Internet. Không có launcher, cấu hình local hay log nào được thêm vào docs. Không sửa `.env` để sử dụng launcher.

## Kiểm thử an toàn

`npm.cmd test` kiểm tra launcher bằng tiến trình Node riêng trên cổng tạm: server tắt, đã chạy, cổng bị chiếm, readiness, thiếu dependencies và timeout. Trình duyệt được mô phỏng, không mở cửa sổ khi test. Kiểm thử xuất bản sử dụng repository tạm, chặn thao tác remote/push; không commit hoặc push repository thật. `npm.cmd run test:browser` kiểm tra giao diện desktop/mobile với publisher mô phỏng.
