import { OAuth2Client } from 'google-auth-library';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
export const DEFAULT_ROOT = '15wgG35QoLwK6Z5H1re_HCCednk7-O3Qp';
export const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const fields = 'id,name,mimeType,size,modifiedTime,parents,trashed,webViewLink,webContentLink,resourceKey,capabilities(canDownload),copyRequiresWriterPermission,downloadRestrictions(effectiveDownloadRestrictionWithContext),permissions(type,role,deleted)';
export class DriveError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function driveId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new DriveError(400, 'DRIVE_INPUT', 'ID Drive không hợp lệ.');
  return value;
}
export function fileSnapshot(file) {
  const allowedHosts = ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'];
  const parse = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && allowedHosts.includes(url.hostname) && !url.username && !url.password && !url.searchParams.has('access_token') && !url.searchParams.has('oauth_token') ? url : null;
    } catch { return null; }
  };
  const view = parse(file.webViewLink), content = parse(file.webContentLink);
  const keyIn = url => url ? [...url.searchParams].find(([key]) => key.toLowerCase() === 'resourcekey')?.[1] : '';
  const resourceKey = file.resourceKey || keyIn(content) || keyIn(view) || '';
  const withKey = url => {
    if (resourceKey && !keyIn(url)) url.searchParams.set('resourcekey', resourceKey);
    return url.href;
  };
  const webUrl = withKey(view || new URL(`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`));
  const restriction = file.downloadRestrictions?.effectiveDownloadRestrictionWithContext;
  const readerBlocked = !!(file.copyRequiresWriterPermission || restriction?.restrictedForReaders || restriction?.restrictedForWriters);
  const binary = !!file.mimeType && !file.mimeType.startsWith('application/vnd.google-apps.');
  const canDownload = typeof file.capabilities?.canDownload === 'boolean' ? Number(file.capabilities.canDownload && !readerBlocked) : null;
  const downloadUrl = binary && canDownload === 1 && content ? withKey(content) : '';
  const permissions = file.permissions?.filter(p => !p.deleted);
  const sharingAccess = permissions?.some(p => p.type === 'anyone') ? 'anyone' : permissions?.length ? 'restricted' : 'unknown';
  return { file_id: file.id, name: file.name || file.id, mime_type: file.mimeType || '', size: file.size ?? null, modified_time: file.modifiedTime || '', web_url: webUrl, download_url: downloadUrl, resource_key: resourceKey, can_download: canDownload, sharing_access: sharingAccess, metadata_checked_at: new Date().toISOString() };
}

// One client per request: credentials are never shared between sessions.
export function googleDriveRequest(config) {
  return async (tokens, resource, params) => {
    const client = new OAuth2Client({ clientId:config.clientId, clientSecret:config.clientSecret, redirectUri:config.redirectUri, eagerRefreshThresholdMillis:10000 });
    client.setCredentials({ access_token: tokens.access_token, expiry_date: tokens.expiry_date });
    const response = await client.request({ url: `https://www.googleapis.com/drive/v3/${resource}`, method: 'GET', params, timeout: 15000, retry: false });
    return response.data;
  };
}

