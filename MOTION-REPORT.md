# Giai đoạn 7 — Chuyển động website công khai

## Phạm vi và file

Chỉ sửa frontend gốc: `index.html`, `css/style.css`, `js/main.js`. Body trang chủ có class `public-site`; mọi selector motion mới trong CSS dùng class này. Admin không có class và không nạp main.js, nên không nhận các hiệu ứng mới. Kiểm thử so sánh hash toàn bộ admin/, server/, scripts/, .env, SQLite, hai CMD, package.json và package-lock.json với trước thay đổi: giữ nguyên. Các chỉnh sửa có sẵn trong .env.example trước đợt này không bị sửa hoặc hoàn nguyên.

`npm.cmd run export` dùng exporter hiện có để cập nhật `docs/index.html`, `docs/css/style.css`, `docs/js/main.js`. Không sửa backend, schema, OAuth, launcher hoặc dependency. Test mới ở `tests/public-motion.mjs`; số đo và ảnh chụp lưu trong test-artifacts/ được gitignore.

## Hiệu ứng giữ lại

- Hover/press nút nhỏ, dùng transform; focus bàn phím giữ outline rõ. Hover nâng card 4 px, ảnh bìa zoom 1.025 trên thiết bị có chuột/fine pointer; touch không bị hover giả.
- Search chuyển màu/viền nhẹ. Danh mục cập nhật aria-pressed trên nút đang có, không phá DOM và focus của nút; kết quả thay ngay, không chờ hiệu ứng ra/vào hoặc loading giả.
- Hero và tiêu đề chi tiết vào nhẹ 230 ms, dịch 6–8 px từ opacity 0.92. Nội dung không bị ẩn mặc định, nút tải không chờ animation. Nếu thiếu Web Animations API hoặc JS lỗi, nội dung HTML vẫn nhìn thấy.
- Google Form dialog dùng native dialog, opacity/transform và discrete display/overlay transitions nếu trình duyệt hỗ trợ. Đóng dialog và trả focus diễn ra ngay qua API native; không setTimeout trì hoãn thao tác. Trình duyệt cũ có thể đóng tức thì thay vì transition.
- Hai radial gradient rất mờ, tối đa 360 px và 320 px, không blur/filter. Desktop phù hợp chỉ dịch transform 24–26 px trong 46–58 giây; không thay gradient mỗi frame. Không cần ảnh/font/icon/request mới.
- Mobile dưới 1024 px, touch, CPU tối đa 4 luồng, deviceMemory tối đa 4 GB hoặc saveData dùng nền tĩnh. Đây là heuristic khi trình duyệt có cung cấp thông tin, không phải phép đo GPU. Reduced-motion tắt chuyển động không thiết yếu; visibilitychange tạm dừng nền và hủy entrance còn chạy khi tab ẩn.

Không thêm dropdown/menu mới. Những control hiện có giữ native behavior; không sửa dropdown hay dialog Admin.

## Hiệu ứng đã bỏ

Đã thử reveal IntersectionObserver một lần cho card, cả dịch chuyển + opacity và bản opacity-only. Dù không có long task, bài cuộn ghi nhận thêm 11–12 lượt layout, CPU main-thread khoảng 22–34 ms thay vì 5–7 ms. Bản cuối bỏ reveal/observer, không có scroll listener hoặc parallax. Không sử dụng video, GIF, particles, backdrop-filter toàn màn hình, blur animation, box-shadow animation hay will-change tràn lan.

## Đo kiểm thực tế

Edge **156.0.4314.50 headless** trên Windows, desktop 1440×1000 và mobile emulation 390×844 có touch. Cùng fixture 24 bài Published, trong đó 2 bài ghim, không ảnh tải ngoài. Mỗi thiết bị 3 lượt context mới trước và sau. CDP Performance.getMetrics đo TaskDuration (thời gian CPU main-thread), không phải FPS. Một cửa sổ idle 1,4 giây, sau đó 12 bước cuộn × 260 px với khoảng cách 35 ms và chờ ổn định 350 ms. PerformanceObserver ghi long task và CLS. Không CPU/network throttling.

