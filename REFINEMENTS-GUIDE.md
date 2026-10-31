# Tinh chỉnh Website và CMS — 7 nhiệm vụ

## Cách kiểm tra trước khi cập nhật GitHub Pages

1. Nếu Admin đang chạy, dừng bằng Ctrl+C trong cửa sổ server rồi mở lại `IVAN-Admin.cmd`. Đăng nhập Google như cũ; tải lại trang bằng Ctrl+F5 để nhận CSS/JavaScript mới.
2. Trang chủ mặc định chọn GAME. Thử ỨNG DỤNG, KHÁC, TẤT CẢ, Back/Forward, tìm kiếm và chuyển giữa Thư viện / Nhạc / Phim. URL `#library?category=app` hoặc `?category=app` chỉ định bộ lọc; lựa chọn tiếp theo của người dùng được giữ khi đổi nhóm. Phim vẫn Coming soon.
3. Admin: ghim bài vào vị trí 6 hoặc 20. Vị trí đang được bài khác sử dụng bị khóa; vị trí của bài đang sửa vẫn chọn được. Backend kiểm tra lại lúc lưu. Tối đa 20 vị trí, không tự đẩy bài khác sang chỗ mới. Draft giữ chỗ ghim nhưng không hiện công khai; xóa mềm giải phóng chỗ, khôi phục bị từ chối nếu đã có bài khác chiếm chỗ đó. Highlight độc lập.
4. Trong form thường, xác nhận không còn “Nguồn phát phim / nhạc cũ”. Hai mục “Thông tin nội dung / file” và “Liên kết ngoài / media nâng cao”, liên kết tải ngoài, chọn file Drive vẫn còn. Nguồn phát đã lưu không bị xóa khi sửa bài.
5. Bấm vùng dán dưới ảnh bìa/gallery rồi Ctrl+V. Thử ảnh chụp Win+Shift+S hoặc Copy Image trong Chrome/Edge. Bìa nhận một ảnh; gallery tối đa 12. Dán thay bìa đang có cần xác nhận. Gỡ ảnh chỉ thay đổi form, không xóa ảnh cũ trên ổ đĩa. Lưu bài để cập nhật đường dẫn. Bìa album dùng cùng cách; file picker vẫn dùng được.
6. Trong Giới thiệu hoặc Hướng dẫn, chọn chữ và Ctrl+B, Ctrl+I hoặc Ctrl+K. Toolbar giữ selection. Nhấn lại B/I để bỏ định dạng; khi không chọn chữ, caret nằm giữa dấu Markdown. Ctrl+K cũng sửa URL khi caret nằm trong liên kết có sẵn. Undo/Redo và dán văn bản vẫn hoạt động. Nút Xem trước trong toolbar chỉ xem editor đó; nút Xem trước ở cuối form xem cả bài. Cấu hình tối thiểu/khuyến nghị vẫn là văn bản thuần như trước.
7. Chạy `npm.cmd test`, `npm.cmd run test:browser`, `npm.cmd run export`. Kiểm tra bản tĩnh bằng trình xem trước xuất bản hiện có, chọn TẤT CẢ nếu muốn xem mọi danh mục. Chưa xác nhận đăng cập nhật khi chưa duyệt xong. Hoặc dùng `Update-IVAN-Code.cmd`, xem đầy đủ thay đổi rồi mới xác nhận theo quy trình cũ.

## Phạm vi thay đổi

