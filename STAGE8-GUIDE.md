# Giai đoạn 8 — Spotlight, metadata và phát media

## Mở sau khi cập nhật

Tắt cửa sổ Admin cũ bằng Ctrl+C, mở lại **IVAN-Admin.cmd** và đăng nhập Google như trước. Backend mới có schema nội dung 9; form mới không lưu với backend cũ để tránh làm mất trường mới. Hai CMD, redirect URI, Google Client ID/Secret và scope Admin/Drive giữ nguyên. Migration tạo backup được kiểm tra integrity và fingerprint toàn bộ bảng trước khi thay đổi database cũ.

## Spotlight

Trong danh sách bài viết có nút **Spotlight/Bỏ Spotlight**, hoặc dùng ô **Spotlight chính đầu trang** trong form. Tối đa một bài chưa xóa được đánh dấu, kể cả Draft. Nếu muốn chọn bài khác, bỏ Spotlight ở bài đang giữ trước. Thao tác chọn tự ghim bài, vẫn chịu giới hạn 5 bài ghim; bỏ Spotlight giữ nguyên ghim, bỏ ghim sẽ tắt Spotlight.

Chỉ Published mới hiện ở Spotlight; Draft/bài xóa không được đưa ra trang chủ hoặc JSON. Khôi phục bài cũ có thể bị từ chối nếu làm vượt giới hạn ghim hoặc đụng Spotlight đang có, không tự bỏ ghim bài khác. Các bài ghim còn lại nằm ở Nội dung nổi bật, không lặp bài Spotlight trong danh sách. Khi tìm kiếm/lọc danh mục, bài Spotlight tham gia kết quả như bài ghim thông thường, không che kết quả tìm kiếm. Không có Spotlight thì trang chủ dùng hero ban đầu; không chọn bài ngẫu nhiên.

Dùng ảnh bìa tải từ máy để có WebP responsive 640/960/1440 px tự sinh ở images/spotlight-UUID-WIDTH.webp trong bản xuất. Không xóa hoặc sửa ảnh gốc. Export ghi sẵn HTML Spotlight Published vào index.html để tiêu đề/ảnh quan trọng không phải đợi JSON hoặc JavaScript. Ảnh hero có kích thước vùng hiển thị cố định, eager và fetchpriority=high; không dùng video nền. Với URL ảnh ngoài, ứng dụng không proxy/resize nguồn đó; Admin nên chọn ảnh có dung lượng phù hợp mobile.

## Thông tin file / nội dung

Trong form, mở **Thông tin nội dung / file (tùy chọn)**. Trường hiển thị theo danh mục:

- Ứng dụng: phiên bản, OS, dung lượng thủ công, nhà phát triển, ngày cập nhật nội dung, định dạng.
- Game: phiên bản, nền tảng, dung lượng, thể loại, cấu hình. Hướng dẫn cài đặt vẫn ở phần Markdown hiện có.
- Phim: năm, thời lượng, chất lượng, định dạng, dung lượng, ngôn ngữ/phụ đề.
- Nhạc: nghệ sĩ, album, thời lượng, định dạng, dung lượng.
- Khác: loại file, dung lượng, mô tả bổ sung.

Không cần điền mọi trường. Nội dung trống bị ẩn; không có hàng loạt Unknown. Không suy đoán phiên bản/OS/năm/chất lượng từ tên file. Metadata thủ công được giữ khi chỉnh sửa bằng client cũ không gửi trường này. Khi đổi danh mục, chỉ các khóa phù hợp được xuất công khai; dữ liệu đã nhập ở nhóm khác vẫn giữ trong SQLite.

Tên, MIME, dung lượng và ngày file được lấy từ các file Drive đã gắn và được xác nhận công khai. Dung lượng hiển thị theo B/KiB/MiB/GiB/TiB. Nếu nhiều file có đủ size thì hiển thị tổng, đồng thời giữ thông tin từng file; không cộng khi thiếu dữ liệu. Số liệu thủ công có nhãn Admin cung cấp. File Restricted/chưa xác nhận không được dùng làm metadata công khai. Ngày cập nhật bài ở sidebar khác với ngày cập nhật file/nội dung.

## HTML5 video và audio

Chọn danh mục Phim hoặc Nhạc → mở **Nguồn phát phim / nhạc** → **Thêm nguồn phát**:

1. Chọn **HTML5 trực tiếp**; nhập tên dễ nhận biết và URL HTTPS trỏ trực tiếp đến nội dung media bạn có quyền nhúng/phân phối.
2. Chọn MIME chính xác: video/mp4, video/webm hoặc video/ogg cho Phim; audio/mpeg, audio/mp4, audio/ogg, audio/wav, audio/flac hoặc audio/webm cho Nhạc. Không suy ra MIME/codec từ tên file; kiểm tra nguồn thực tế.
3. Bật ô xác nhận quyền chia sẻ/nhúng công khai. Nếu không bật, nguồn chỉ được lưu trong Admin, không xuất ra JSON.
4. Có thể thêm tối đa 10 nguồn. Lưu bài rồi export/đăng cập nhật theo quy trình hiện có.

