// Shared explicit allowlist for Express and the static exporter.
import { isUploadPath } from '../js/media.js';
function publicURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if ([...url.searchParams.keys()].some(key => /^(access_token|oauth_token|refresh_token|client_secret|id_token)$/i.test(key))) return '';
    return url.href;
  } catch { return ''; }
}
export function publicPost(post) {
  if (!post || post.status !== 'published' || post.deleted_at) return null;
  return {
    id:post.id, slug:post.slug, title:post.title, category:post.category,
    description:post.description, introduction:post.introduction, instructions:post.instructions,
    cover_url:isUploadPath(post.cover_url)?post.cover_url:publicURL(post.cover_url), images:(post.images || []).map(value=>isUploadPath(value)?value:publicURL(value)).filter(Boolean),
    attachment_url:publicURL(post.attachment_url), media_url:publicURL(post.media_url),
    status:'published', created_at:post.created_at, updated_at:post.updated_at,
    is_pinned:post.is_pinned===1||post.is_pinned===true,pin_order:Number.isInteger(post.pin_order)?post.pin_order:0,
    drive_files:(post.drive_files || []).filter(file => file.sharing_confirmed === 1 && file.sharing_access!=='restricted').map(file => ({
      file_id:file.file_id, name:file.name, mime_type:file.mime_type, size:file.size,
      modified_time:file.modified_time, web_url:publicURL(file.web_url),
      download_url:file.can_download === 1 ? publicURL(file.download_url) : '', can_download:file.can_download,
    })),
  };
}
