import { MEDIA_TYPES,directMediaURL,isDownloadArchive } from '../js/media.js';
import { DriveError } from './drive.js';
import { selectedDriveFiles } from './drive-routes.js';
import { InputError, validatePost } from './posts.js';

const DRIVE_HOSTS=new Set(['drive.google.com','docs.google.com','drive.usercontent.google.com']);
const safePublicURL = value => {
  try {
    const url = new URL(value);
    const sensitive=[...url.searchParams.keys()].some(key=>/^(access_token|oauth_token|refresh_token|client_secret|id_token)$/i.test(key));
    return url.protocol === 'https:' && DRIVE_HOSTS.has(url.hostname) && !url.username && !url.password && !sensitive ? url.href : '';
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
  if (album.tracks !== undefined && (!Array.isArray(album.tracks) || album.tracks.length > 500)) throw new InputError('Album cần tối đa 500 track.');
  if (post.status === 'published' && Array.isArray(album.tracks) && !album.tracks.length) throw new InputError('Album Published cần ít nhất một bài hát.');
  const byId = new Map(files.map(file => [file.file_id, file]));
  const seen = new Set();
  const tracks = Array.isArray(album.tracks)?album.tracks.map((track, index) => {
    if (!track || typeof track !== 'object' || typeof track.title !== 'string' || !track.title.trim() || track.title.length > 160) throw new InputError(`Tên bài hát ở vị trí ${index + 1} không hợp lệ.`);
    const id = track.id || '';
    if (id && (!/^[a-f0-9-]{36}$/i.test(id) || seen.has(id))) throw new InputError('Track ID không hợp lệ hoặc bị trùng.');
    if (id) seen.add(id);
    const duration = track.duration_seconds === '' || track.duration_seconds == null ? null : Number(track.duration_seconds);
    if (duration !== null && (!Number.isInteger(duration) || duration < 0 || duration > 86400)) throw new InputError(`Thời lượng track ${index + 1} không hợp lệ.`);
    const sourceKind = track.source_kind || 'download_only';
    if (!['direct', 'drive_preview', 'download_only'].includes(sourceKind)) throw new InputError(`Nguồn bài hát ${index + 1} không hợp lệ.`);
    const driveFileId = typeof track.drive_file_id === 'string' ? track.drive_file_id : '';
    const file = driveFileId ? byId.get(driveFileId) : null;
    if (driveFileId && (!file || !file.mime_type?.startsWith('audio/'))) throw new InputError(`File Drive của track “${track.title}” chưa được chọn hoặc không phải file âm thanh.`);
    const directUrl = typeof track.direct_url === 'string' ? track.direct_url : '';
    const mimeType = typeof track.mime_type === 'string' ? track.mime_type : '';
    const sharingConfirmed = track.sharing_confirmed === true || track.sharing_confirmed === 1;
    return {
      id, title: track.title.trim(), duration_seconds: duration, source_kind: sourceKind,
      direct_url: directMediaURL(directUrl), mime_type: MEDIA_TYPES.includes(mimeType) ? mimeType : '',
      drive_file_id: driveFileId, sharing_confirmed: sharingConfirmed,
    };
  }):undefined;
  const requestedBundleIds=album.bundle_file_ids??(album.bundle_file_id?[album.bundle_file_id]:[]);
  if(!Array.isArray(requestedBundleIds)||requestedBundleIds.length>50||requestedBundleIds.some(id=>typeof id!=='string')||new Set(requestedBundleIds).size!==requestedBundleIds.length)throw new InputError('Danh sách gói album không hợp lệ.');
  if(requestedBundleIds.some(id=>!isDownloadArchive(byId.get(id))))throw new InputError('Mỗi file tải album phải là ZIP, RAR hoặc 7z đã chọn từ Google Drive.');
  if(post.status==='published'&&!requestedBundleIds.length&&!Array.isArray(album.tracks))throw new InputError('Album Published cần ít nhất một file ZIP, RAR hoặc 7z.');
  return { post, album: { artist: artist.trim(), release_year: releaseYear, genre: genre.trim(), bundle_file_id: requestedBundleIds[0]||'',bundle_file_ids:requestedBundleIds,...(tracks?{tracks}:{}) } };
}

function downloadFor(file, files) {
  const linked = files.find(item => item.file_id === file && item.sharing_confirmed === 1 && item.sharing_access === 'anyone' && item.can_download === 1);
  return linked ? { name: linked.name, url: safePublicURL(linked.download_url) } : null;
}

export function publicMusicAlbum(album) {
  if (!album?.post || album.post.status !== 'published' || album.post.deleted_at) return null;
  const post = album.post, files = post.drive_files || [];
  let bundleFileIds=album.bundle_file_ids;
  if(!Array.isArray(bundleFileIds)){
    const stored=album.bundle_file_id||'';
    try{const parsed=JSON.parse(stored);bundleFileIds=Array.isArray(parsed)?parsed:stored?[stored]:[];}catch{bundleFileIds=stored?[stored]:[];}
  }
  const bundles=bundleFileIds.map(id=>{
    const file=files.find(item=>item.file_id===id&&item.sharing_confirmed===1&&item.sharing_access==='anyone');
    if(!file||!isDownloadArchive(file))return null;
    const download=downloadFor(id,files),open=safePublicURL(file.web_url);
    if(!download?.url&&!open)return null;
    return{name:file.name||'Gói album',download_url:download?.url||'',open_url:open};
  }).filter(Boolean);
  return {
    post_id: post.id, slug: post.slug, title: post.title, description: post.description,
    cover_url: post.cover_url, updated_at: post.updated_at, is_pinned:post.is_pinned, pin_order:post.pin_order,
    artist: album.artist,
    bundle_downloads:bundles,
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
