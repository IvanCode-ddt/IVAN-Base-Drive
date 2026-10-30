# IVAN Base Drive — Giai đoạn 3B

## Ghim bài viết và Hộp góp ý

Ghim tối đa 5 bài trong Admin, đặt thứ tự ưu tiên bằng số; chỉ Published xuất hiện ở Nội dung nổi bật. Website có nút Gửi góp ý mở Google Form chính thức. Hộp góp ý local có adapter Sheets riêng chỉ đọc, mặc định tắt cho đến khi bạn cấu hình quyền hợp lệ; không mở rộng OAuth scope Admin/Drive.

Xem [FEEDBACK-SETUP.md](FEEDBACK-SETUP.md) để hoàn tất Form/Sheet, thiết lập service account và sử dụng bộ lọc/trạng thái. SQLite migration tự tạo backup được kiểm tra trước khi thay đổi schema. Không có thao tác tự push.

## Giai đoạn 6 — Google Admin bắt buộc, vận hành local

Mở `IVAN-Admin.cmd` → `/admin` → đăng nhập Google đúng `ADMIN_EMAIL`. `LOCAL_ADMIN_MODE` đã bị loại khỏi đường cấp quyền; đặt true cũng không bỏ được đăng nhập. Server vẫn chỉ bind `127.0.0.1`; session Google hết hạn hoặc logout phải đăng nhập lại. Callback Google giữ xử lý chống lỗi LOCAL_ONLY.

`Update-IVAN-Code.cmd` vẫn export và cập nhật source/docs sau khi xem danh sách và nhấn Y, độc lập với phiên Google. Nó không tắt/khởi động server, không đổi session hoặc credential; chỉ nhắc restart thủ công nếu backend thay đổi. Hướng dẫn đầy đủ: [WINDOWS-ADMIN.md](WINDOWS-ADMIN.md).

## Giai đoạn 5A — Đăng cập nhật GitHub Pages từ Admin

Chạy server bằng `npm.cmd start`, đăng nhập tại `http://localhost:3000/admin/`. Khu vực **Xuất bản website** được bổ sung gọn phía trên danh sách bài viết. Không có thao tác Git tự động khi chỉ lưu nháp hoặc xuất bản một bài.

### Cách dùng

1. Hoàn tất nội dung Published và xác nhận quyền chia sẻ của các file Drive cần công khai.
2. Nhấn **Đăng cập nhật lên website**. Server kiểm tra Git/remote, gọi lại chính hàm export mà `npm.cmd run export` sử dụng và tạo bản nháp tĩnh trong `data/publish-previews/`.
3. Xem iframe của đúng snapshot JSON vừa xuất, danh sách file thêm/sửa/xóa và danh sách bài Published. Source ngoài docs/ đang sửa hoặc đã stage được giữ nguyên và hiển thị cảnh báo số lượng.
4. Đánh dấu **Tôi đã xem bản cập nhật…**, rồi nhấn **Xác nhận đăng cập nhật**. Trước bước này không stage, commit hoặc push.
5. Theo dõi tiến trình kiểm tra → export → xác minh → stage docs/ → commit → push. Thành công sẽ hiện commit ID và liên kết `https://ivancode-ddt.github.io/IVAN-Base-Drive/`.

Thông báo thành công xác nhận commit đã có trên remote, **không khẳng định GitHub Pages đã build xong**. Pages có thể cần vài phút để cập nhật. Nếu không có thay đổi, giao diện báo **Website đã ở phiên bản mới nhất**, không tạo commit rỗng.

### Điều kiện Git trên Windows

- Repository phải ở nhánh `main`, có HEAD hợp lệ và origin HTTPS đúng `https://github.com/IvanCode-ddt/IVAN-Base-Drive.git`.
- `main` local phải bằng remote main trước khi bắt đầu. CMS dùng `ls-remote` để kiểm tra, không tự fetch/pull/merge/rebase/force push. Local ahead/remote ahead/conflict đều cần bạn xử lý thủ công.
- Git user.name/user.email cần được cấu hình; CMS không lấy email tác giả từ ADMIN_EMAIL.
- Git Credential Manager cần đăng nhập sẵn. CMS không nhập, lưu hoặc trả GitHub token. Nếu chưa đăng nhập, mở terminal Windows và chạy `git credential-manager github login`, hoàn thành đăng nhập rồi thử lại. Backend không tự mở hộp đăng nhập tương tác.
- Source ngoài docs/ chưa commit, kể cả đã stage, không bị đưa vào commit xuất bản. Nếu docs/ đã được stage từ trước, CMS dừng để bảo toàn staging đó; xử lý thủ công trước khi thử lại.

### Phạm vi commit và kiểm tra dữ liệu

