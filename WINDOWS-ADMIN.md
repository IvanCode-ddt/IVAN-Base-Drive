# Mở Admin bằng một cú nhấp trên Windows

## Chuẩn bị một lần

- Cài Node.js 24.15 trở lên (kèm npm), Git for Windows và Git Credential Manager.
- Trong thư mục dự án, chạy `npm.cmd ci` nếu chưa cài dependencies. Launcher kiểm tra và báo lỗi; không tự tải/cài phần mềm.
- Giữ cấu hình `.env` hiện có. Cổng vận hành là 3000; OAuth vẫn dùng origin/callback localhost đã cấu hình.

## Mở và tắt

Từ Giai đoạn 6, Admin bắt buộc đăng nhập Google khớp ADMIN_EMAIL trước khi vào Dashboard. `LOCAL_ADMIN_MODE` đã ngừng hoạt động, kể cả khi `.env` hoặc môi trường Windows còn đặt giá trị true; không cần sửa thông tin bí mật để nâng cấp. Tắt server bản cũ bằng Ctrl+C rồi mở lại launcher một lần sau khi cập nhật.

Quyền Admin chỉ được cấp sau khi backend xác minh ID token Google, email đã xác minh, nonce, subject và ADMIN_EMAIL. Session hết hạn sau tối đa 8 giờ; logout hủy session phía server. Session cũ từ bypass hoặc chỉ có trường email không được chấp nhận. Khởi động lại server cũng làm mất session bộ nhớ, cần đăng nhập lại.

Google Drive tiếp tục dùng OAuth và scope metadata hiện tại. Access token chỉ ở session server, có thể hết hạn trước session Admin. Khi đó kết nối lại Google trong Kho Drive. Ngắt Drive không hủy quyền Admin đã xác thực; logout hủy cả phiên. Không có cơ chế bỏ đăng nhập trong production. Origin ngoài HTTP localhost/127.0.0.1, Host lạ, proxy và LAN bị chặn; API ghi và Git publish vẫn cần CSRF.

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

### Phân biệt hai CMD

- **IVAN-Admin.cmd**: chỉ khởi động/tái sử dụng server và mở Admin. Endpoint readiness độc lập với OAuth; `/admin` trả 302 về trang login là bình thường. Launcher không commit/push và không nhận server bypass cũ là server hợp lệ; không tự kill server cũ.
- **Update-IVAN-Code.cmd**: chỉ export dữ liệu công khai, kiểm tra/lọc file, cho xem trước và chờ Y trước commit/push. Hoạt động độc lập với đăng nhập Google, không mở port/server, không đọc/thay đổi session hay OAuth. Admin có thể tiếp tục chạy khi updater làm việc. Nếu danh sách có backend/launcher/package thay đổi, updater nhắc khởi động lại thủ công; không tự tắt Admin. Nhấn N hủy commit/push, bản export vẫn giữ local.

Git publish trong Admin và updater đều kiểm tra trạng thái Git; tránh bấm đăng website đồng thời trong hai công cụ. Nếu Git đang có thay đổi đã stage, remote mới hơn hoặc conflict, xử lý thủ công theo thông báo; không force push/reset.

### Nút đăng trong Admin

Đăng nhập Google trong Admin → **Xuất bản website** → **Đăng cập nhật lên website**. Kiểm tra bản xem trước và danh sách thay đổi; đánh dấu xác nhận rồi bấm nút đăng cuối cùng. Lưu nháp/xuất bản một bài chỉ cập nhật dữ liệu local, không tự push.

Hệ thống xuất snapshot công khai, kiểm tra dữ liệu, chỉ stage các đường dẫn docs được phép, commit riêng và push origin/main qua Git Credential Manager. Thành công hiển thị commit và liên kết Pages; Pages cần thêm thời gian xây dựng. Không có thay đổi sẽ báo website đã mới nhất. Khi lỗi đăng nhập Git/mạng/remote có commit mới, đọc hướng dẫn ngay trong Admin. Không force push, không tự merge/conflict. Thay đổi source chưa commit không được đưa vào commit xuất bản. Không lưu GitHub token trong ứng dụng.

Chức năng này chỉ hoạt động trên local, cần phiên admin, CSRF và đúng Origin. Không dùng tunnel/proxy đưa Admin ra Internet. Không có launcher, cấu hình local hay log nào được thêm vào docs. Không sửa `.env` để sử dụng launcher.

## Kiểm thử an toàn

### Sửa lỗi LOCAL_ONLY sau kết nối Google Drive

Sau khi cập nhật mã nguồn, nhấn Ctrl+C tắt server cũ và mở lại `IVAN-Admin.cmd`. Vào `http://localhost:3000/admin`, mở Kho Google Drive và kết nối lại Google; không tải lại callback cũ. `http://127.0.0.1:3000/admin` sẽ chuyển về localhost để giữ đúng cookie và callback `http://localhost:3000/auth/google/callback` đã đăng ký.

Kiểm thử Edge tái hiện lỗi cũ: GET `/auth/google` → 302; GET `/auth/google/callback` từ Google → 302; GET `/admin` tiếp theo vẫn mang `Sec-Fetch-Site: cross-site` → 403 LOCAL_ONLY. Đây là lỗi middleware chặn bước sau callback, không phải sai Client ID hay quyền Drive.

Callback local nay chấp nhận điều hướng GET không phụ thuộc Origin/Referer của Google, nhưng vẫn kiểm tra socket loopback, Host, không qua proxy, session/state/nonce/PKCE, tuổi phiên, tài khoản quản trị và redirect URI. Sau xác thực thành công, server trả một trang HTML local tối giản tự mở Dashboard, kết thúc chuỗi redirect cross-site. Không đưa code, state hoặc token vào HTML. Các route khác vẫn chặn Origin khác và các API ghi vẫn cần CSRF.

Kiểm thử trình duyệt dùng trang Google giả lập và dữ liệu Drive thử nghiệm, không sử dụng credential thật hoặc gọi Google thật. Không có commit/push thật trong kiểm thử.

`npm.cmd test` kiểm tra launcher bằng tiến trình Node riêng trên cổng tạm: server tắt, đã chạy, cổng bị chiếm, readiness, thiếu dependencies và timeout. Trình duyệt được mô phỏng, không mở cửa sổ khi test. Kiểm thử xuất bản sử dụng repository tạm, chặn thao tác remote/push; không commit hoặc push repository thật. `npm.cmd run test:browser` kiểm tra giao diện desktop/mobile với publisher mô phỏng.
