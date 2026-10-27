# IVAN Base Drive — Giai đoạn 3B

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