Chỉ quản lý các đường dẫn: docs/index.html, .nojekyll, content/posts.json, CSS công khai, danh sách module JS công khai cố định, ảnh raster trong docs/images/ và ảnh UUID WebP trong docs/uploads/. Không dùng `git add .`. Đường dẫn stage gửi riêng qua stdin NUL-delimited, với literal pathspec; commit dùng `--only` để không lấy source đã stage. Git hooks/signing được tắt riêng cho commit tự động này, không sửa cấu hình Git toàn cục. Nếu chính sách GitHub bắt buộc chữ ký hoặc PR, push có thể bị từ chối và cần xử lý theo chính sách đó.

Commit được đối chiếu parent và phạm vi file trước push. Push dùng đúng commit SHA đã tạo tới refs/heads/main (không dùng một HEAD có thể vừa bị tiến trình khác đổi), không có force. Các file Markdown báo cáo không nằm trong allowlist tự stage; file lạ/symlink hoặc thao tác Git chưa hoàn tất khiến CMS dừng.

Validation đối chiếu JSON với projection công khai từ SQLite hiện tại, loại Draft/deleted/file chưa xác nhận/Restricted, kiểm tra schema/đường dẫn và các giá trị secret/email admin hoặc mẫu credential trong tài nguyên văn bản. Nếu nội dung thay đổi sau khi xem trước, phải tạo preview mới. Token Google/GitHub không được đưa vào frontend, JSON public hoặc SQLite. Việc xuất bản không gọi API đổi quyền Drive.

### Khi lỗi và thử lại

| Tình huống | Cách xử lý |
| --- | --- |
| Chưa xác thực GitHub | Đăng nhập GCM trong terminal Windows rồi thử lại |
| Mất mạng | Kiểm tra mạng/proxy/tường lửa; không force push |
| Remote có commit mới / conflict | Dừng; tự đồng bộ và xử lý Git, sau đó tạo preview mới |
| Push bị từ chối / nhánh được bảo vệ | Kiểm tra quyền và chính sách nhánh; commit local được giữ |
| Commit đã tạo nhưng push chưa thành công | Nhấn nút xuất bản để xem lại và thử push cùng commit, không tạo commit trùng; giữ nội dung ổn định trong lần thử lại |
| Dữ liệu đổi trong lúc có commit chờ push | CMS dừng; xử lý commit/chênh lệch thủ công, không tự reset lịch sử |
| Staged docs/ hoặc Git index.lock | Kiểm tra trong terminal; không xóa lock khi tiến trình Git còn chạy |

Trạng thái lưu trong `data/publish-state.json`; khóa chạy là `data/publish.lock`. Tất cả nằm trong data/ đã bị Git bỏ qua. Có khóa trong bộ nhớ và file lock để chỉ một tiến trình hoạt động. Nếu server bị tắt đột ngột và để lại publish.lock, chỉ xóa **riêng file lock** sau khi xác nhận không còn tiến trình xuất bản. Không xóa database, trạng thái commit pending hoặc thư mục .git để xử lý lỗi.

Preview có hạn 15 phút, ràng buộc với session Admin. Khi tạo preview mới, preview cũ của cùng session bị thay thế. API yêu cầu ADMIN_EMAIL, CSRF, Origin, kết nối loopback, đúng Host local và không qua proxy; NODE_ENV=production vô hiệu hóa chức năng. Server vẫn bind localhost; không đưa tính năng này lên hosting, tunnel hoặc reverse proxy Internet.

### Kiểm thử không push thật

```powershell
npm.cmd test
npm.cmd run test:browser
```

Test Git tạo repository tạm để kiểm tra commit/docs/index thật; toàn bộ ls-remote/push được mô phỏng, không gọi mạng hoặc git push thật. Test browser dùng publisher giả lập và kiểm tra preview/xác nhận/progress trên Edge desktop/mobile. Không commit hoặc push repository dự án trong kiểm thử. Chức năng chỉ chạy thật khi bạn xác nhận trong Admin.

## Bản sửa dashboard, file tải và Thùng rác

Xem `docs/admin-fix-report.md` để biết nguyên nhân, dữ liệu đã kiểm tra và luồng A/B/C. Dashboard tại `/admin/`; tạo/sửa bài tại `/admin/editor.html`; Thùng rác tại `/admin/#trash`.

Trong form, chọn file và đánh dấu xác nhận công khai cho từng file có quyền Anyone. Lưu bài một lần để ghi nội dung, liên kết và xác nhận trong cùng transaction. Restricted luôn bị ẩn khỏi dữ liệu công khai. File chưa xác nhận vẫn có trong API quản trị và xem trước quản trị, không phải bị mất. Backend phiên bản cũ bị form từ chối để tránh hợp đồng lưu không khớp.

