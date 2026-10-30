import { normalizeSearch } from '/js/data.js?v=9';
import { escapeHTML, categoryName } from '/js/content.js?v=9';

const $ = selector => document.querySelector(selector);
const esc = escapeHTML;
export function sizeLabel(value) {
  if (value === null || value === undefined) return '—';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
const dateLabel = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone:'Asia/Ho_Chi_Minh' }) : '—';

export async function initDrive({ api, openDraft, refreshPosts, beforeDraft, notifications }) {
  let folderId, pageToken, nextToken, previousPages = [], selectedPost = null, requestVersion = 0;
  const notice = (text, error = false) => { $('#drive-message').textContent = text; $('#drive-message').dataset.error = String(error);if(error)notifications?.error(text); };
  const cachedFiles=new Map();let visibleFiles=[];
  function searchFiles(){const query=normalizeSearch($('#drive-search').value.trim());return query?[...cachedFiles.values()].filter(file=>normalizeSearch(file.name).includes(query)):visibleFiles;}
  function renderFiles(files){      $('#drive-files').innerHTML = files.length ? files.map(file => `<article class="drive-file"><div><h3>${file.is_folder ? '▣ ' : ''}${esc(file.name)}</h3><p>${esc(file.mime_type)} · ${sizeLabel(file.size)} · ${esc(dateLabel(file.modified_time))}</p></div><div class="drive-actions">${file.is_folder ? `<button type="button" class="secondary-button" data-folder="${esc(file.file_id)}">Mở thư mục</button>` : file.is_shortcut ? '<span>Shortcut không được hỗ trợ</span>' : `<button type="button" class="secondary-button" data-attach="${esc(file.file_id)}">Gắn vào bài viết</button><button type="button" class="secondary-button" data-draft="${esc(file.file_id)}">Tạo bài Draft</button>`}</div></article>`).join('') : '<p>Không có file phù hợp trong danh sách đang xem.</p>';}
  $('#drive-search').addEventListener('input',()=>renderFiles(searchFiles()));
  async function targets() {
    const selected = $('#drive-target').value || selectedPost || '';
    const posts = await api('/api/admin/posts');
    $('#drive-target').innerHTML = '<option value="">Chọn bài viết để gắn file…</option>' + posts.map(p => `<option value="${esc(p.id)}">${esc(p.title)} · ${p.status === 'published' ? 'Published' : 'Draft'}</option>`).join('');
    if (posts.some(p => p.id === selected)) $('#drive-target').value = selected;
  }
  async function status() {
    const data = await api('/api/admin/drive/status');
    $('#drive-disconnect').disabled = !data.connected;
    $('#drive-state').textContent = data.connected ? `Đã kết nối · Hết hạn lúc ${dateLabel(data.expiresAt)}` : 'Chưa kết nối hoặc token đã hết hạn. Hãy kết nối lại Google.';
    if (!folderId) folderId = data.rootId;
    return data.connected;
  }
  async function browse(nextFolder = folderId, nextPage, announceSync=false) {
    const version = ++requestVersion;
    $('#drive-files').innerHTML = '';
    $('#drive-prev').disabled = true; $('#drive-next').disabled = true;
    notice('Đang đọc metadata từ Google Drive…');
    try {
      const params = new URLSearchParams();
      if (nextFolder) params.set('folderId', nextFolder);
      if (nextPage) params.set('pageToken', nextPage);
      const data = await api(`/api/admin/drive/files?${params}`);
      if (version !== requestVersion) return;
      folderId = data.folderId; pageToken = nextPage; nextToken = data.nextPageToken;
      $('#drive-breadcrumb').innerHTML = data.breadcrumb.map((part, index) => `${index ? '<span aria-hidden="true"> / </span>' : ''}<button type="button" class="secondary-button" data-folder="${esc(part.id)}" ${index === data.breadcrumb.length-1 ? 'aria-current="location"' : ''}>${esc(part.name)}</button>`).join('');
      visibleFiles=data.files;for(const file of data.files)cachedFiles.set(file.file_id,file);renderFiles(searchFiles());
      $('#drive-prev').disabled = !previousPages.length; $('#drive-next').disabled = !nextToken;
      notice(`Đã đồng bộ lúc ${dateLabel(data.syncedAt)}.${data.incompleteSearch ? ' Google trả kết quả chưa đầy đủ; hãy thử lại.' : ''}`);
      if(announceSync)notifications?.success('Đã đồng bộ danh sách Google Drive.');
    } catch (error) { if (version === requestVersion) notice(error.message, true); }
  }
  async function showPost(post) {
    selectedPost = post?.id || null; if(selectedPost) $('#drive-target').value=selectedPost;
    $('#linked-drive-files').innerHTML = '';
    if (!selectedPost) { $('#linked-drive-files').textContent = 'Lưu bài viết trước, sau đó gắn file từ Kho Google Drive.'; return; }
    const id = selectedPost;
    try {
      const files = await api(`/api/admin/posts/${id}/drive-files`);
      if (selectedPost !== id) return;
      $('#linked-drive-files').innerHTML = files.length ? files.map(f => `<article class="linked-file" data-file="${esc(f.file_id)}"><h3>${esc(f.name || f.file_id)}</h3><p>${esc(f.mime_type || 'Metadata cũ chưa được xác minh')} · ${sizeLabel(f.size)} · ${esc(dateLabel(f.modified_time))}</p><p>Quyền chia sẻ: ${esc(f.sharing_access === 'anyone' ? 'Bất kỳ ai có liên kết' : f.sharing_access === 'restricted' ? 'Hạn chế theo tài khoản/nhóm/miền' : 'Chưa xác định từ metadata')}. Tải trực tiếp: ${f.download_url && f.can_download === 1 ? 'Có liên kết Google cung cấp' : 'Chưa có hoặc bị hạn chế'}.</p><p>Khả năng tải của tài khoản quản trị không bảo đảm khách cũng tải được. Nếu Google yêu cầu đăng nhập/xác nhận, khách cần thực hiện trên Google.</p><p>${f.sharing_confirmed ? `Đã xác nhận bởi ${esc(f.confirmed_by)} · ${esc(dateLabel(f.confirmed_at))}` : 'Riêng tư trên website: chưa được xác nhận công khai.'}</p><label class="sharing-label"><input type="checkbox" class="sharing-check"> Tôi xác nhận đã kiểm tra quyền chia sẻ trên Google Drive, phù hợp với đối tượng xem bài viết.</label><div class="drive-actions"><button type="button" class="secondary-button" data-confirm disabled>Xác nhận công khai / cập nhật metadata</button>${f.sharing_confirmed ? '<button type="button" class="secondary-button" data-hide>Ẩn khỏi bài công khai</button>' : ''}<button type="button" class="secondary-button" data-unlink>Gỡ liên kết</button></div></article>`).join('') : '<p>Bài viết chưa liên kết file Drive nào.</p>';
    } catch (error) { if (selectedPost === id) $('#linked-drive-files').textContent = error.message; }
  }
  $('#drive-panel').addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.folder) { previousPages = []; return browse(button.dataset.folder); }
    if (button.dataset.attach || button.dataset.draft) {
      const postId = $('#drive-target').value;
      if (button.dataset.attach && !postId) return notice('Hãy chọn bài viết trước khi gắn file.', true);
      if (button.dataset.draft && !beforeDraft()) return;
      button.disabled = true;
      try {
        if (button.dataset.attach) {
          await api(`/api/admin/posts/${postId}/drive-files`, { method:'POST', body:JSON.stringify({fileId:button.dataset.attach}) });
          if (selectedPost === postId) await showPost({id:postId});
          notice('Đã gắn file. Trạng thái bài viết giữ nguyên; file chưa được công khai.');
          notifications?.success('Đã gắn file Drive vào bài viết.');
        } else {
          const post = await api('/api/admin/drive/drafts', {method:'POST', body:JSON.stringify({fileId:button.dataset.draft})});
          await refreshPosts(); await targets(); openDraft(post);
          notice('Đã tạo bài Draft với file chưa xác nhận. Hãy bổ sung nội dung trước khi xuất bản.');
          notifications?.success('Đã tạo bản nháp từ file Drive.');
        }
      } catch (error) { notice(error.message, true); }
      finally { button.disabled = false; }
    }
  });
  $('#drive-sync').addEventListener('click', () => { previousPages = []; browse(folderId,undefined,true); });
  $('#drive-next').addEventListener('click', () => { if(nextToken) { previousPages.push(pageToken); browse(folderId,nextToken); } });
  $('#drive-prev').addEventListener('click', () => { if(previousPages.length) browse(folderId,previousPages.pop()); });
  $('#drive-toggle').addEventListener('click', async () => {
    $('#drive-panel').hidden = !$('#drive-panel').hidden;
    $('#drive-toggle').setAttribute('aria-expanded', String(!$('#drive-panel').hidden));
    if (!$('#drive-panel').hidden) { try { await targets(); if(await status()) { previousPages=[]; await browse(folderId); } } catch(error) { notice(error.message,true); } }
  });
  $('#drive-disconnect').addEventListener('click', async () => {
    if(!confirm('Ngắt kết nối và thu hồi access token hiện tại? Các liên kết bài viết vẫn được giữ.')) return;
    try { await api('/api/admin/drive/disconnect',{method:'POST',body:'{}'}); notice('Đã ngắt kết nối Drive.');notifications?.success('Đã ngắt kết nối Google Drive.'); }
    catch(error) { notice(error.message,true); }
    finally {
      ++requestVersion; $('#drive-files').innerHTML='';
      $('#drive-prev').disabled=true; $('#drive-next').disabled=true;
      try { await status(); } catch(error) { notice(error.message,true); }
    }
  });
  $('#linked-drive-files').addEventListener('change', event => {
    if(event.target.matches('.sharing-check')) event.target.closest('.linked-file').querySelector('[data-confirm]').disabled = !event.target.checked;
  });
  $('#linked-drive-files').addEventListener('click', async event => {
    const button = event.target.closest('button'), row = button?.closest('[data-file]');
    if(!row || !selectedPost) return;
    const id=selectedPost, fileId=row.dataset.file;
    if(button.hasAttribute('data-confirm') && !row.querySelector('.sharing-check').checked) return;
    button.disabled = true;
    let succeeded=false;
    try {
      const url=`/api/admin/posts/${id}/drive-files/${encodeURIComponent(fileId)}`;
      if(button.hasAttribute('data-unlink')) await api(url,{method:'DELETE'});
      else await api(url,{method:'PUT',body:JSON.stringify({sharingConfirmed:button.hasAttribute('data-confirm')})});
      if(selectedPost===id)await showPost({id});
      succeeded=true;
    } catch(error) { notice(error.message,true); button.disabled=false; }
    if(succeeded)notifications?.success(button.hasAttribute('data-unlink')?'Đã gỡ liên kết file Drive.':'Đã cập nhật xác nhận chia sẻ file.');
  });
  return { showPost, targets };
}