- Bộ lọc, URL/lịch sử: `js/main.js`.
- Card: CSS Grid/Flexbox, ảnh 16:10, tiêu đề tối đa 3 dòng, mô tả 4 dòng. Chỉ cắt phần hiển thị, không cắt dữ liệu hoặc nội dung trang chi tiết.
- Ghim: `server/database.js`, helper `js/data.js`; tái sử dụng cột và API hiện tại, không migration. Không tạo khu vực nổi bật riêng.
- Form thường: `admin/editor.html`, `admin/admin.js` bỏ đúng khối nguồn phát cũ và không gửi trường nguồn phát khi lưu; backend giữ giá trị cũ.
- Tàn lửa: `index.html`, `css/style.css`. Desktop thông thường 56 → 68, màn hình lớn 64 → 76, mobile 20 → 24; chu kỳ cũ chia 1,15. Tám quỹ đạo có thêm biến độ lệch gió, kích thước/độ trễ khác nhau; giữ màu, opacity, lớp nền, footer glow, reduced-motion và tạm dừng khi tab ẩn.
- Clipboard: module mới `admin/clipboard-images.js`, dùng lại upload ảnh trong `admin/editor.js` và `admin/music-editor.js`; `admin/admin.css` chỉ thêm style vùng dán/preview. Album có nút gỡ ảnh bìa. Không đọc clipboard nền hoặc tải URL/HTML trong clipboard.
- Markdown: `admin/editor.js`, `js/markdown.js`; thêm italic và phím tắt theo từng editor. Dùng cơ chế chèn văn bản giữ undo của Chromium; không thêm thư viện rich-text. HTML được escape, liên kết chỉ cho giao thức an toàn. Bộ kiểm tra chữ ký ảnh/Sharp/WebP, OAuth và CSRF phía server không đổi.
- Cập nhật version asset ở các trang/module liên quan và bổ sung lệnh kiểm thử trong `package.json`. Export tiếp tục sao chép source sang `docs/`; các ảnh công khai mới trong `docs/uploads/` là bản sao từ dữ liệu Published hiện có.

## Kiểm thử và giới hạn

- Kiểm thử bằng Edge headless trên Windows, desktop và mobile viewport: bộ lọc/URL/Back, 20 bài ghim và xung đột, chiều cao card/nút cuối cùng hàng, phóng chữ 150%, không tràn ngang, reduced-motion, editor, undo/redo, upload, album, liên kết Drive/ngoài, Highlight, tìm kiếm, góp ý và xuất bản giả lập.
- Clipboard ảnh được mô phỏng bằng `ClipboardEvent` chứa PNG thật, nhiều ảnh, file giả PNG, SVG và file quá 5 MB. Dán văn bản dùng clipboard API và Ctrl+V thật trong trình duyệt. Chưa thao tác trực tiếp giao diện Win+Shift+S/Copy Image của người dùng; cần kiểm tra thủ công hai thao tác này trên máy đang sử dụng.
- OAuth/Drive/Google Form trong browser test dùng fixture, không xác thực bằng tài khoản Google thật hoặc gửi phản hồi/tải file thật. Fixture OAuth giữ kiểm tra 302/state và điều hướng khác origin, không gọi Google thật. Backend vẫn kiểm tra session Google, email, CSRF, Host/Origin.
- Mẫu hiệu năng headless 3 giây sau khi tải: trước/sau không phát sinh layout trong lúc nền chạy; main-thread task desktop khoảng 8/17 ms và mobile 6/10 ms trên mẫu đo này. Đây không phải số FPS, Lighthouse hay kết luận về GPU/điện thoại thật. CLS toàn giai đoạn khởi động có dao động do nội dung JSON/Highlight tải bất đồng bộ; không dùng mẫu này để khẳng định CLS toàn trang bằng 0. Không thêm canvas, dependency, font, CDN hoặc request mạng cho animation.
- Database thật giữ schema 14, không thay đổi bài viết, liên kết, ảnh gốc hoặc credentials. Export đọc database, không yêu cầu phiên Google trên trình duyệt. Hai CMD không sửa. Git index và các thay đổi có sẵn được giữ nguyên; không commit, push hoặc deploy trong đợt này.

## File kiểm thử

Mới: `tests/refinements-browser.mjs`. Mở rộng `tests/pins.test.js`, `tests/cms.test.js`; cập nhật kỳ vọng trong `tests/cms-browser.mjs`, `tests/features-browser.mjs`, `tests/music-browser.mjs`, `tests/stage8-browser.mjs`, `tests/publish-browser.mjs`, `tests/local-oauth-browser.mjs` cho bộ lọc mới, không phát nhạc, số hạt mới và fixture OAuth không truy cập mạng thật. Kết quả: 90/90 backend và 8/8 browser qua; export thật có 10 bài Published. Bộ kiểm tra chỉ đọc của updater cũng chấp nhận source/docs mới. Ảnh chụp/mẫu đo cục bộ nằm trong `test-artifacts/` đã được Git ignore.