Trước migration thêm `deleted_at`, ứng dụng tự tạo/kiểm tra backup trong `data/backups/`; lỗi backup thì không migration. Có thể tạo bản sao thủ công bằng `node --env-file-if-exists=.env scripts/backup-db.mjs`. Không đưa backup lên GitHub. Sau thay đổi Published/Draft, xóa hoặc khôi phục, chạy lại `npm.cmd run export` để cập nhật bản tĩnh. Slug trong Thùng rác vẫn được giữ để khôi phục; muốn tái dùng slug phải đổi slug hoặc xóa vĩnh viễn bài cũ sau xác nhận.

## Giai đoạn 4A — CMS local

### Luồng file đính kèm đã sửa

Tạo bài mới → chọn ảnh/nội dung → **Chọn từ Google Drive** → chọn nhiều file trong modal → **Xác nhận** → **Lưu bản nháp** hoặc **Xuất bản / cập nhật** một lần. Không cần tạo Draft trước để có ID bài viết.

Modal chỉ duyệt thư mục, breadcrumb, phân trang, tìm tên trong các file/trang đã duyệt và chọn nhiều file. Không có dropdown chọn bài khác, nút tạo Draft hoặc thao tác gắn file ngay. Hủy/đóng/Escape bỏ lựa chọn mới của modal; lựa chọn đã xác nhận chỉ nằm trong bộ nhớ form. Gỡ từng file cũng chỉ là thay đổi tạm. Khi bỏ bài chưa lưu, không tạo bài hoặc quan hệ trong SQLite.

POST/PUT bài viết nhận `drive_file_ids` (tối đa 50, không trùng). Server lấy metadata và kiểm tra ancestry/quyền truy cập bằng Drive service hiện có, sau đó lưu bài cùng toàn bộ danh sách liên kết trong transaction. Lỗi Drive từ chối trước khi ghi; lỗi SQLite rollback cả bài lẫn liên kết. API cũ không gửi trường này vẫn giữ liên kết cũ. Danh sách rỗng có nghĩa gỡ tất cả liên kết sau khi lưu.

Sửa bài sẽ điền sẵn file đã gắn. File giữ lại bảo toàn xác nhận chia sẻ hiện có; file mới mặc định chưa xác nhận, kể cả khi bài được Published. Việc chọn file không thay quyền Google Drive hoặc tự bật công khai. Trang **Kho Google Drive** độc lập tại `/admin/drive-library.html` tiếp tục dùng cho quản lý kho/xác nhận chia sẻ, không còn nhúng trong form. Mọi API và trang này vẫn dùng ADMIN_EMAIL, session, CSRF và OAuth callback cũ.

Upload ảnh vẫn diễn ra riêng khi chọn ảnh; ảnh chưa dùng có thể còn trong kho uploads local như trước. Chỉ bài và các liên kết Drive được ghi cùng lần lưu. Export giữ nguyên: chỉ Published và file đã xác nhận được đưa ra JSON. Không có migration/schema mới trong bản sửa UX này.

Không thay `.env`, OAuth hoặc schema SQLite. Bài viết/file liên kết cũ được giữ nguyên. Markdown lưu trong introduction/instructions hiện có; ảnh chỉ lưu trên filesystem, không lưu blob trong SQLite.

```powershell
npm.cmd install
npm.cmd start
# Trong terminal khác:
npm.cmd test
npm.cmd run test:browser
npm.cmd run export
```

Khởi động lại backend cũ để có route upload mới. Vào `/admin/`, tạo bài, nhập tiêu đề để tự tạo slug tiếng Việt. Khi sửa bài cũ, slug được giữ nguyên để không đổi URL; có thể chỉnh tay hoặc chọn “Tạo lại slug từ tiêu đề”. Nếu slug trùng, server yêu cầu chọn slug khác, không tự ghi đè bài.

Form gồm thông tin, Markdown, hình ảnh, Drive và liên kết ngoài nâng cao. Thanh công cụ hỗ trợ tiêu đề, in đậm, danh sách, liên kết HTTPS và chèn ảnh từ máy. Markdown là tập con có giới hạn; không hỗ trợ HTML nhúng, iframe, script hoặc Markdown tùy ý mở rộng. Cùng bộ renderer được dùng cho xem trước, website local và GitHub Pages. Mô tả ngắn vẫn là văn bản thuần.

