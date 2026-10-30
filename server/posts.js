export const categories = ['film', 'game', 'music', 'app', 'other'];
import { isUploadPath,CONTENT_FIELDS,MEDIA_TYPES,directMediaURL,drivePreview } from '../js/media.js';
export class InputError extends Error {}
export function validatePin(body){
  if(!body||![true,false,0,1].includes(body.is_pinned)||!Number.isInteger(body.pin_order)||body.pin_order<0||body.pin_order>9999)throw new InputError('Thông tin ghim không hợp lệ; thứ tự từ 0 đến 9999.');
  return{is_pinned:Number(body.is_pinned),pin_order:body.pin_order};
}
export function validateHighlightConfig(body,db){
  if(!body||typeof body.enabled!=='boolean'||!Number.isInteger(body.interval_seconds)||body.interval_seconds<3||body.interval_seconds>20||!Array.isArray(body.slides)||body.slides.length>20)throw new InputError('Cấu hình Highlight không hợp lệ; thời gian từ 3 đến 20 giây, tối đa 20 slide.');
  const seen=new Set(),slides=body.slides.map(slide=>{
    if(!slide||typeof slide.post_id!=='string'||slide.post_id.length>64||typeof slide.enabled!=='boolean'||seen.has(slide.post_id))throw new InputError('Slide Highlight không hợp lệ hoặc bị trùng.');
    seen.add(slide.post_id);
    const post=db.get(slide.post_id);
    if(!post||post.status!=='published')throw new InputError('Chỉ thêm được bài viết Published còn hoạt động vào Highlight.');
    return{post_id:slide.post_id,enabled:slide.enabled};
  });
  return{enabled:body.enabled,interval_seconds:body.interval_seconds,slides};
}
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
  const coverValue=text(body,'cover_url',2048);
  const cover_url = isUploadPath(coverValue)?coverValue:httpsUrl(coverValue, 'cover_url');
  const attachment_url = httpsUrl(text(body, 'attachment_url', 2048), 'attachment_url');
  const media_url = httpsUrl(text(body, 'media_url', 2048), 'media_url');
  const drive_file_id = text(body, 'drive_file_id', 200);
  if (drive_file_id && !/^[\w-]{10,200}$/.test(drive_file_id)) throw new InputError('Google Drive File ID không hợp lệ.');
  if (!Array.isArray(body.images) || body.images.length > 12) throw new InputError('Tối đa 12 ảnh minh họa.');
  const images = body.images.map(value => {
    if (typeof value !== 'string' || !value || value.length > 2048) throw new InputError('URL ảnh không hợp lệ.');
    return isUploadPath(value)?value:httpsUrl(value, 'images');
  });
  const pin=Object.hasOwn(body,'is_pinned')||Object.hasOwn(body,'pin_order')?validatePin(body):{};
  const metadata={};if(Object.hasOwn(body,'metadata')){
    const value=body.metadata,fields=new Map(Object.values(CONTENT_FIELDS).flat().map(field=>[field[0],field]));
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>fields.size)throw new InputError('Metadata phải là object gồm các trường hỗ trợ.');
    for(const[key,content]of Object.entries(value)){
      const field=fields.get(key);if(!field||typeof content!=='string'||content.length>field[2])throw new InputError('Trường metadata không hợp lệ hoặc quá dài.');
      if(content.trim()){
        if(key==='release_year'&&(!/^\d{4}$/.test(content)||Number(content)<1888||Number(content)>2200))throw new InputError('Năm phát hành không hợp lệ.');
        if(key==='content_updated_at'&&(!/^\d{4}-\d{2}-\d{2}$/.test(content)||!Number.isFinite(Date.parse(content))||new Date(content).toISOString().slice(0,10)!==content))throw new InputError('Ngày cập nhật nội dung không hợp lệ.');
        metadata[key]=content.trim();
      }
    }
  }
  const media_sources=[];if(Object.hasOwn(body,'media_sources')){
    if(!Array.isArray(body.media_sources)||body.media_sources.length>10)throw new InputError('Tối đa 10 nguồn phát.');
    for(const source of body.media_sources){
      if(!source||typeof source!=='object'||typeof source.label!=='string'||!source.label.trim()||source.label.length>120||typeof source.url!=='string'||source.url.length>2048||typeof source.sharing_confirmed!=='boolean')throw new InputError('Nguồn phát cần tên, URL hợp lệ và xác nhận quyền chia sẻ.');
      if(source.kind==='direct'){
        if(!directMediaURL(source.url)||!MEDIA_TYPES.includes(source.mime_type)||(['film','music'].includes(body.category)&&!source.mime_type.startsWith(body.category==='film'?'video/':'audio/')))throw new InputError('Nguồn HTML5 phải là HTTPS media hợp lệ, đúng loại. Không dùng URL Drive làm stream trực tiếp.');
        media_sources.push({kind:'direct',label:source.label.trim(),url:directMediaURL(source.url),mime_type:source.mime_type,sharing_confirmed:source.sharing_confirmed});
      }else if(source.kind==='drive_preview'){
        const preview=drivePreview(source.url);if(!preview||(Array.isArray(body.drive_file_ids)&&!body.drive_file_ids.includes(preview.file_id)))throw new InputError('Drive preview phải là link file đã gắn vào bài viết.');
        media_sources.push({kind:'drive_preview',label:source.label.trim(),...preview,sharing_confirmed:source.sharing_confirmed});
      }else throw new InputError('Loại nguồn phát không hợp lệ.');
    }
  }
  return { title, slug, category: body.category, description, introduction, instructions, cover_url, images, attachment_url, drive_file_id, media_url, status: body.status,...pin,...(Object.hasOwn(body,'metadata')?{metadata}:{}),...(Object.hasOwn(body,'media_sources')?{media_sources}:{}) };
}
