import { randomUUID } from 'node:crypto';
import { createDrive, driveId, DriveError, DEFAULT_ROOT } from './drive.js';
import { validatePost } from './posts.js';

export async function selectedDriveFiles(body,req,config,driveRequest) {
  if(!Object.hasOwn(body,'drive_file_ids'))return undefined; // Legacy API clients keep existing links.
  const ids=body.drive_file_ids;
  if(!Array.isArray(ids)||ids.length>50)throw new DriveError(400,'DRIVE_INPUT','Chọn tối đa 50 file Drive.');
  ids.forEach(driveId);
  if(new Set(ids).size!==ids.length)throw new DriveError(400,'DRIVE_INPUT','Danh sách file Drive bị trùng.');
  const drive=createDrive(config,req.session.drive,driveRequest),files=[];
  const approved=body.drive_public_file_ids;
  if(approved!==undefined&&(!Array.isArray(approved)||approved.some(id=>!ids.includes(id))||new Set(approved).size!==approved.length))throw new DriveError(400,'DRIVE_INPUT','Danh sách xác nhận chia sẻ không khớp file đã chọn.');
  for(const id of ids){
    const file=await drive.file(id);
    if(approved!==undefined){
      file.requested_sharing=approved.includes(id);
      if(file.requested_sharing&&file.sharing_access!=='anyone')throw new DriveError(403,'DRIVE_PRIVATE','File chưa có quyền Anyone trên Google Drive. Có thể lưu riêng tư nhưng không công khai file này.');
    }
    files.push(file);
  }
  return files;
}

export function registerDriveRoutes(app, { db, config, csrf, driveRequest, revokeToken }) {
  const drive = req => createDrive(config, req.session.drive, driveRequest);
  const requirePost = id => {
    if (!db.get(id)) throw new DriveError(404, 'POST_NOT_FOUND', 'Không tìm thấy bài viết.');
  };
  const requireLink = (postId, fileId) => {
    requirePost(postId); driveId(fileId);
    if (!db.linkedFiles(postId).some(f => f.file_id === fileId)) throw new DriveError(404, 'LINK_NOT_FOUND', 'File chưa được gắn vào bài viết.');
  };
  app.get('/api/admin/drive/status', (req, res) => res.json({
    connected: !!req.session.drive?.access_token && req.session.drive.expiry_date > Date.now() + 10000,
    expiresAt: req.session.drive?.expiry_date || null,
    rootId: config.driveRootId || DEFAULT_ROOT,
  }));
  app.get('/api/admin/drive/files', async (req, res) => res.json(await drive(req).list(req.query.folderId, req.query.pageToken)));
  app.post('/api/admin/drive/disconnect', csrf, async (req, res) => {
    const token = req.session.drive?.access_token;
    delete req.session.drive;
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    if (token) {
      try { await revokeToken(token); }
      catch { throw new DriveError(502, 'DRIVE_REVOKE', 'Đã xóa token khỏi phiên nhưng chưa xác nhận thu hồi tại Google. Có thể thu hồi trong phần quyền truy cập tài khoản Google.'); }
    }
    res.json({ ok: true });
  });
  app.get('/api/admin/posts/:id/drive-files', (req, res) => { requirePost(req.params.id); res.json(db.linkedFiles(req.params.id)); });
  app.post('/api/admin/posts/:id/drive-files', csrf, async (req, res) => {
    requirePost(req.params.id);
    const file = await drive(req).file(driveId(req.body?.fileId));
    res.json(db.linkFile(req.params.id, file));
  });
  app.put('/api/admin/posts/:id/drive-files/:fileId', csrf, async (req, res) => {
    const { id, fileId } = req.params;
    requireLink(id, fileId);
    if (typeof req.body?.sharingConfirmed !== 'boolean') throw new DriveError(400, 'DRIVE_INPUT', 'Cần xác nhận quyền chia sẻ rõ ràng.');
    // Fetch the current metadata and ancestry again before approving public visibility.
    const file = req.body.sharingConfirmed ? await drive(req).file(fileId) : null;
    res.json(db.confirmFile(id, fileId, file, config.adminEmail));
  });
  app.delete('/api/admin/posts/:id/drive-files/:fileId', csrf, (req, res) => {
    requireLink(req.params.id, req.params.fileId);
    db.unlinkFile(req.params.id, req.params.fileId); res.json({ ok: true });
  });
  app.post('/api/admin/drive/drafts', csrf, async (req, res) => {
    const file = await drive(req).file(driveId(req.body?.fileId));
    const title = file.name.slice(0, 160);
    const base = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'drive';
    const post = validatePost({ title, slug: `${base}-${randomUUID().slice(0, 8)}`, category: req.body.category || 'other', description: 'Bài nháp từ Google Drive. Cần bổ sung nội dung trước khi xuất bản.', introduction: '', instructions: '', images: [], status: 'draft' });
    res.status(201).json(db.createDriveDraft(post, file));
  });
}