Ảnh bìa, gallery và ảnh chèn Markdown đều upload bằng `POST /api/admin/images` với body nhị phân, session quản trị, Origin và X-CSRF-Token. Chỉ nhận JPEG/PNG/WebP tĩnh, tối đa 5 MB/ảnh và 16 triệu pixel. Server kiểm tra chữ ký, giải mã dữ liệu thật bằng Sharp, từ chối ảnh lỗi/truncated/SVG/file thực thi/ảnh động, rồi chuẩn hóa orientation, resize tối đa 2400×2400 và mã hóa lại WebP, bỏ metadata gốc. Tên và MIME do trình duyệt cung cấp không quyết định định dạng/tên lưu.

Ảnh được lưu tại `uploads/<UUID>.webp`, đường dẫn tương đối lưu trong bài. `/uploads/` bị Git bỏ qua. Admin xem ảnh Draft qua route `/admin/media/` có xác thực; route công khai `/uploads/` chỉ phục vụ ảnh được bài Published tham chiếu ở bìa/gallery/Markdown. Gỡ ảnh trong form chỉ gỡ tham chiếu, không xóa file gốc hoặc ảnh đang được bài khác dùng. Ảnh upload chưa lưu hoặc không còn dùng vẫn ở local; chưa có tính năng dọn kho tự động.

Form dùng modal chọn Drive ở trên. Trang quản lý kho độc lập tiếp tục hỗ trợ các thao tác quản lý tức thời; các thao tác đó không còn nằm trong luồng viết bài.