Trung vị lượt đo cuối trước/sau:

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Desktop: TaskDuration trong idle 1,4 s | 1,16 ms | 2,37 ms |
| Desktop: TaskDuration bài cuộn khoảng 0,8 s | 4,69 ms | 7,63 ms |
| Mobile: TaskDuration trong idle 1,4 s | 1,32 ms | 1,46 ms |
| Mobile: TaskDuration bài cuộn khoảng 0,8 s | 6,85 ms | 7,15 ms |
| LayoutCount trong bài cuộn, cả hai viewport | 0 | 0 |
| Long task quan sát được trong mỗi lượt | 0 | 0 |
| Request ban đầu, cùng fixture | 10 | 10 |
| CLS desktop fixture | 0,3031 | 0,3031 |
| CLS mobile fixture | 0 | 0 |

CLS desktop đã có từ trước khi dữ liệu bài ghim được chèn bất đồng bộ phía trên danh sách. Trung vị không tăng; một mẫu sau đạt 0,3111 so với 0,3031 ở các mẫu baseline có shift. Đợt này không sửa lại layout tải bài. Không được suy từ bảng trên rằng CLS production bằng 0 hoặc hoàn toàn bất biến.

Playwright quan sát card sẵn sàng ở trung vị 75,8 → 82,7 ms desktop và 76,3 → 79,2 ms mobile; đây không phải LCP hay TTI. FCP đọc được ở 2/3 lượt desktop là 52/52 ms trước, 52/60 ms sau; mobile 52/56/56 ms trước và 52/52 ms ở 2/3 lượt sau. Các lượt chưa có paint entry được ghi null, không thay bằng 0. Sai khác vài ms trong benchmark local này không đủ để kết luận cải thiện hoặc bảo đảm không ảnh hưởng Core Web Vitals.

| File | Trước (raw / gzip tại máy) | Sau (raw / gzip tại máy) |
|---|---:|---:|
| CSS | 11.831 / 3.447 byte | 15.471 / 4.264 byte |
| JS main | 5.379 / 2.292 byte | 6.926 / 2.898 byte |

Tổng thêm 5.187 byte raw, 1.423 byte gzip tại máy; không phải phép đo cấu hình nén thật của GitHub Pages. Không dependency mới.

## Kiểm thử và giới hạn

Test đi qua trang chủ, tất cả danh mục, tìm kiếm, ghim không trùng, chi tiết, nút tải thực sự bằng file giả lập (không tải file Drive thật), Google Form iframe giả lập, Escape/focus dialog, mobile overflow, touch hover, reduced-motion, weak-device heuristic, visibilitychange và nội dung hero khi JavaScript bị tắt. Không có pageerror. Có so sánh computed style của một probe không mang public-site để kiểm tra CSS không ảnh hưởng Admin.

Không chạy Lighthouse, không đo FPS/GPU/VRAM/điện năng hay thiết bị iPhone vật lý. Background state được kiểm thử bằng mô phỏng visibilitychange, không phải benchmark tab Windows ẩn thực tế. Headless và một fixture local không đại diện mọi bài viết/ảnh/mạng/thiết bị. Nếu máy thực tế vẫn nóng/giật, có thể bỏ class ambient-motion hoặc các rule keyframe để giữ nền tĩnh mà không ảnh hưởng chức năng.

Chạy `node --test tests/public-motion.mjs` để kiểm thử hiện tại và ghi motion-after.json. Nếu có motion-before.json cùng máy trong test-artifacts/, test so sánh thêm số request, Admin probe và hash file bảo vệ. Để đo một baseline mới đúng nghĩa, chạy bản chưa sửa với `IVAN_MOTION_BASELINE=1`; không dùng bản đã sửa làm baseline của chính nó.
