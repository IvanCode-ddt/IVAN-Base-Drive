import { MEDIA_TYPES, directMediaURL, drivePreview } from '../js/media.js';
import { DriveError } from './drive.js';
import { selectedDriveFiles } from './drive-routes.js';
import { InputError, validatePost } from './posts.js';

const RAR_TYPES = new Set(['application/vnd.rar', 'application/x-rar-compressed', 'application/x-7z-compressed']);
const validBundle = file => file && (file.mime_type === 'application/zip' || RAR_TYPES.has(file.mime_type) || /\.(zip|rar|7z)$/i.test(file.name || ''));
const safePublicURL = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};

function validateAlbum(body, files) {
  if (!body || typeof body !== 'object' || !body.post || !body.album) throw new InputError('Thiếu thông tin bài viết hoặc album.');
  const postInput = { ...body.post, category: 'music', description: body.post.description?.trim() || 'Album nhạc' };
  const post = validatePost(postInput);
  if (body.post.description?.trim()) post.description = body.post.description.trim();
  else post.description = '';

  const album = body.album;
  const artist = album.artist ?? '', genre = album.genre ?? '';
  if (typeof artist !== 'string' || artist.length > 160 || typeof genre !== 'string' || genre.length > 100) throw new InputError('Nghệ sĩ hoặc thể loại album không hợp lệ.');
  const releaseYear = album.release_year === '' || album.release_year == null ? null : Number(album.release_year);
  if (releaseYear !== null && (!Number.isInteger(releaseYear) || releaseYear < 1888 || releaseYear > 2200)) throw new InputError('Năm phát hành phải nằm trong khoảng 1888 đến 2200.');
  if (!Array.isArray(album.tracks) || album.tracks.length > 500) throw new InputError('Album cần tối đa 500 track.');
  if (post.status === 'published' && !album.tracks.length) throw new InputError('Album Published cần ít nhất một bài hát.');
  const byId = new Map(files.map(file => [file.file_id, file]));
  const seen = new Set();
  const tracks = album.tracks.map((track, index) => {
    if (!track || typeof track !== 'object' || typeof track.title !== 'string' || !track.title.trim() || track.title.length > 160) throw new InputError(`Tên bài hát ở vị trí ${index + 1} không hợp lệ.`);
    const id = track.id || '';
    if (id && (!/^[a-f0-9-]{36}$/i.test(id) || seen.has(id))) throw new InputError('Track ID không hợp lệ hoặc bị trùng.');
    if (id) seen.add(id);
    const duration = track.duration_seconds === '' || track.duration_seconds == null ? null : Number(track.duration_seconds);
    if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 86400)) throw new InputError(`Thời lượng track ${index + 1} không hợp lệ.`);
    const sourceKind = track.source_kind;
    if (!['direct', 'drive_preview', 'download_only'].includes(sourceKind)) throw new InputError(`Nguồn bài hát ${index + 1} không hợp lệ.`);
    const driveFileId = typeof track.drive_file_id === 'string' ? track.drive_file_id : '';
    const file = driveFileId ? byId.get(driveFileId) : null;
    if (driveFileId && (!file || !file.mime_type?.startsWith('audio/'))) throw new InputError(`File Drive của track “${track.title}” chưa được chọn hoặc không phải file âm thanh.`);
    const directUrl = typeof track.direct_url === 'string' ? track.direct_url : '';
    const mimeType = typeof track.mime_type === 'string' ? track.mime_type : '';
    const sharingConfirmed = track.sharing_confirmed === true || track.sharing_confirmed === 1;
    if (sourceKind === 'direct') {
      if (!directMediaURL(directUrl) || !MEDIA_TYPES.includes(mimeType) || !mimeType.startsWith('audio/') || !sharingConfirmed) throw new InputError(`Track “${track.title}”: nguồn phát phải là HTTPS audio hợp lệ và cần xác nhận quyền chia sẻ.`);
    } else {
      if (!driveFileId) throw new InputError(`Track “${track.title}” cần chọn file âm thanh Google Drive.`);
      if (sourceKind === 'drive_preview' && !drivePreview(file.web_url)) throw new InputError(`Link preview Drive của track “${track.title}” không hợp lệ.`);
      if (sourceKind === 'download_only' && !file.can_download) throw new InputError(`Track “${track.title}” không có quyền tải xuống.`);
    }
    return { id, title: track.title.trim(), duration_seconds: duration, source_kind: sourceKind, direct_url: sourceKind === 'direct' ? directMediaURL(directUrl) : '', mime_type: sourceKind === 'direct' ? mimeType : '', drive_file_id: driveFileId, sharing_confirmed: sharingConfirmed };
  });
  const bundleFileId = album.bundle_file_id ?? '';
  if (typeof bundleFileId !== 'string' || (bundleFileId && !validBundle(byId.get(bundleFileId)))) throw new InputError('File tải toàn bộ cần là ZIP, RAR hoặc 7z đã chọn từ Google Drive.');
  return { post, album: { artist: artist.trim(), release_year: releaseYear, genre: genre.trim(), bundle_file_id: bundleFileId, tracks } };
}