export function createDrive(config, tokens, transport = googleDriveRequest(config)) {
  const root = config.driveRootId || DEFAULT_ROOT;
  const fail = (status, code, message) => { throw new DriveError(status, code, message); };
  async function request(resource, params) {
    if (!tokens?.access_token || (tokens.expiry_date && tokens.expiry_date <= Date.now() + 10000)) fail(409, 'DRIVE_RECONNECT', 'Kết nối Drive đã hết hạn. Hãy kết nối lại Google.');
    if (!tokens.scope?.split(' ').includes(DRIVE_SCOPE)) fail(409, 'DRIVE_SCOPE', 'Chưa cấp quyền đọc metadata Drive. Hãy kết nối lại và cấp quyền.');
    try { return await transport(tokens, resource, params); }
    catch (error) {
      const status = Number(error.response?.status || error.status || error.code);
      if (status === 401 || error.message === 'invalid_grant') fail(409, 'DRIVE_RECONNECT', 'Token Drive không còn hợp lệ. Hãy kết nối lại.');
      if (status === 403) fail(403, 'DRIVE_FORBIDDEN', 'Google Drive từ chối truy cập. Kiểm tra quyền thư mục, scope hoặc hạn mức API.');
      if (status === 404) fail(404, 'DRIVE_NOT_FOUND', 'Không tìm thấy file hoặc bạn không có quyền truy cập.');
      if (status === 400) fail(400, 'DRIVE_PAGE', 'Trang dữ liệu không còn hợp lệ. Hãy bấm Đồng bộ ngay.');
      if (status === 429) fail(503, 'DRIVE_QUOTA', 'Drive đang giới hạn yêu cầu. Vui lòng thử lại sau.');
      fail(502, 'DRIVE_UNAVAILABLE', 'Không kết nối được Google Drive. Vui lòng thử lại.');
    }
  }
  const get = async id => {
    const file = await request(`files/${driveId(id)}`, { fields, supportsAllDrives: true });
    if (file.trashed) fail(404, 'DRIVE_TRASHED', 'File đã nằm trong thùng rác.');
    return file;
  };
  // Resolve ancestry afresh, never trust a client breadcrumb or a previous listing.
  async function inside(id, wantFolder = false) {
    const target = await get(id);
    if (target.mimeType === SHORTCUT || (wantFolder && target.mimeType !== FOLDER)) fail(400, 'DRIVE_TYPE', 'Không hỗ trợ shortcut hoặc đối tượng không phải thư mục.');
    const chain = [target], seen = new Set([target.id]);
    let node = target;
    while (node.id !== root) {
      if (!node.parents?.length || chain.length >= 100) fail(403, 'DRIVE_OUTSIDE_ROOT', 'Đối tượng không nằm trong cây thư mục gốc được phép.');
      const parentId = node.parents[0];
      if (seen.has(parentId)) fail(403, 'DRIVE_OUTSIDE_ROOT', 'Cây thư mục không hợp lệ.');
      seen.add(parentId); node = await get(parentId);
      if (node.mimeType !== FOLDER) fail(403, 'DRIVE_OUTSIDE_ROOT', 'Cây thư mục không hợp lệ.');
      chain.push(node);
    }
    return { target, breadcrumb: chain.reverse().map(f => ({ id: f.id, name: f.name })) };
  }
  const signature = body => createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  function encodePage(folder, page) {
    if (!page) return null;
    const body = Buffer.from(JSON.stringify({ root, folder, page, expires: Date.now() + 30 * 60 * 1000 })).toString('base64url');
    return `${body}.${signature(body)}`;
  }
  function decodePage(folder, value) {
    if (!value) return undefined;
    try {
      if (typeof value !== 'string' || value.length > 16000) throw new Error();
      const [body, sig, extra] = value.split('.'), expected = signature(body);
      if (extra || !sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error();
      const data = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (data.folder !== folder || data.root !== root || data.expires < Date.now() || typeof data.page !== 'string') throw new Error();
      return data.page;
    } catch { fail(400, 'DRIVE_PAGE', 'Phân trang không hợp lệ. Hãy bấm Đồng bộ ngay.'); }
  }
  return {
    async list(folder = root, pageToken) {
      driveId(folder);
      const page = decodePage(folder, pageToken);
      const { breadcrumb } = await inside(folder, true);
      const data = await request('files', { q: `'${folder}' in parents and trashed = false`, fields: `nextPageToken,incompleteSearch,files(${fields})`, pageSize: 50, orderBy: 'folder,name', pageToken: page, spaces: 'drive', supportsAllDrives: true, includeItemsFromAllDrives: true });
      return { folderId: folder, breadcrumb, files: (data.files || []).map(f => ({ ...fileSnapshot(f), is_folder: f.mimeType === FOLDER, is_shortcut: f.mimeType === SHORTCUT })), nextPageToken: encodePage(folder, data.nextPageToken), incompleteSearch: !!data.incompleteSearch, syncedAt: new Date().toISOString() };
    },
    async file(id) {
      const { target } = await inside(id);
      if (target.mimeType === FOLDER) fail(400, 'DRIVE_TYPE', 'Chỉ gắn file, không gắn thư mục.');
      return fileSnapshot(target);
    }
  };
}
