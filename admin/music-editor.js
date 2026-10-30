import { initDrivePicker } from './drive-picker.js?v=9';
import { slugify } from './editor.js?v=9';
import { MEDIA_TYPES, imageURL } from '/js/media.js?v=17';
import { createNotifications } from './notifications.js';

const $=selector=>document.querySelector(selector),form=$('#music-form'),notifications=createNotifications();
let csrf='',editingId=null,loadedPost=null,tracks=[],dirty=false;
const audioTypes=MEDIA_TYPES.filter(type=>type.startsWith('audio/'));
function message(text,error=false){$('#music-message').textContent=text;$('#music-message').dataset.error=String(error);}
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw new Error('Phiên đăng nhập đã hết hạn.');}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Yêu cầu không thành công.');return data;
}
function setDirty(){dirty=true;}
function fileOptions(audioOnly=false){
 return driveUI.files().filter(file=>!audioOnly||file.mime_type?.startsWith('audio/'));
}
function renderBundle(selected=''){
 const select=form.elements.bundle_file_id,current=selected||select.value;
 select.replaceChildren(new Option('Không có gói tải toàn bộ',''));
 const bundles=driveUI.files().filter(file=>/(\.zip|\.rar|\.7z)$/i.test(file.name||'')||['application/zip','application/vnd.rar','application/x-rar-compressed','application/x-7z-compressed'].includes(file.mime_type));
 for(const file of bundles)select.add(new Option(`${file.name}${file.sharing_confirmed===1?' · đã xác nhận công khai':' · chưa công khai'}`,file.file_id));
 if(current&&[...select.options].some(option=>option.value===current))select.value=current;
}
function label(text,control){const wrap=document.createElement('label');wrap.textContent=text;wrap.append(control);return wrap;}
function renderTracks(){
 const container=$('#track-rows');container.replaceChildren();
 tracks.forEach((track,index)=>{
  const row=document.createElement('fieldset');row.className='album-track-editor';row.dataset.trackIndex=String(index);
  const legend=document.createElement('legend');legend.textContent=`Bài hát ${index+1}`;row.append(legend);
  const title=document.createElement('input');title.maxLength=160;title.required=true;title.value=track.title||'';title.dataset.field='title';row.append(label('Tên bài hát',title));
  const seconds=document.createElement('input');seconds.type='number';seconds.min='0';seconds.max='86400';seconds.step='1';seconds.value=track.duration_seconds??'';seconds.dataset.field='duration_seconds';row.append(label('Thời lượng (giây, tuỳ chọn)',seconds));
  const source=document.createElement('select');source.dataset.field='source_kind';
  for(const[value,text]of[['direct','Phát trực tiếp · HTML5 HTTPS'],['drive_preview','Xem trước Google Drive'],['download_only','Chỉ tải xuống']])source.add(new Option(text,value));
  source.value=track.source_kind||'drive_preview';row.append(label('Nguồn bài hát',source));
  const url=document.createElement('input');url.type='url';url.maxLength=2048;url.placeholder='https://…/song.mp3';url.value=track.direct_url||'';url.dataset.field='direct_url';row.append(label('URL audio HTTPS',url));
  const mime=document.createElement('select');mime.dataset.field='mime_type';for(const type of audioTypes)mime.add(new Option(type,type));mime.value=track.mime_type||'audio/mpeg';track.mime_type=mime.value;row.append(label('Định dạng audio',mime));
  const file=document.createElement('select');file.dataset.field='drive_file_id';file.add(new Option('Không dùng file Drive cho bài này',''));
  for(const item of fileOptions(true))file.add(new Option(`${item.name}${item.sharing_confirmed===1?' · công khai':' · riêng tư'}`,item.file_id));
  file.value=track.drive_file_id||'';row.append(label('File âm thanh / tải xuống từ Google Drive',file));
  const rights=document.createElement('label');rights.className='sharing-label';
  const consent=document.createElement('input');consent.type='checkbox';consent.checked=track.sharing_confirmed===true||track.sharing_confirmed===1;consent.disabled=track.source_kind!=='direct';consent.dataset.field='sharing_confirmed';rights.append(consent,document.createTextNode('Tôi có quyền chia sẻ nguồn phát trực tiếp này'));row.append(rights);
  const status=document.createElement('p');status.className='track-source-status';
  status.textContent=track.source_kind==='direct'?'Phát trực tiếp bằng HTML5.':track.source_kind==='drive_preview'?'Chỉ mở Google Drive Preview, không tham gia playlist HTML5.':'Chỉ tải; sẽ được bỏ qua khi phát album.';
  row.append(status);
  const actions=document.createElement('div');actions.className='drive-actions';
  for(const[delta,text]of[[-1,'↑ Lên'],[1,'↓ Xuống']]){const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=text;button.disabled=index+delta<0||index+delta>=tracks.length;button.dataset.move=String(delta);actions.append(button);}
  const remove=document.createElement('button');remove.type='button';remove.className='secondary-button';remove.textContent='Gỡ bài hát khỏi album';remove.dataset.removeTrack='true';actions.append(remove);row.append(actions);container.append(row);
 });
}
function renderCover(){
 const target=$('#cover-preview');target.replaceChildren();const value=form.elements.cover_url.value;if(!value)return;
 const image=document.createElement('img');image.src=imageURL(value);image.alt='Ảnh bìa album';image.loading='lazy';image.className='music-cover-preview';target.append(image);
}
const driveUI=initDrivePicker({api,onDirty:()=>{setDirty();renderTracks();renderBundle();}});
function fill(album=null){
 form.reset();editingId=album?.post_id||null;loadedPost=album?.post||null;
 const post=loadedPost;form.elements.title.value=post?.title||'';form.elements.slug.value=post?.slug||'';
 form.elements.description.value=post?.description||'';form.elements.artist.value=album?.artist||'';
 form.elements.release_year.value=album?.release_year??'';form.elements.genre.value=album?.genre||'';
 form.elements.cover_url.value=post?.cover_url||'';form.elements.status.value=post?.status||'draft';
 tracks=(album?.tracks||[]).map(track=>({...track}));
 $('#editor-title').textContent=album?'Chỉnh sửa album':'Album nhạc mới';
 $('#album-status').textContent=post?.status==='published'?'Published':'Bản nháp';$('#album-status').dataset.status=post?.status||'draft';
 $('#saved-info').textContent=post?`ID: ${post.id} · ${post.status} · Cập nhật: ${new Date(post.updated_at).toLocaleString('vi-VN')}`:'';
 driveUI.fill(post);renderBundle(album?.bundle_file_id||'');renderTracks();renderCover();dirty=false;
}
form.elements.title.addEventListener('input',()=>{if(!editingId&&!form.elements.slug.dataset.manual)form.elements.slug.value=slugify(form.elements.title.value);setDirty();});
form.elements.slug.addEventListener('input',()=>{form.elements.slug.dataset.manual='true';setDirty();});
$('#regenerate-slug').addEventListener('click',()=>{form.elements.slug.value=slugify(form.elements.title.value);form.elements.slug.dataset.manual='';setDirty();});
$('#add-track').addEventListener('click',()=>{tracks.push({title:'',duration_seconds:null,source_kind:'drive_preview',direct_url:'',mime_type:'',drive_file_id:'',sharing_confirmed:false});renderTracks();setDirty();});
$('#track-rows').addEventListener('input',event=>{
 const field=event.target.closest('[data-field]'),row=event.target.closest('[data-track-index]');if(!field||!row)return;
 const track=tracks[Number(row.dataset.trackIndex)],key=field.dataset.field;
 track[key]=key==='duration_seconds'?(field.value===''?null:Number(field.value)):key==='sharing_confirmed'?field.checked:field.value;setDirty();
});
$('#track-rows').addEventListener('change',event=>{
 const field=event.target.closest('[data-field]'),row=event.target.closest('[data-track-index]');if(!field||!row)return;
 const track=tracks[Number(row.dataset.trackIndex)],key=field.dataset.field;track[key]=key==='sharing_confirmed'?field.checked:field.value;
 if(key==='source_kind'){
  row.querySelector('[data-field="sharing_confirmed"]').disabled=track.source_kind!=='direct';
  row.querySelector('.track-source-status').textContent=track.source_kind==='direct'?'Phát trực tiếp bằng HTML5.':track.source_kind==='drive_preview'?'Chỉ mở Google Drive Preview, không tham gia playlist HTML5.':'Chỉ tải; sẽ được bỏ qua khi phát album.';
 }
 setDirty();
});
$('#track-rows').addEventListener('click',event=>{
 const row=event.target.closest('[data-track-index]');if(!row)return;const index=Number(row.dataset.trackIndex);
 if(event.target.closest('[data-remove-track]'))tracks.splice(index,1);
 else if(event.target.closest('[data-move]')){const next=index+Number(event.target.closest('[data-move]').dataset.move);[tracks[index],tracks[next]]=[tracks[next],tracks[index]];}
 else return;
 renderTracks();setDirty();
});
form.elements.bundle_file_id.addEventListener('change',()=>setDirty());
form.addEventListener('input',event=>{if(!event.target.matches('#track-rows *'))setDirty();});
$('#cover-upload').addEventListener('change',async event=>{
 const input=event.target,file=input.files[0];if(!file)return;
 if(file.size>5*1024*1024){message('Ảnh bìa tối đa 5 MB.',true);return;}
 input.disabled=true;
 try{const response=await fetch('/api/admin/images',{method:'POST',headers:{'Content-Type':file.type,'X-CSRF-Token':csrf},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error||'Không tải ảnh lên được.');form.elements.cover_url.value=data.path;renderCover();setDirty();}
 catch(error){message(error.message,true);notifications.error(error.message);}
 finally{input.disabled=false;input.value='';}
});
form.addEventListener('submit',async event=>{
 event.preventDefault();const intent=event.submitter?.value||'draft';
 const post={...(loadedPost||{}),title:form.elements.title.value,slug:form.elements.slug.value,category:'music',
  description:form.elements.description.value,introduction:loadedPost?.introduction||'',instructions:loadedPost?.instructions||'',
  cover_url:form.elements.cover_url.value,images:loadedPost?.images||[],attachment_url:loadedPost?.attachment_url||'',
  drive_file_id:loadedPost?.drive_file_id||'',media_url:loadedPost?.media_url||'',status:intent};
 const body={cms_contract:2,post,drive_file_ids:driveUI.ids(),
  drive_public_file_ids:driveUI.files().filter(file=>file.sharing_confirmed===1&&file.sharing_access==='anyone').map(file=>file.file_id),
  album:{artist:form.elements.artist.value,release_year:form.elements.release_year.value,genre:form.elements.genre.value,
   bundle_file_id:form.elements.bundle_file_id.value,tracks:tracks.map(track=>({...track}))}};
 const buttons=[...form.querySelectorAll('button')],disabled=buttons.map(button=>button.disabled);buttons.forEach(button=>button.disabled=true);
 try{
  const saved=await api(editingId?`/api/admin/music/albums/${editingId}`:'/api/admin/music/albums',{method:editingId?'PUT':'POST',body:JSON.stringify(body)});
  fill(saved);message(`Đã lưu album “${saved.post.title}” ở trạng thái ${saved.post.status}. Chạy export để cập nhật bản tĩnh.`);
  notifications.success(`${saved.post.status==='published'?'Đã xuất bản':'Đã lưu bản nháp'} album: ${saved.post.title}.`);
 }catch(error){message(error.message,true);notifications.error(error.message);}
 finally{buttons.forEach((button,index)=>button.disabled=disabled[index]);}
});
$('#logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:'{}'});dirty=false;location.assign('/login');}catch(error){message(error.message,true);notifications.error(error.message);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
try{
 const session=await api('/api/admin/session');if(session.contentSchemaVersion!==13)throw new Error('Backend đang chạy phiên bản cũ. Khởi động lại IVAN Admin rồi tải lại trình soạn album.');
 csrf=session.csrfToken;$('#admin-email').textContent=session.email;
 const edit=new URLSearchParams(location.search).get('edit'),album=edit?await api(`/api/admin/music/albums/${encodeURIComponent(edit)}`):null;
 if(edit&&!album)throw new Error('Không tìm thấy album.');
 fill(album);form.removeAttribute('inert');
}catch(error){message(error.message,true);notifications.error(error.message);}