function downloadFor(file, files) {
  const linked = files.find(item => item.file_id === file && item.sharing_confirmed === 1 && item.sharing_access === 'anyone' && item.can_download === 1);
  return linked ? { name: linked.name, url: safePublicURL(linked.download_url) } : null;
}

export function publicMusicAlbum(album) {
  if (!album?.post || album.post.status !== 'published' || album.post.deleted_at) return null;
  const post = album.post, files = post.drive_files || [];
  const tracks = album.tracks.map(track => {
    const file = files.find(item => item.file_id === track.drive_file_id && item.sharing_confirmed === 1 && item.sharing_access === 'anyone');
    let sourceKind = track.source_kind, playbackUrl = '', openUrl = '';
    if (track.source_kind === 'direct' && track.sharing_confirmed === 1) playbackUrl = directMediaURL(track.direct_url);
    if (track.source_kind === 'drive_preview' && file?.mime_type?.startsWith('audio/')) {
      const preview = drivePreview(file.web_url);
      if (preview) { sourceKind = 'drive_preview'; openUrl = safePublicURL(file.web_url); }
      else sourceKind = 'download_only';
    } else if (track.source_kind === 'download_only') sourceKind = 'download_only';
    if (track.source_kind === 'direct' && !playbackUrl) sourceKind = 'download_only';
    const download = downloadFor(track.drive_file_id, files);
    return {
      id: track.id, position: track.position, title: track.title, duration_seconds: track.duration_seconds,
      source_kind: sourceKind, playback_url: playbackUrl, open_url: openUrl, mime_type: track.mime_type,
      download: download?.url ? download : null,
    };
  });
  const bundle = downloadFor(album.bundle_file_id, files);
  return {
    post_id: post.id, slug: post.slug, title: post.title, description: post.description,
    cover_url: post.cover_url, updated_at: post.updated_at, is_pinned:post.is_pinned, pin_order:post.pin_order,
    artist: album.artist,
    release_year: album.release_year, genre: album.genre, tracks,
    bundle_download: bundle?.url ? bundle : null,
  };
}

export function registerMusicRoutes(app, { db, config, csrf, driveRequest }) {
  app.get('/api/music/albums', (req, res) => res.set('Cache-Control', 'no-store').json({
    schemaVersion: 1, albums: db.musicAlbums({ publicOnly: true }).map(publicMusicAlbum).filter(Boolean),
  }));
  app.get('/api/admin/music/albums', (req, res) => res.json(db.musicAlbums()));
  app.get('/api/admin/music/albums/:id', (req, res) => {
    const album = db.musicAlbum(req.params.id);
    album ? res.json(album) : res.status(404).json({ error: 'Không tìm thấy album.' });
  });
  async function save(req, res, id) {
    if (req.body?.cms_contract === 2 && !Array.isArray(req.body.drive_file_ids)) throw new InputError('Thiếu danh sách file Google Drive. Chưa lưu album.');
    const files = await selectedDriveFiles(req.body, req, config, driveRequest);
    if (!files) throw new DriveError(400, 'DRIVE_INPUT', 'Album cần gửi danh sách file Google Drive đã chọn.');
    const { post, album } = validateAlbum(req.body, files);
    const saved = db.saveMusicAlbum(post, id, files, album, config.adminEmail);
    saved ? res.status(id ? 200 : 201).json(saved) : res.status(404).json({ error: 'Không tìm thấy album.' });
  }
  app.post('/api/admin/music/albums', csrf, (req, res) => save(req, res, null));
  app.put('/api/admin/music/albums/:id', csrf, (req, res) => save(req, res, req.params.id));
}