Export giữ nguyên `npm.cmd run export`: chỉ Published và file Drive đã xác nhận. Chỉ ảnh upload được các bài Published tham chiếu mới được chép vào `docs/uploads/`, giữ đường dẫn tương đối để chạy tại `/IVAN-Base-Drive/`. Ảnh chỉ thuộc Draft không được xuất. Khi export lại, ảnh upload không còn được tham chiếu bị gỡ khỏi bản docs, nhưng bản gốc local được giữ. Cần sao lưu cả SQLite **và uploads/** để phục hồi toàn bộ nội dung. Chỉ đưa bản public docs lên GitHub; không đưa kho uploads local lên Git.

Kiểm thử API dùng SQLite/ảnh tạm; kiểm thử browser chạy Edge headless có sẵn trên Windows và OAuth/Drive giả lập qua dependency test, không gọi tài khoản thật, không có route bỏ qua xác thực trong ứng dụng. `test:browser` cần Microsoft Edge; ảnh chụp desktop/mobile lưu trong `test-artifacts/` và bị Git bỏ qua. Không tự commit, push hoặc deploy.

## Xuất website tĩnh lên GitHub Pages

Express, OAuth, SQLite và Admin tiếp tục chạy local tại `http://localhost:3000`. Website GitHub Pages chỉ đọc snapshot JSON, không có đăng nhập quản trị hoặc API backend.

Sau khi thêm/sửa bài và xác nhận quyền chia sẻ file Drive trong Admin:

```powershell
npm.cmd run export
npm.cmd test
```

Lệnh export chỉ đọc database theo DATABASE_PATH trong `.env`, không cần đăng nhập OAuth, không gọi Google, không chạy migration và không sửa bài viết. Chỉ xuất Published cùng file Drive có sharing_confirmed=1; trường công khai dùng chung allowlist với API. Draft, email xác nhận, secret/token và metadata file chưa xác nhận không nằm trong snapshot.

Kết quả:

```text
docs/
  index.html
  .nojekyll
  content/posts.json
  css/style.css
  js/main.js, data.js, content.js, post-source.js
  images/...
```

**Cấu hình GitHub Pages cần dùng thư mục `/docs`:** vào repository → Settings → Pages → Deploy from a branch → chọn nhánh chứa source và `/docs`, rồi Save. Thao tác này do bạn thực hiện; script không commit, push hoặc deploy. Nếu Pages đang dùng root `/`, phải chuyển sang `/docs` hoặc tự cấu hình quy trình triển khai chỉ lấy thư mục docs. Các báo cáo Markdown đã có trong docs được giữ nguyên, không bị xóa.

Sau khi kiểm tra nội dung JSON và `git status`, bạn tự commit/push các file public được tạo/cập nhật trong docs theo quy trình Git của mình. Không thêm `.env`, database, node_modules hoặc credential. Không cần đưa backend lên dịch vụ khác. URL website có dạng `https://TEN-TAI-KHOAN.github.io/IVAN-Base-Drive/`; các đường dẫn CSS/JS/JSON đều tương đối, bài chi tiết dùng `#post/SLUG` để tải lại không bị 404.

Frontend dùng Express khi hostname là localhost/127.0.0.1/::1 và port 3000. Các địa chỉ khác (gồm GitHub Pages và preview tĩnh ở port khác) đọc `content/posts.json`. Không tự fallback sang dữ liệu tĩnh khi API local lỗi, tránh hiển thị nhầm bài cũ. Local Admin vẫn chỉ được bảo vệ bởi backend như trước; bản docs không chứa Admin.

Để xem thử bản tĩnh, dùng Live Server mở `docs/index.html` (port khác 3000), không mở bằng file://. Có thể kiểm tra nội dung/tài nguyên dưới đường dẫn `/IVAN-Base-Drive/` bằng bộ test đã cung cấp.

Mỗi lần thêm, sửa, xuất bản, chuyển thành Draft, ẩn hoặc gỡ liên kết file: chạy lại export và cập nhật docs trên GitHub. Bản GitHub Pages không tự đọc thay đổi SQLite. Export thay toàn bộ snapshot, vì vậy bài chuyển Draft hoặc file bỏ xác nhận sẽ biến mất ở snapshot mới. Sau khi Pages cập nhật, tải lại trang nếu trình duyệt còn cache. Dữ liệu từng được xuất công khai có thể vẫn tồn tại trong Git history/cache; không dùng snapshot cho nội dung bí mật.

Liên kết Drive vẫn do Google kiểm soát: không đổi quyền chia sẻ, không vượt cảnh báo tải. File cũ chưa có download_url vẫn dùng nút Xem trên Google Drive dự phòng.

Thư viện HTML/CSS/JavaScript dùng Express và SQLite. Tích hợp Google Drive API chỉ đọc metadata; không có React hoặc dữ liệu demo tự động. Giữ nguyên Git history; không cần reset hoặc tạo lại repository.

## Chạy trên Windows / PowerShell

Yêu cầu Node.js 24.15 trở lên (máy hiện tại 24.22.1). SQLite dùng module `node:sqlite` có sẵn, không cần cài SQLite hay công cụ biên dịch C++.

```powershell
npm.cmd install
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Mở `.env`, điền SESSION_SECRET bằng chuỗi vừa tạo; điền ADMIN_EMAIL, GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET. Không gửi secret qua chat hoặc thêm vào source.

Trong Google Cloud, OAuth Client phải thuộc loại **Web application**. Thêm Authorized redirect URI chính xác:

```text
http://localhost:3000/auth/google/callback
```

Nếu consent screen đang Testing, thêm ADMIN_EMAIL vào Test users. Yêu cầu `openid email` và `https://www.googleapis.com/auth/drive.metadata.readonly`. Bật Google Drive API trong cùng Google Cloud project.

```powershell
npm.cmd start
# Hoặc tự khởi động lại backend khi sửa source:
npm.cmd run dev
```

Mở http://localhost:3000 và http://localhost:3000/admin. Không chạy bằng file:// hoặc Live Server vì giao diện cần API cùng origin. Backend chỉ bind localhost. Cấu hình mặc định port 3000; nếu đổi port phải đổi BASE_URL và OAuth callback tương ứng.

Server từ chối khởi động khi thiếu cấu hình xác thực. SQLite tự tạo `data/ivan.sqlite` ở lần chạy đầu và database ban đầu rỗng. Không tự import bài demo cũ.

## Kiểm tra quản trị

1. Truy cập `/admin` khi chưa đăng nhập: chuyển đến `/login`.
2. Đăng nhập Google bằng ADMIN_EMAIL. Tài khoản khác bị từ chối phía server.
3. Tạo bài với tiêu đề, slug duy nhất, danh mục, mô tả và nội dung; chọn **Lưu bản nháp**.
4. Thư viện công khai chưa thấy bài nháp. Nhấn bài trong danh sách quản trị để sửa.
5. Chọn **Xem trước** để xem dữ liệu đang nhập, không lưu database. Giao diện xem trước dùng cùng bộ render với bài công khai.
6. Chọn **Xuất bản / cập nhật** rồi mở thư viện để kiểm tra. URL bài có dạng `/#post/slug`.
7. Sửa bài, xuất bản lại; hoặc chọn **Lưu bản nháp** để gỡ bài khỏi thư viện công khai.
8. Đăng xuất rồi gọi `/api/admin/posts`: nhận HTTP 401. Mở trực tiếp `/admin/admin.js` khi chưa đăng nhập cũng bị chặn.

Nội dung và hướng dẫn là văn bản thuần, giữ xuống dòng. HTML nhập vào chỉ được hiển thị như văn bản. Ảnh bìa, ảnh minh họa, media và file tải chỉ nhận URL HTTPS. Tối đa 12 ảnh; không hỗ trợ upload file trong bước này. URL ảnh/media được trình duyệt tải trực tiếp, vì vậy nội dung phải cho phép hiển thị bên ngoài và hỗ trợ định dạng trình duyệt. Các file Drive được gắn bằng Kho Google Drive; không tải nội dung file về server. Chỉ hiện liên kết mở trên Drive sau khi quản trị viên xác nhận quyền chia sẻ.

## API

| Route | Quyền | Chức năng |
| --- | --- | --- |
| GET /api/posts | Công khai | Danh sách published |
| GET /api/posts/:slug | Công khai | Chi tiết published; draft trả 404 |
| GET /api/admin/session | Quản trị | Email và CSRF token |
| GET /api/admin/posts | Quản trị | Danh sách cả nháp và xuất bản |
| GET /api/admin/posts/:id | Quản trị | Đọc bài để sửa |
| POST /api/admin/posts | Quản trị + CSRF | Tạo bài |
| PUT /api/admin/posts/:id | Quản trị + CSRF | Sửa và đổi trạng thái |
| POST /api/admin/preview | Quản trị + CSRF | Kiểm tra dữ liệu, không lưu |
| POST /api/admin/logout | Quản trị + CSRF | Hủy phiên |

Các API ghi yêu cầu JSON, header X-CSRF-Token từ session và Origin khớp BASE_URL. Giới hạn body 150 KB. Slug duy nhất; category và status theo allowlist. SQL dùng prepared statements. Có CSP, giới hạn tần suất đăng nhập, OAuth state/nonce/PKCE và kiểm tra Google ID token. Chỉ email đã xác minh khớp ADMIN_EMAIL được cấp session; session được đổi ID sau đăng nhập.

Session lưu trong bộ nhớ server, cookie HttpOnly/SameSite=Lax, hết hạn sau 8 giờ. Khởi động lại server sẽ cần đăng nhập lại, bài viết vẫn còn trong SQLite. Thiết kế hiện tại dành cho localhost; chưa triển khai production. Không lưu OAuth token lâu dài, không có secret trong localStorage.

## Kiểm thử

```powershell
npm.cmd test
```

Kiểm thử dùng SQLite tạm và Google OAuth giả lập trong dependency của test, không có endpoint bỏ qua đăng nhập trong ứng dụng. Bao gồm chặn admin, sai danh tính/state/nonce, CSRF, published/draft, validation, slug trùng, preview không lưu, XSS, lưu dữ liệu qua lần mở database và logout. Đăng nhập Google thực cần kiểm tra thủ công với OAuth Client của bạn; test không dùng tài khoản hoặc secret thật.

## Git và dữ liệu

`.gitignore` loại trừ `.env`, node_modules, data/, database SQLite và file WAL/SHM. `.env.example` không có secret và có thể commit; package-lock.json nên commit. Không thay thế `.gitignore` bằng quy tắc bỏ qua mọi file JSON.

```powershell
git check-ignore .env data/ivan.sqlite data/ivan.sqlite-wal data/ivan.sqlite-shm
git status --short
```

Không commit database hoặc backup chứa dữ liệu. Khi cần backup ở local, dừng server rồi sao lưu thư mục data vào vị trí riêng không theo dõi bởi Git. Không có thao tác push/deploy tự động.

## Giai đoạn 3B — Kho Google Drive

Dùng lại backend, OAuth callback, session và CSRF của 3A. Không thêm package mới.

### Cấu hình Windows

Nếu đã có `.env` từ 3A, **không chép đè**. Thêm dòng:

```dotenv
GOOGLE_DRIVE_FOLDER_ID=15wgG35QoLwK6Z5H1re_HCCednk7-O3Qp
```

Giữ nguyên ADMIN_EMAIL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET và SESSION_SECRET. Redirect URI vẫn là `http://localhost:3000/auth/google/callback`. Bật Google Drive API trong project OAuth Client; ADMIN_EMAIL cần quyền đọc folder gốc. Nếu ứng dụng Google đang Testing, thêm email vào Test users và thêm scope metadata readonly trong consent screen / Data Access.

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

Mở `http://localhost:3000/admin/`. Đăng nhập lại để cấp thêm quyền metadata Drive. Nếu không cấp scope mới, quản trị bài viết vẫn hoạt động nhưng kho Drive yêu cầu kết nối lại.

### Sử dụng

1. Mở **Kho Google Drive**. Danh sách gồm file và folder con trực tiếp, 50 mục mỗi trang. Dùng breadcrumb và Trang trước/Trang sau để điều hướng.
2. **Đồng bộ ngay** bỏ phân trang hiện tại và gọi lại Drive API cho folder đang mở. Không tự quét toàn bộ cây hoặc tự tạo bài hàng loạt.
3. Chọn bài viết rồi bấm **Gắn vào bài viết** trên file. Có thể gắn nhiều file, không trùng file trong cùng bài. Trạng thái Draft/Published giữ nguyên.
4. Hoặc bấm **Tạo bài Draft** trên file mới tìm thấy. Server tạo nháp danh mục Khác, tên/slug ban đầu và file chưa xác nhận. Chỉnh danh mục/nội dung trước khi xuất bản. Duyệt và đồng bộ không tự tạo bài.
5. Chọn bài trong danh sách quản trị. Trong **File Google Drive liên kết**, kiểm tra quyền chia sẻ thực tế trên Google Drive, đánh dấu xác nhận rồi bấm **Xác nhận công khai / cập nhật metadata**. Server kiểm tra lại file trong cây gốc và lưu email/thời gian xác nhận.
6. Khách chỉ thấy file đã xác nhận trong bài Published. Draft trả 404. Ứng dụng không tự bật “Anyone with the link” hoặc thay đổi permissions.
7. **Ẩn khỏi bài công khai** thu hồi xác nhận; **Gỡ liên kết** xóa quan hệ trong website, không xóa file Drive. Hai thao tác này dùng được khi token Drive đã hết hạn.

Tên, MIME type, dung lượng và ngày cập nhật là snapshot tại lúc gắn/xác nhận. Đồng bộ kho không tự thay snapshot công khai. Khi file đổi tên/nội dung/quyền hoặc chuyển thư mục, quản trị viên cần kiểm tra và xác nhận lại hoặc ẩn file. API khách không gọi Drive; quyền xem/tải thực tế vẫn do Google quyết định. Không bảo đảm từng khách đều có quyền truy cập.

Shortcut không được mở/gắn vì có thể trỏ ra ngoài cây gốc. Không upload/download nội dung, tạo/sửa/xóa file hoặc thay permissions. Scope metadata được Google cấp ở mức tài khoản; giới hạn folder được backend thực thi theo ancestry cho từng lần duyệt, gắn và xác nhận. Không tin breadcrumb từ trình duyệt. Page token được ký, ràng buộc folder/root và hết hạn sau 30 phút; lỗi phân trang thì bấm Đồng bộ ngay.

### Token, hết hạn và thu hồi

Chỉ access token ngắn hạn và hạn sử dụng được giữ trong session bộ nhớ server. Không lưu token trong SQLite/file/cookie/localStorage. Không lưu refresh token, kể cả khi Google trả về; không yêu cầu offline access. Do không lưu refresh token lâu dài nên không cần khóa mã hóa token trên đĩa trong bước này.

Hết hạn/revoked trả DRIVE_RECONNECT: bấm **Kết nối lại Google** qua OAuth hiện có. Thiếu scope yêu cầu cấp quyền lại. Lỗi quyền truy cập, file không tồn tại, quota và network có thông báo riêng; không trả raw Google error hoặc credential cho trình duyệt.

**Ngắt kết nối Drive** gọi Google thu hồi access token và xóa token khỏi phiên, giữ tài khoản quản trị cùng bài viết. Nếu thu hồi từ xa lỗi, token cục bộ vẫn bị xóa và giao diện hướng dẫn thu hồi trong trang quyền truy cập tài khoản Google. Thu hồi grant có thể khiến lần đăng nhập sau cần consent lại. Đăng xuất/khởi động lại server chỉ xóa token cục bộ, không tự thu hồi grant Google. Có thể thu hồi toàn bộ ứng dụng trong phần bảo mật tài khoản Google.

### Migration và quyền riêng tư

Lần khởi động mới chạy migration v1 → v2 trong transaction: thêm `post_drive_files`, giữ nguyên bảng posts và cột `drive_file_id` cũ. ID cũ được chuyển thành quan hệ **chưa xác nhận**, không có metadata công khai. Migration lặp không tạo bản ghi trùng; không hạ cấp database mới hơn ứng dụng. Nên dừng server cũ và sao lưu data trước khi chạy bản mới.

API công khai không trả `drive_file_id` cũ, file chưa xác nhận, người xác nhận, token hoặc danh sách riêng tư. Chỉ trả các trường được chọn của file đã xác nhận trong bài Published. Mọi API kho nằm dưới `/api/admin`, dùng middleware ADMIN_EMAIL và no-store; API chỉnh sửa dùng CSRF và Origin check.

| API quản trị mới | Chức năng |
| --- | --- |
| GET /api/admin/drive/status | Trạng thái kết nối, không trả token |
| GET /api/admin/drive/files?folderId=...&pageToken=... | Duyệt trong cây gốc |
| POST /api/admin/drive/disconnect | Thu hồi token và ngắt kết nối |
| POST /api/admin/drive/drafts | Tạo Draft từ fileId |
| GET /api/admin/posts/:id/drive-files | File đã liên kết |
| POST /api/admin/posts/:id/drive-files | Gắn fileId, mặc định chưa xác nhận |
| PUT /api/admin/posts/:id/drive-files/:fileId | sharingConfirmed true/false |
| DELETE /api/admin/posts/:id/drive-files/:fileId | Gỡ liên kết khỏi bài |

Kiểm thử dùng Google transport giả lập, không gọi tài khoản thật. Bao gồm thư mục con/rỗng, breadcrumb, phân trang, ngoài root, shortcut, cycle/depth, CSRF/phân quyền, hết hạn/thiếu scope/lỗi Google, nhiều file, Draft/Published, xác nhận/ẩn/gỡ, migration v1 giữ dữ liệu và không lộ metadata riêng tư. Cần kiểm tra OAuth/Drive thật sau khi cấu hình `.env`. Không có commit, push hoặc deploy tự động.

## Nút tải Google Drive

Metadata yêu cầu thêm `webContentLink`, `resourceKey`, `capabilities.canDownload`, hạn chế tải của người đọc và loại quyền chia sẻ (không lấy email trong permissions). Scope vẫn chỉ `drive.metadata.readonly`.

Migration v2 → v3 chạy trong transaction, thêm các cột `download_url`, `resource_key`, `can_download`, `sharing_access`, `metadata_checked_at` vào quan hệ bài–file. Không xóa bài, không đổi trạng thái xuất bản hoặc xác nhận chia sẻ hiện có. File cũ mặc định chưa có link tải mới; vẫn giữ nút xem Drive.

Để cập nhật file đã gắn: khởi động lại server, mở Kho Google Drive và Đồng bộ ngay, chọn bài viết rồi **Xác nhận công khai / cập nhật metadata** cho từng file. Việc xác nhận lấy lại metadata hiện tại và lưu link Google cung cấp. Không thay link download bằng link preview, không tự chế `uc?export=download`, không tạo link export cho Google Docs/Sheets.

Nút **Tải xuống** ưu tiên `webContentLink` cho file nhị phân khi Google trả khả năng tải và không báo hạn chế tải cho người đọc. Nút **Xem trên Google Drive** được giữ riêng. Nếu thiếu link/khả năng tải hoặc Google Workspace không hỗ trợ link trực tiếp, chỉ hiện phương án xem Drive. Resource key trong link được giữ nguyên; nếu link chưa có nhưng metadata có resourceKey, ứng dụng bổ sung key đó. Không gắn OAuth token vào URL.

`capabilities.canDownload` là quyền của tài khoản quản trị đang đồng bộ, không phải cam kết khách ẩn danh được tải. Giao diện quản trị hiển thị chia sẻ công khai/hạn chế/chưa xác định; quản trị viên vẫn phải kiểm tra đúng đối tượng chia sẻ. Khi Google yêu cầu đăng nhập, quét virus, xác nhận tải hoặc áp dụng quota/hạn chế, trình duyệt xử lý tại Google. Ứng dụng không proxy nội dung, không vượt xác nhận và không thay quyền file.

Có thể kiểm tra file đã xác nhận trong bài Published bằng:

```powershell
node scripts/check-drive-download.mjs FILE_ID
# Nếu cần resource key:
node scripts/check-drive-download.mjs FILE_ID RESOURCE_KEY
```

Script không đọc .env/cookie/token và không gọi API quản trị. Nó thử trang xem ẩn danh, lấy link tải của file từ API công khai localhost rồi gửi GET tới đúng URL đã lưu. Chỉ đọc mẫu tối đa khoảng 64 KB (một chunk có thể lớn hơn), hủy luồng sau khi đủ bằng chứng; không lưu file lên server. Phân biệt `download-started`, `google-confirmation-required`, `login-required`, `http-error`, và chưa có link được xác nhận. Kết quả bắt đầu tải không có nghĩa đã tải và kiểm tra toàn bộ file. Script không tự công khai bài hoặc thay quyền chia sẻ.

Nếu OAuth báo lỗi mạng khi chạy trong môi trường sandbox hạn chế Internet, chạy `npm.cmd start` trong terminal Windows có quyền kết nối Google. Đăng nhập mới tại `/login`, không tải lại URL callback cũ. Thông báo OAuth phân biệt lỗi Client, redirect, mã hết hạn và mạng; log chỉ ghi mã phân loại, không ghi phản hồi chứa credential.
# Khởi động Admin trên Windows

Nhấp đúp **IVAN-Admin.cmd**, giữ cửa sổ mở và nhấn **Ctrl+C** để tắt server. Hướng dẫn tạo shortcut Desktop, khắc phục lỗi và đăng website: [WINDOWS-ADMIN.md](WINDOWS-ADMIN.md).
