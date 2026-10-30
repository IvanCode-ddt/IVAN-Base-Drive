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
export const SPOTLIGHT_WIDTHS=[640,960,1440];
export function spotlightImageSet(value){return isUploadPath(value)?SPOTLIGHT_WIDTHS.map(width=>({width,url:`images/spotlight-${value.slice(8,-5)}-${width}.webp`})) : [];}
export const CONTENT_FIELDS={
 app:[['version','Phiên bản',80],['platform','Hệ điều hành hỗ trợ',200],['size_label','Dung lượng (Admin cung cấp)',80],['developer','Nhà phát triển',160],['content_updated_at','Ngày cập nhật nội dung',10,'date'],['format','Định dạng',80]],
 game:[['version','Phiên bản',80],['platform','Nền tảng',200],['size_label','Dung lượng (Admin cung cấp)',80],['genre','Thể loại',160],['system_requirements','Yêu cầu cấu hình',3000,'textarea']],
 film:[['release_year','Năm phát hành',4,'year'],['duration','Thời lượng',80],['quality','Chất lượng video',80],['format','Định dạng',80],['size_label','Dung lượng (Admin cung cấp)',80],['language','Ngôn ngữ / phụ đề',160]],
 music:[['artist','Nghệ sĩ',160],['album','Album',160],['duration','Thời lượng',80],['format','Định dạng âm thanh',80],['size_label','Dung lượng (Admin cung cấp)',80]],
 other:[['file_type','Loại file',120],['size_label','Dung lượng (Admin cung cấp)',80],['extra_description','Mô tả bổ sung',1000,'textarea']],
};
export const LEGACY_CONTENT_FIELDS={game:[['system_requirements','Yêu cầu cấu hình',3000,'textarea']]};
export function publicMetadata(value,category){
 const fields=[...(CONTENT_FIELDS[category]||[]),...(LEGACY_CONTENT_FIELDS[category]||[])];
 return Object.fromEntries(fields.filter(([key,,max])=>typeof value?.[key]==='string'&&value[key].trim()&&value[key].length<=max).map(([key])=>[key,value[key].trim()]));
}
export function formatBytes(value){
 if(!/^(?:0|[1-9]\d*)$/.test(String(value??'')))return '';
 const bytes=Number(value);if(!Number.isSafeInteger(bytes))return '';
 const unit=bytes?Math.min(4,Math.floor(Math.log(bytes)/Math.log(1024))):0;
 return`${(bytes/1024**unit).toLocaleString('vi-VN',{maximumFractionDigits:2})} ${['B','KiB','MiB','GiB','TiB'][unit]}`;
}
export const MEDIA_TYPES=['video/mp4','video/webm','video/ogg','audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/flac','audio/webm'];
export function mediaURL(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||[...url.searchParams.keys()].some(key=>/^(access_token|refresh_token|oauth_token|id_token|client_secret)$/i.test(key)))return '';return url.href;}catch{return '';}
}
export function directMediaURL(value){const valid=mediaURL(value);if(!valid)return '';const host=new URL(valid).hostname;return ['drive.google.com','docs.google.com','drive.usercontent.google.com'].includes(host)?'':valid;}
export function drivePreview(value){
 const valid=mediaURL(value);if(!valid)return null;const url=new URL(valid),match=url.pathname.match(/^\/file\/d\/([a-zA-Z0-9_-]{1,200})\/(?:view|preview)\/?$/);
 if(url.hostname!=='drive.google.com'||!match)return null;
 const output=new URL(`https://drive.google.com/file/d/${match[1]}/preview`);const key=[...url.searchParams].find(([key])=>key.toLowerCase()==='resourcekey')?.[1];if(key)output.searchParams.set('resourcekey',key);
 return{file_id:match[1],url:output.href};
}
export function publicMediaSources(sources,category,files=[]){
 if(!['film','music'].includes(category))return [];
 const prefix=category==='film'?'video/':'audio/';
 return(Array.isArray(sources)?sources:[]).slice(0,10).flatMap(source=>{
  if(source?.sharing_confirmed!==true)return [];
  const label=typeof source.label==='string'?source.label.slice(0,120):'Nguồn phát';
  if(source.kind==='direct'&&MEDIA_TYPES.includes(source.mime_type)&&source.mime_type.startsWith(prefix)&&directMediaURL(source.url))return[{kind:'direct',label,url:directMediaURL(source.url),mime_type:source.mime_type}];
  if(source.kind==='drive_preview'){
   const preview=drivePreview(source.url),file=files.find(file=>file.file_id===preview?.file_id&&file.sharing_confirmed===1&&file.sharing_access==='anyone'&&file.mime_type?.startsWith(prefix));
   if(!preview||!file)return [];
   const url=new URL(preview.url),view=mediaURL(file.web_url);const key=file.resource_key||(view?[...new URL(view).searchParams].find(([key])=>key.toLowerCase()==='resourcekey')?.[1]:'');if(key)url.searchParams.set('resourcekey',key);
   return[{kind:'drive_preview',label:label||file.name,url:url.href,file_id:file.file_id,mime_type:file.mime_type}];
  }
  return [];
 });
}
export function mediaChoices(post,files=[]){
 const prefix=post.category==='film'?'video/':post.category==='music'?'audio/':'';if(!prefix)return [];
 const choices=(Array.isArray(post.media_sources)?post.media_sources:[]).filter(source=>source&&source.sharing_confirmed!==false).flatMap(source=>{
  if(source.kind==='direct'&&source.mime_type?.startsWith(prefix)&&MEDIA_TYPES.includes(source.mime_type)&&directMediaURL(source.url))return[{...source,url:directMediaURL(source.url)}];
  const preview=source.kind==='drive_preview'?drivePreview(source.url):null;
  return preview&&files.some(file=>file.file_id===preview.file_id&&file.mime_type?.startsWith(prefix))?[{...source,...preview}]:[];
 });
 const legacy=directMediaURL(post.media_url);if(legacy&&!choices.some(source=>source.url===legacy))choices.push({kind:'direct',label:'Nguồn media đã cấu hình',url:legacy,mime_type:''});
 return choices;
}
export function initPlayers(root){
 const disposers=[];
 for(const widget of root.querySelectorAll('[data-media-sources]')){
  if(widget.dataset.preview==='true')continue;
  let sources;try{sources=JSON.parse(widget.dataset.mediaSources);}catch{continue;}
  const select=widget.querySelector('select'),button=widget.querySelector('[data-media-launch]'),open=widget.querySelector('[data-media-open]'),stage=widget.querySelector('[data-media-stage]'),notice=widget.querySelector('[data-media-status]');let current=null,generation=0;
  const stop=()=>{generation++;if(current instanceof HTMLMediaElement){current.onerror=null;current.pause();current.removeAttribute('src');current.load();}current=null;stage.replaceChildren();};
  const update=()=>{stop();const source=sources[Number(select.value)];button.textContent=source?.kind==='drive_preview'?'Xem bản xem trước Drive':'Phát';button.disabled=!source;
   if(open){open.hidden=!source;if(source){const view=new URL(source.url);if(source.kind==='drive_preview')view.pathname=view.pathname.replace(/\/preview\/?$/,'/view');open.href=view.href;open.textContent=source.kind==='drive_preview'?'Xem trên Google Drive ↗':'Mở nguồn trực tiếp ↗';}}
   if(source?.kind==='direct'&&source.mime_type&&!document.createElement(widget.dataset.mediaKind).canPlayType(source.mime_type)){button.disabled=true;notice.textContent='Trình duyệt không hỗ trợ định dạng này. Bạn vẫn có thể tải hoặc mở file bên dưới.';}else notice.textContent=source?'Nguồn chỉ được tải khi bạn chủ động nhấn nút.':'';
  };
  select.addEventListener('change',update);update();
  button.addEventListener('click',()=>{
   stop();const source=sources[Number(select.value)];if(!source)return;const token=generation;
   if(source.kind==='drive_preview'){
    const preview=drivePreview(source.url);if(!preview)return;
    const iframe=document.createElement('iframe');iframe.src=preview.url;iframe.title='Google Drive preview · '+source.label;iframe.referrerPolicy='no-referrer';iframe.allowFullscreen=true;iframe.allow='fullscreen; encrypted-media';iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups allow-forms allow-presentation');
    iframe.onerror=()=>{if(token===generation){stop();notice.textContent='Không tải được preview. Hãy dùng Xem trên Google Drive bên dưới.';}};current=iframe;stage.append(iframe);notice.textContent='Bản xem trước do Google Drive cung cấp, không phải player HTML5. Nếu không tải/phát được, hãy mở Google Drive bên dưới.';return;
   }
   const url=directMediaURL(source.url);if(!url)return;
   const player=document.createElement(widget.dataset.mediaKind);player.className='content-player';player.controls=true;player.preload='none';player.autoplay=false;player.playsInline=true;
   if(player.tagName==='VIDEO'&&widget.dataset.poster)player.poster=widget.dataset.poster;
   player.onerror=()=>{if(token===generation){stop();notice.textContent='Nguồn chưa phát được do định dạng, quyền truy cập hoặc mạng. Hãy mở nguồn trực tiếp hoặc tải file đính kèm bên dưới nếu có.';}};
   player.src=url;current=player;stage.append(player);notice.textContent='Dùng điều khiển của trình duyệt để phát, tạm dừng, tua và điều chỉnh âm lượng.';
   player.play().catch(error=>{if(token!==generation||error.name==='AbortError')return;
    if(['NotSupportedError','NetworkError'].includes(error.name)){stop();notice.textContent='Nguồn chưa phát được. Bạn vẫn có thể tải/mở file bên dưới.';}
    else notice.textContent='Nhấn Play trên trình phát. Nếu nguồn không tương thích, hãy tải/mở file bên dưới.';
   });
  });
  disposers.push(stop);
 }
 return()=>{for(const stop of disposers)stop();};
}