URL tải Google Drive không phải URL stream HTML5, nên không được nhập làm nguồn trực tiếp. Các URL có access_token/refresh_token/id_token/client_secret/oauth_token bị từ chối. URL media cũ trong phần nâng cao vẫn được hỗ trợ theo category và tải theo cú bấm; URL Drive cũ không bị đưa vào video/audio. Không dùng nguồn chứa credential hay URL hết hạn nếu muốn hoạt động ổn định trên GitHub Pages.

Website chỉ tạo video/audio khi khách chọn nguồn và bấm Phát. controls, preload=none, không autoplay; lời gọi play xuất phát từ cú bấm của khách. Native browser controls cung cấp play/pause, tiến trình, âm lượng và fullscreen theo thiết bị/trình duyệt. Audio hiển thị tiêu đề/nghệ sĩ/ảnh bìa khi có. Chuyển nguồn/rời trang sẽ dừng nguồn cũ; không tải các nguồn đồng thời. Có MIME không được browser hỗ trợ thì nút phát bị vô hiệu hóa và hướng dẫn tải/mở. Lỗi codec/quyền/mạng sẽ gỡ player bị lỗi và giữ các nút tải/mở.

Mỗi nguồn còn có liên kết Mở nguồn trực tiếp hoặc Xem trên Google Drive. Nhờ vậy nguồn media không kèm attachment vẫn có cách mở riêng; nút tải file chỉ xuất hiện khi thực sự có liên kết tải phù hợp, không tạo download giả.

## Google Drive preview và giới hạn

1. Chọn file Drive trong form như trước, xác nhận quyền chia sẻ công khai phù hợp sau khi kiểm tra quyền trên Drive. Ứng dụng không tự đổi sharing.
2. Thêm nguồn **Google Drive preview**, nhập link View/Preview của đúng file đã gắn; ví dụ `https://drive.google.com/file/d/FILE_ID/preview?resourcekey=RESOURCE_KEY`. Chỉ dùng link preview/Embed item do Drive cung cấp, không nhập HTML iframe hoặc endpoint nội bộ.
3. Bật xác nhận quyền nhúng. Backend chỉ xuất nguồn này khi file đã liên kết, được xác nhận công khai, sharing_access=anyone và MIME phù hợp video/audio. resourceKey được giữ, ưu tiên metadata đã xác minh.
4. Khách phải bấm **Xem bản xem trước Drive** mới tạo iframe. Chỉ chấp nhận host drive.google.com và đường dẫn file canonical. Đây là UI preview của Google, không có cam kết tương đương HTML5 player.

Drive có thể yêu cầu đăng nhập/cookie, giới hạn băng thông hoặc từ chối preview/phát vì codec/quyền. Iframe cross-origin không cho website kiểm tra nội dung bên trong; website không tuyên bố phát thành công chỉ vì frame load. Nút **Xem trên Google Drive** và tải riêng từng file luôn là phương án dự phòng. Không vượt xác nhận/quét virus/quyền truy cập hoặc chuyển link download thành stream. Nếu gỡ file Drive khỏi bài, cần gỡ nguồn preview đang trỏ đến nó trước khi lưu.

Tài liệu nguồn: [Drive Files: webViewLink/webContentLink](https://developers.google.com/workspace/drive/api/reference/rest/v3/files), [tải file Drive](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [HTML media controls và preload](https://html.spec.whatwg.org/multipage/media.html). Iframe thử nghiệm dùng nguồn mock; chưa kiểm chứng một file phim/nhạc Drive thật của bạn vì chưa có file thử loại này.

## Xuất bản và kiểm thử

`npm.cmd run export` vẫn xuất JSON Published và tài nguyên công khai sang docs/, giữ đường dẫn /IVAN-Base-Drive/. Không xuất Draft, bài xóa, phản hồi/email hộp góp ý, trạng thái xử lý, token hoặc SQLite. Không tự commit/push; dùng nút đăng website hoặc Update-IVAN-Code.cmd sau khi xem trước và xác nhận.

Kiểm thử mới: spotlight.test.js, content-metadata.test.js, media-sources.test.js và stage8-browser.mjs. Browser test tạo video WebM tĩnh và audio WAV im lặng của riêng test, xác nhận browser decode/phát thật, pause/seek/volume, không request media/Drive trước cú bấm, source switch/cleanup, lỗi 404, iframe mock, metadata và form Admin, responsive images, fallback hero, Draft/deleted không xuất hiện, reduced-motion, mobile overflow và console errors. Không dùng media có bản quyền từ nguồn ngoài và không gửi token Google thật trong test.

## Các file triển khai

- Frontend công khai: index.html, css/style.css, js/main.js, js/content.js, js/data.js, js/media.js, js/markdown.js; các bản tương ứng được export sang docs/ và docs/content/posts.json.
- Dữ liệu/form Admin: admin/admin.js, admin/dashboard.js, admin/editor.html, admin/index.html, admin/admin.css. Chỉ thêm control dữ liệu và cache version, không thiết kế lại Dashboard.
- Backend/export: server/database.js, server/posts.js, server/public-post.js, server/media.js, server/app.js, server/local-runtime.js, scripts/export-static.mjs.
- Kiểm thử: các file mới nêu trên, tests/trash.test.js (fixture migration cập nhật theo index mới), package.json (thêm browser test).
- Hướng dẫn: STAGE8-GUIDE.md, README.md. Không sửa .env hoặc hai CMD; thay đổi .env.example có sẵn trước đợt này được giữ nguyên.
