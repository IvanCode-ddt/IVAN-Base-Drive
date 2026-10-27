export const UPLOAD_PATH = /^uploads\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/;
export function isUploadPath(value) { return typeof value === 'string' && UPLOAD_PATH.test(value); }
export function imageURL(value) {
  if (isUploadPath(value)) {
    return globalThis.location?.pathname?.startsWith('/admin') ? `/admin/media/${value.slice(8)}` : value;
  }
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:''; } catch {return '';}
}
export function localImages(post) {
  const paths=[post.cover_url,...(post.images||[])];
  for(const text of [post.introduction||'',post.instructions||''])for(const match of text.matchAll(/!\[[^\]\n]*\]\(([^\s)]+)\)/g))paths.push(match[1]);
  return [...new Set(paths.filter(isUploadPath))];
}
