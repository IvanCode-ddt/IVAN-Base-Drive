export const categories = ['film', 'game', 'music', 'app', 'other'];
export class InputError extends Error {}
function text(body, key, max, required = false) {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new InputError(`${key}: không hợp lệ hoặc vượt ${max} ký tự.`);
  return value.trim();
}
function httpsUrl(value, key) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new InputError(`${key}: cần URL HTTPS đầy đủ.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new InputError(`${key}: chỉ chấp nhận HTTPS không chứa thông tin đăng nhập.`);
  return url.href;
}
export function validatePost(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('Dữ liệu phải là object.');
  const title = text(body, 'title', 160, true), slug = text(body, 'slug', 180, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new InputError('slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.');
  if (!categories.includes(body.category)) throw new InputError('Danh mục không hợp lệ.');
  if (!['draft', 'published'].includes(body.status)) throw new InputError('Trạng thái không hợp lệ.');
  const description = text(body, 'description', 500, true);
  const introduction = text(body, 'introduction', 30000), instructions = text(body, 'instructions', 30000);
  const cover_url = httpsUrl(text(body, 'cover_url', 2048), 'cover_url');
  const attachment_url = httpsUrl(text(body, 'attachment_url', 2048), 'attachment_url');
  const media_url = httpsUrl(text(body, 'media_url', 2048), 'media_url');
  const drive_file_id = text(body, 'drive_file_id', 200);
  if (drive_file_id && !/^[\w-]{10,200}$/.test(drive_file_id)) throw new InputError('Google Drive File ID không hợp lệ.');
  if (!Array.isArray(body.images) || body.images.length > 12) throw new InputError('Tối đa 12 ảnh minh họa.');
  const images = body.images.map(value => {
    if (typeof value !== 'string' || !value || value.length > 2048) throw new InputError('URL ảnh không hợp lệ.');
    return httpsUrl(value, 'images');
  });
  return { title, slug, category: body.category, description, introduction, instructions, cover_url, images, attachment_url, drive_file_id, media_url, status: body.status };
}