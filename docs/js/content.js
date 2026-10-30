import { CATEGORIES } from './data.js?v=14';
import { imageURL,CONTENT_FIELDS,publicMetadata,formatBytes,mediaChoices,spotlightImageSet } from './media.js?v=17';
import { renderMarkdown } from './markdown.js?v=15';
export const categoryName=id=>CATEGORIES.find(c=>c.id===id)?.name||'Khác';
export function escapeHTML(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function safeDriveURL(value){try{const u=new URL(safeURL(value));return ['drive.google.com','docs.google.com','drive.usercontent.google.com'].includes(u.hostname)&&!u.searchParams.has('access_token')&&!u.searchParams.has('oauth_token')?u.href:'';}catch{return '';}}
export function cover(p,extra=''){
 const url=imageURL(p.cover_url);
 return `<div class="cover ${extra}" style="--tone:#23322b;--glow:#536943;--ink:#c8f477">${url?`<img class="real-cover" src="${escapeHTML(url)}" alt="${escapeHTML(p.title)}" loading="lazy" referrerpolicy="no-referrer">`:`<span class="cover-symbol" aria-hidden="true">✦</span><span class="cover-word">${escapeHTML(categoryName(p.category))}</span>`}</div>`;
}
export function spotlightHTML(post,{active=true,index=0}={}){
 const url=imageURL(post.cover_url),variants=globalThis.location?.pathname?.startsWith('/admin')?[]:spotlightImageSet(post.cover_url),source=variants[1]?.url||url;
 const image=source?`<img class="spotlight-cover" ${active?`src="${escapeHTML(source)}"`:`data-src="${escapeHTML(source)}"`} ${variants.length?`${active?`srcset="${variants.map(item=>`${item.url} ${item.width}w`).join(', ')}"`:`data-srcset="${variants.map(item=>`${item.url} ${item.width}w`).join(', ')}"`} sizes="(max-width: 1200px) 100vw, 1200px"`:''} alt="" decoding="async" referrerpolicy="no-referrer">`:'';
 const route=post.content_type==='music_album'?'album':'post';
 return`<article class="spotlight-slide${active?' is-active':''}" data-highlight-slide data-index="${index}" aria-hidden="${!active}"${active?'':' inert'}>${image}<div class="spotlight-copy"><span class="eyebrow">HIGHLIGHT · ${escapeHTML(categoryName(post.category))}</span><h1 id="spotlight-title-${index}">${escapeHTML(post.title)}</h1><p>${escapeHTML(post.description)}</p><a class="primary-button" href="#${route}/${encodeURIComponent(post.slug)}">Mở bài viết <span aria-hidden="true">↗</span></a></div></article>`;
}
export function albumCardHTML(album){
 const image=imageURL(album.cover_url);
 const count=Array.isArray(album.bundle_downloads)?album.bundle_downloads.length:album.bundle_download?1:0;
 return`<article><a class="album-card" href="#album/${encodeURIComponent(album.slug)}">${image?`<img src="${escapeHTML(image)}" alt="" loading="lazy" decoding="async">`:'<div class="album-cover-placeholder" aria-hidden="true">♫</div>'}<div class="album-card-copy"><span class="eyebrow">ALBUM NHẠC${count?` · ${count} GÓI TẢI`:''}</span><h3>${escapeHTML(album.title)}</h3><p>${escapeHTML(album.artist||'Album nhạc')}</p><span class="album-card-cta">Mở album <span aria-hidden="true">↗</span></span></div></a></article>`;
}
export function albumDetailHTML(album){
 const image=imageURL(album.cover_url);
 const bundles=Array.isArray(album.bundle_downloads)?album.bundle_downloads:album.bundle_download?[album.bundle_download]:[];
 const actions=bundles.length===1?(()=>{
  const item=bundles[0],download=safeDriveURL(item.download_url||item.url),open=safeDriveURL(item.open_url||item.view_url);
  return`<div class="album-download-actions">${download?`<a class="primary-button" href="${escapeHTML(download)}" target="_blank" rel="noopener noreferrer" download>Tải album</a>`:''}${open?`<a class="secondary-button" href="${escapeHTML(open)}" target="_blank" rel="noopener noreferrer">Mở trên Google Drive</a>`:''}</div>`;
 })():bundles.length?`<section class="album-download-section" aria-labelledby="album-download-title"><h2 id="album-download-title">File tải album</h2><ul class="album-download-list">${bundles.map(item=>{
  const download=safeDriveURL(item.download_url||item.url),open=safeDriveURL(item.open_url||item.view_url);
  return`<li><strong>${escapeHTML(item.name||'Gói album')}</strong><div>${download?`<a class="secondary-button" href="${escapeHTML(download)}" target="_blank" rel="noopener noreferrer" download>Tải xuống</a>`:''}${open?`<a class="secondary-button" href="${escapeHTML(open)}" target="_blank" rel="noopener noreferrer">Mở trên Google Drive</a>`:''}</div></li>`;
 }).join('')}</ul></section>`:'<p class="field-help">Chưa có file ZIP/RAR/7z được chia sẻ công khai.</p>';
 return`<a class="back-link" href="#music">← Trở về Nhạc</a><article class="album-detail"><header class="album-detail-header">${image?`<img class="album-detail-cover" src="${escapeHTML(image)}" alt="Ảnh bìa ${escapeHTML(album.title)}" decoding="async">`:'<div class="album-detail-cover album-cover-placeholder" aria-hidden="true">♫</div>'}<div><p class="eyebrow">ALBUM NHẠC</p><h1 tabindex="-1">${escapeHTML(album.title)}</h1>${album.artist?`<p class="album-artist">${escapeHTML(album.artist)}</p>`:''}${album.description?`<p>${escapeHTML(album.description)}</p>`:''}${actions}</div></header></article>`;
}
function fileDate(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'}).format(date):'';}
function mimeFormat(mime){return({'application/zip':'ZIP','video/mp4':'MP4','video/webm':'WebM','audio/mpeg':'MP3','audio/wav':'WAV','audio/flac':'FLAC','audio/ogg':'OGG'})[mime]||mime||'';}
function definitionList(rows){return `<dl class="file-facts">${rows.filter(([,value])=>value).map(([label,value])=>`<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join('')}</dl>`;}
export function smartMetadataHTML(post,files=[]){
 const metadata=publicMetadata(post.metadata,post.category),hiddenBasicFields=new Set(['size_label','content_updated_at','platform']),rows=(CONTENT_FIELDS[post.category]||[]).filter(([key])=>metadata[key]&&!hiddenBasicFields.has(key)).map(([key,label])=>[label,metadata[key]]);
 const formats=[...new Set(files.map(file=>mimeFormat(file.mime_type)).filter(Boolean))];if(!metadata.format&&!metadata.file_type&&formats.length)rows.push(['Định dạng / MIME',formats.join(', ')]);
 return rows.length?`<section class="detail-section"><h2>Thông tin bổ sung</h2>${definitionList(rows)}</section>`:'';
}
export function basicInfoHTML(post,files=post.drive_files||[]){
 const linkedFiles=files.length?`<ul class="basic-file-sizes">${files.map(file=>`<li><span>${escapeHTML(file.name||file.file_id||'File tải về')}</span><strong>${escapeHTML(formatBytes(file.size)||'Chưa có thông tin')}</strong></li>`).join('')}</ul>`:'<span>Chưa có thông tin</span>';
 const installSize=typeof post.install_size==='string'&&post.install_size.trim()?escapeHTML(post.install_size):'Chưa có thông tin';
 const updatedAt=fileDate(post.updated_at)||'Chưa có thông tin';
 const systems=(Array.isArray(post.operating_systems)?post.operating_systems:[]).filter(value=>['Windows','iOS','Linux'].includes(value));
 const systemBadges=systems.length?systems.map(value=>`<span class="system-badge">${escapeHTML(value)}</span>`).join(''):'<span>Chưa có thông tin</span>';
 return`<section class="detail-section basic-info"><h2>Thông tin cơ bản</h2><dl class="basic-info-grid"><div><dt>Dung lượng file tải về</dt><dd>${linkedFiles}</dd></div><div><dt>Dung lượng cần thiết để cài đặt</dt><dd>${installSize}</dd></div><div><dt>Cập nhật lần cuối</dt><dd>${escapeHTML(updatedAt)}</dd></div><div><dt>Hệ điều hành hỗ trợ</dt><dd class="system-badges">${systemBadges}</dd></div></dl></section>`;
}
export function systemRequirementsHTML(post){
 const requirements=[['minimum_requirements','Tối thiểu','requirements-card'],['recommended_requirements','Khuyến nghị','requirements-card requirements-card--recommended']]
  .filter(([key])=>typeof post[key]==='string'&&post[key].trim())
  .map(([key,title,className])=>`<article class="${className}"><h3>${title}</h3><p>${escapeHTML(post[key])}</p></article>`);
 return requirements.length?`<section class="detail-section system-requirements"><h2>Cấu hình hệ thống</h2><div class="requirements-grid">${requirements.join('')}</div></section>`:'';
}
function fileFacts(file){return definitionList([['Tên file',file.name],['MIME type',file.mime_type],['Dung lượng',formatBytes(file.size)],['Cập nhật',fileDate(file.modified_time)]]);}
function mediaHTML(post,files,preview){
 if(post.category!=='film')return '';
 const choices=mediaChoices(post,files),kind='video',poster=imageURL(post.cover_url);
 return`<section class="detail-section"><h2>Xem phim</h2>${choices.length?`<div class="media-widget" data-media-sources="${escapeHTML(JSON.stringify(choices))}" data-media-kind="${kind}" data-poster="${escapeHTML(poster)}" data-preview="${preview}"><label>Chọn nguồn phát<select aria-label="Chọn nguồn phát" ${preview?'disabled':''}>${choices.map((source,i)=>`<option value="${i}">${escapeHTML(source.label)} · ${source.kind==='drive_preview'?'Google Drive preview':'HTML5'}</option>`).join('')}</select></label><div class="file-download-actions"><button class="secondary-button" type="button" data-media-launch ${preview?'disabled':''}>Phát / Xem</button><a data-media-open class="secondary-button" target="_blank" rel="noopener noreferrer" hidden></a></div><div class="media-stage" data-media-stage data-kind="${kind}"></div><p data-media-status role="status">${preview?'Xem trước Admin không tải hoặc phát nguồn media.':'Chọn nguồn rồi nhấn Phát. Không tải media trước khi bạn yêu cầu.'}</p></div>`:'<div class="media-placeholder"><p>Chưa có nguồn phát trực tuyến phù hợp.</p></div>'}</section>`;
}
export function detailHTML(p,{preview=false}={}){
 const attachment=safeURL(p.attachment_url);
 const privateFiles=preview?(p.drive_files||[]).filter(f=>f.sharing_confirmed!==1||f.sharing_access==='restricted'):[];
 const driveFiles=(p.drive_files||[]).filter(f=>f.sharing_confirmed===undefined?!preview:(f.sharing_confirmed===1&&f.sharing_access!=='restricted'));
 const fileEntries=driveFiles.map(file=>({
  name:file.name||file.file_id||'File Google Drive',
  download:file.can_download===1?safeDriveURL(file.download_url):'',
  view:safeDriveURL(file.web_url)
 }));
 const attachmentIsDuplicate=fileEntries.some(file=>file.download===attachment||file.view===attachment);
 if(attachment&&!attachmentIsDuplicate){
  if(safeDriveURL(attachment))fileEntries.push({name:'Google Drive',download:'',view:safeDriveURL(attachment)});
  else fileEntries.push({name:p.attachment_name||'Tệp đính kèm',download:attachment,view:''});
 }
 const fileRows=fileEntries.map(file=>`<li class="download-file"><strong>${escapeHTML(file.name)}</strong><div class="file-download-actions">${file.download?`<a class="primary-button download-link" href="${escapeHTML(file.download)}" target="_blank" rel="noopener noreferrer">↓ Tải xuống · ${escapeHTML(file.name)}</a>`:'<span>Không có liên kết tải trực tiếp phù hợp.</span>'}${file.view?`<a class="secondary-button download-link" href="${escapeHTML(file.view)}" target="_blank" rel="noopener noreferrer">Xem trên Google Drive ↗</a>`:''}</div></li>`).join('');
 const downloadControls=`${fileRows?`<ul class="download-file-list">${fileRows}</ul>`:'<button class="download-button" disabled>Chưa có file tải được công khai</button><p>Chưa có liên kết tải được công khai.</p>'}${driveFiles.length?'<p>Quyền truy cập và xác nhận tải do Google Drive kiểm soát.</p>':''}`;
 const fileDetails=driveFiles.length||privateFiles.length?`<details class="detail-section file-details"><summary>Chi tiết tệp</summary>${driveFiles.map(file=>`<article><h3>${escapeHTML(file.name||file.file_id)}</h3>${fileFacts(file)}</article>`).join('')}${privateFiles.map(file=>`<p><strong>${escapeHTML(file.name||file.file_id)}</strong> — ${file.sharing_access==='restricted'?'Restricted: không công khai':'Chưa xác nhận chia sẻ công khai'} · Chỉ quản trị</p>`).join('')}</details>`:'';
 const mediaSection=mediaHTML(p,driveFiles,preview);
 return `<div class="detail-layout"><div><header class="detail-header"><span class="demo-tag">${escapeHTML(categoryName(p.category))}${preview?' · XEM TRƯỚC':''}</span><h1 tabindex="-1">${escapeHTML(p.title)}</h1><p class="detail-lead">${escapeHTML(p.description)}</p><button class="mobile-download-jump" type="button" data-download-jump>↓ Tới khu vực tải</button></header>${cover(p,'detail-cover')}${basicInfoHTML(p,driveFiles)}${smartMetadataHTML(p,driveFiles)}<section class="detail-section"><h2>Giới thiệu</h2><div class="markdown-content">${renderMarkdown(p.introduction||'Chưa có nội dung giới thiệu.')}</div></section>${p.category==='game'?systemRequirementsHTML(p):''}<section class="detail-section"><h2>${p.category==='game'?'Hướng dẫn cài đặt':'Hướng dẫn sử dụng'}</h2><div class="markdown-content">${renderMarkdown(p.instructions||'Chưa có hướng dẫn.')}</div></section>${p.images?.length?`<section class="detail-section"><h2>Hình ảnh minh họa</h2><div class="image-gallery">${p.images.filter(imageURL).map((url,i)=>`<img src="${escapeHTML(imageURL(url))}" alt="${escapeHTML(p.title)} — ảnh ${i+1}" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div></section>`:''}${mediaSection}${fileDetails}</div><aside id="download-panel" class="download-panel" tabindex="-1"><h2>Thông tin nội dung</h2><dl><div><dt>Danh mục</dt><dd>${escapeHTML(categoryName(p.category))}</dd></div><div><dt>Trạng thái</dt><dd>${preview?(p.status==='published'?'Xuất bản':'Bản nháp'):'Đã xuất bản'}</dd></div>${p.updated_at?`<div><dt>Cập nhật</dt><dd>${new Date(p.updated_at).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</dd></div>`:''}</dl>${downloadControls}</aside></div>`;
}
